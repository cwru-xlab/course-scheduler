"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { persistSchedulingInput } from "./persist";
import type { SchedulingInput } from "./types";
import { normalizeCrosslistData } from "./crosslist";
import { confirmLeaveIfUnsaved } from "./unsavedChanges";
import {
  diffSchedulingRowKeys,
  fingerprintSchedulingInput,
  type RecentChangeKind,
} from "./schedulingDataFingerprint";
import {
  DEFAULT_USER_SYNC_PREFERENCES,
  readUserSyncPreferences,
  writeUserSyncPreferences,
  type UserSyncPreferences,
} from "./syncPreferences";
import { useAuth } from "@/lib/auth-client";

const STORAGE_KEY = "wsom-scheduling-data";
export const SCHEDULING_DATA_REFRESH_EVENT = "wsom-scheduling-data-refresh";

const AUTO_SAVE_DELAY_MS = 2000;
const REMOTE_POLL_INTERVAL_FAST_MS = 4_000;
const REMOTE_POLL_INTERVAL_SLOW_MS = 60_000;
const RECENT_HIGHLIGHT_MS = 90_000;
/** After we write to the server, ignore fingerprint drift briefly (propagation lag). */
const OWN_WRITE_GRACE_MS = 5_000;

export type SaveFeedback = {
  type: "success" | "error";
  message: string;
  warnings?: string[];
};

type UseSchedulingDataReturn = {
  data: SchedulingInput | null;
  isLoading: boolean;
  error: string | null;
  isFromLocalStorage: boolean;
  updateData: (newData: SchedulingInput) => void;
  updateField: <K extends keyof SchedulingInput>(
    field: K,
    value: SchedulingInput[K],
  ) => void;
  resetToMockData: () => Promise<void>;
  saveToLocalStorage: () => void;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  saveFeedback: SaveFeedback | null;
  saveToBackend: (options?: { manual?: boolean }) => Promise<boolean>;
  confirmLeaveIfUnsaved: () => boolean;
  reloadFromBackend: () => Promise<void>;
  remoteChangesAvailable: boolean;
  applyRemoteChanges: () => Promise<void>;
  dismissRemoteChanges: () => void;
  getRowChangeKind: (rowKey: string) => RecentChangeKind | null;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (enabled: boolean) => void;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  isApplyingRemoteChanges: boolean;
  /** Call after this client writes to the server (e.g. calendar save) so auto-refresh ignores it. */
  recordOwnServerWrite: () => Promise<void>;
};

const SchedulingDataContext = createContext<UseSchedulingDataReturn | null>(
  null,
);

const useSchedulingDataInternal = (): UseSchedulingDataReturn => {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<SchedulingInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromLocalStorage, setIsFromLocalStorage] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [remoteChangesAvailable, setRemoteChangesAvailable] = useState(false);
  const [isApplyingRemoteChanges, setIsApplyingRemoteChanges] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(false);
  const [recentChanges, setRecentChanges] = useState<
    Map<string, RecentChangeKind>
  >(() => new Map());

  const dataRef = useRef<SchedulingInput | null>(null);
  const serverFingerprintRef = useRef<string | null>(null);
  const pendingRemoteDataRef = useRef<SchedulingInput | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const pendingSaveManualRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRemoteFingerprintRef = useRef<string | null>(null);
  const savedBaselineRef = useRef<SchedulingInput | null>(null);
  const autoSaveEnabledRef = useRef(false);
  const autoRefreshEnabledRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);
  const ownWriteGraceUntilRef = useRef(0);
  const prefsUserIdRef = useRef<string | null>(null);
  const prefsLoadedForUserRef = useRef<string | null>(null);

  dataRef.current = data;
  autoSaveEnabledRef.current = autoSaveEnabled;
  autoRefreshEnabledRef.current = autoRefreshEnabled;
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  const persistUserSyncPreferences = useCallback(
    (preferences: UserSyncPreferences) => {
      const networkId = user?.networkId;
      if (!networkId) return;
      writeUserSyncPreferences(networkId, preferences);
      void fetch("/api/user-sync-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      }).catch(() => {
        /* local copy remains */
      });
    },
    [user?.networkId],
  );

  useEffect(() => {
    if (authLoading) return;

    const networkId = user?.networkId ?? null;
    if (networkId === prefsUserIdRef.current && prefsLoadedForUserRef.current === networkId) {
      return;
    }
    prefsUserIdRef.current = networkId;

    if (!networkId) {
      prefsLoadedForUserRef.current = null;
      setAutoSaveEnabledState(DEFAULT_USER_SYNC_PREFERENCES.autoSaveEnabled);
      setAutoRefreshEnabledState(DEFAULT_USER_SYNC_PREFERENCES.autoRefreshEnabled);
      return;
    }

    let cancelled = false;
    const localPrefs = readUserSyncPreferences(networkId);
    setAutoSaveEnabledState(localPrefs.autoSaveEnabled);
    setAutoRefreshEnabledState(localPrefs.autoRefreshEnabled);

    void (async () => {
      try {
        const response = await fetch("/api/user-sync-preferences", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          preferences?: Partial<UserSyncPreferences> | null;
          hasSavedPreferences?: boolean;
        };
        if (cancelled || prefsUserIdRef.current !== networkId) return;

        if (payload.hasSavedPreferences && payload.preferences) {
          const merged: UserSyncPreferences = {
            autoSaveEnabled:
              typeof payload.preferences.autoSaveEnabled === "boolean"
                ? payload.preferences.autoSaveEnabled
                : localPrefs.autoSaveEnabled,
            autoRefreshEnabled:
              typeof payload.preferences.autoRefreshEnabled === "boolean"
                ? payload.preferences.autoRefreshEnabled
                : localPrefs.autoRefreshEnabled,
          };
          setAutoSaveEnabledState(merged.autoSaveEnabled);
          setAutoRefreshEnabledState(merged.autoRefreshEnabled);
          writeUserSyncPreferences(networkId, merged);
        } else {
          persistUserSyncPreferences(localPrefs);
        }

        prefsLoadedForUserRef.current = networkId;
      } catch {
        if (!cancelled) prefsLoadedForUserRef.current = networkId;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, persistUserSyncPreferences, user?.networkId]);

  const setAutoSaveEnabled = useCallback(
    (enabled: boolean) => {
      setAutoSaveEnabledState(enabled);
      const preferences: UserSyncPreferences = {
        autoSaveEnabled: enabled,
        autoRefreshEnabled: autoRefreshEnabledRef.current,
      };
      persistUserSyncPreferences(preferences);
    },
    [persistUserSyncPreferences],
  );

  const setAutoRefreshEnabled = useCallback(
    (enabled: boolean) => {
      setAutoRefreshEnabledState(enabled);
      const preferences: UserSyncPreferences = {
        autoSaveEnabled: autoSaveEnabledRef.current,
        autoRefreshEnabled: enabled,
      };
      persistUserSyncPreferences(preferences);
    },
    [persistUserSyncPreferences],
  );

  const markOwnServerWrite = useCallback(() => {
    ownWriteGraceUntilRef.current = Date.now() + OWN_WRITE_GRACE_MS;
  }, []);

  const syncServerBaselineFromRemote = useCallback(
    (remote: SchedulingInput) => {
      const normalized = normalizeCrosslistData(remote);
      serverFingerprintRef.current = fingerprintSchedulingInput(normalized);
      pendingRemoteDataRef.current = null;
      setRemoteChangesAvailable(false);
      dismissedRemoteFingerprintRef.current = null;
    },
    [],
  );

  const isForeignServerChange = useCallback(
    (remote: SchedulingInput, remoteFingerprint: string): boolean => {
      const baseline = serverFingerprintRef.current;
      if (!baseline || remoteFingerprint === baseline) return false;

      if (saveInFlightRef.current || Date.now() < ownWriteGraceUntilRef.current) {
        return false;
      }

      const inMemory = dataRef.current;
      if (inMemory && !hasUnsavedChangesRef.current) {
        const inMemoryFingerprint = fingerprintSchedulingInput(inMemory);
        if (inMemoryFingerprint === remoteFingerprint) {
          return false;
        }
      }

      return true;
    },
    [],
  );

  const markRecentChanges = useCallback(
    (keys: string[], kind: RecentChangeKind) => {
      if (keys.length === 0) return;
      setRecentChanges((prev) => {
        const next = new Map(prev);
        for (const key of keys) next.set(key, kind);
        return next;
      });
      if (recentHighlightTimerRef.current) {
        clearTimeout(recentHighlightTimerRef.current);
      }
      recentHighlightTimerRef.current = setTimeout(() => {
        setRecentChanges(new Map());
      }, RECENT_HIGHLIGHT_MS);
    },
    [],
  );

  const applyServerSnapshot = useCallback(
    (
      next: SchedulingInput,
      opts?: { changeKind?: RecentChangeKind; compareWith?: SchedulingInput | null },
    ) => {
      const normalized = normalizeCrosslistData(next);
      const compareWith = opts?.compareWith ?? dataRef.current;
      if (opts?.changeKind && compareWith) {
        markRecentChanges(
          diffSchedulingRowKeys(compareWith, normalized),
          opts.changeKind,
        );
      }
      setData(normalized);
      setIsFromLocalStorage(false);
      setHasUnsavedChanges(false);
      savedBaselineRef.current = normalized;
      serverFingerprintRef.current = fingerprintSchedulingInput(normalized);
      pendingRemoteDataRef.current = null;
      setRemoteChangesAvailable(false);
      dismissedRemoteFingerprintRef.current = null;
    },
    [markRecentChanges],
  );

  const fetchRemoteSnapshot = useCallback(async (): Promise<SchedulingInput | null> => {
    const response = await fetch("/api/data", {
      method: "GET",
      cache: "no-store",
    });
    const result = (await response.json()) as
      | { status: "ok"; data: SchedulingInput }
      | { status: "error"; errors: { code: string; message: string }[] };

    if (!response.ok || result.status !== "ok") {
      throw new Error(
        result.status === "error" && result.errors?.length
          ? result.errors.map((e) => e.message).join(" | ")
          : "Failed to load data.",
      );
    }

    return normalizeCrosslistData(result.data);
  }, []);

  const recordOwnServerWrite = useCallback(async () => {
    markOwnServerWrite();
    try {
      const remote = await fetchRemoteSnapshot();
      if (remote) syncServerBaselineFromRemote(remote);
    } catch {
      /* baseline will catch up on next poll */
    }
  }, [fetchRemoteSnapshot, markOwnServerWrite, syncServerBaselineFromRemote]);

  const loadData = useCallback(
    async (options?: { silent?: boolean; highlightKind?: RecentChangeKind }) => {
      const silent = options?.silent ?? false;
      let isMounted = true;
      try {
        if (!silent) setIsLoading(true);
        setError(null);

        if (typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_KEY);
        }

        const remote = await fetchRemoteSnapshot();
        if (!remote || !isMounted) return;

        applyServerSnapshot(remote, {
          changeKind: options?.highlightKind,
          compareWith: dataRef.current,
        });
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load data.");
        }
      } finally {
        if (isMounted && !silent) setIsLoading(false);
      }
    },
    [applyServerSnapshot, fetchRemoteSnapshot],
  );

  const checkForRemoteChanges = useCallback(async () => {
    if (isSaving) return;
    try {
      const remote = await fetchRemoteSnapshot();
      if (!remote) return;

      const remoteFingerprint = fingerprintSchedulingInput(remote);
      const baseline = serverFingerprintRef.current;

      if (!baseline) {
        syncServerBaselineFromRemote(remote);
        return;
      }

      if (remoteFingerprint === baseline) {
        pendingRemoteDataRef.current = null;
        setRemoteChangesAvailable(false);
        return;
      }

      if (!isForeignServerChange(remote, remoteFingerprint)) {
        syncServerBaselineFromRemote(remote);
        return;
      }

      if (autoRefreshEnabledRef.current && !hasUnsavedChangesRef.current) {
        setIsApplyingRemoteChanges(true);
        try {
          applyServerSnapshot(remote, {
            changeKind: "remote",
            compareWith: dataRef.current,
          });
        } finally {
          setIsApplyingRemoteChanges(false);
        }
        return;
      }

      if (dismissedRemoteFingerprintRef.current === remoteFingerprint) {
        return;
      }

      pendingRemoteDataRef.current = remote;
      setRemoteChangesAvailable(true);
    } catch {
      /* ignore background poll errors */
    }
  }, [
    applyServerSnapshot,
    fetchRemoteSnapshot,
    isForeignServerChange,
    isSaving,
    syncServerBaselineFromRemote,
  ]);

  const applyRemoteChanges = useCallback(async () => {
    const pending = pendingRemoteDataRef.current;
    if (pending) {
      applyServerSnapshot(pending, {
        changeKind: "remote",
        compareWith: dataRef.current,
      });
      return;
    }
    await loadData({ silent: true, highlightKind: "remote" });
  }, [applyServerSnapshot, loadData]);

  const dismissRemoteChanges = useCallback(() => {
    const pending = pendingRemoteDataRef.current;
    if (pending) {
      dismissedRemoteFingerprintRef.current = fingerprintSchedulingInput(pending);
    }
    setRemoteChangesAvailable(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = () => {
      if (isSaving) return;
      void checkForRemoteChanges();
    };
    window.addEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    };
  }, [checkForRemoteChanges, isSaving]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void checkForRemoteChanges();
    };

    const intervalMs = autoRefreshEnabled
      ? REMOTE_POLL_INTERVAL_FAST_MS
      : REMOTE_POLL_INTERVAL_SLOW_MS;

    void poll();
    const intervalId = window.setInterval(poll, intervalMs);
    const onVisible = () => poll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRefreshEnabled, checkForRemoteChanges]);

  const clearSaveFeedbackSoon = useCallback((delayMs = 5000) => {
    if (saveFeedbackTimerRef.current) clearTimeout(saveFeedbackTimerRef.current);
    saveFeedbackTimerRef.current = setTimeout(() => setSaveFeedback(null), delayMs);
  }, []);

  const saveToBackend = useCallback(async (options?: { manual?: boolean }): Promise<boolean> => {
    const current = dataRef.current;
    if (!current) return false;

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      if (options?.manual) pendingSaveManualRef.current = true;
      return false;
    }

    const beforeSave = normalizeCrosslistData(current);
    const baseline = savedBaselineRef.current;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const result = await persistSchedulingInput(beforeSave, {
        manualActivity: options?.manual,
      });
      if (!result.ok) {
        setSaveFeedback({ type: "error", message: result.message });
        return false;
      }

      const savedKeys = diffSchedulingRowKeys(baseline, beforeSave);
      setHasUnsavedChanges(false);
      savedBaselineRef.current = beforeSave;
      serverFingerprintRef.current = fingerprintSchedulingInput(beforeSave);
      markOwnServerWrite();
      pendingRemoteDataRef.current = null;
      setRemoteChangesAvailable(false);
      dismissedRemoteFingerprintRef.current = null;
      markRecentChanges(savedKeys, "local");

      setSaveFeedback({
        type: "success",
        message: "Changes saved successfully.",
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
      clearSaveFeedbackSoon();
      return true;
    } catch (err) {
      setSaveFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save changes.",
      });
      return false;
    } finally {
      setIsSaving(false);
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        const manual = pendingSaveManualRef.current;
        pendingSaveManualRef.current = false;
        void saveToBackend(manual ? { manual: true } : undefined);
      }
    }
  }, [clearSaveFeedbackSoon, markOwnServerWrite, markRecentChanges]);

  useEffect(() => {
    if (!autoSaveEnabled || !hasUnsavedChanges || isSaving) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveToBackend();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSaveEnabled, data, hasUnsavedChanges, isSaving, saveToBackend]);

  const saveToLocalStorage = useCallback(() => {}, []);

  const updateData = useCallback((newData: SchedulingInput) => {
    setData(normalizeCrosslistData(newData));
    setHasUnsavedChanges(true);
    setSaveFeedback(null);
  }, []);

  const updateField = useCallback(
    <K extends keyof SchedulingInput>(field: K, value: SchedulingInput[K]) => {
      setData((prev) => {
        if (!prev) return prev;
        return normalizeCrosslistData({ ...prev, [field]: value });
      });
      setHasUnsavedChanges(true);
      setSaveFeedback(null);
    },
    [],
  );

  const resetToMockData = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsFromLocalStorage(false);
    setHasUnsavedChanges(false);
    setSaveFeedback(null);
    await loadData();
  }, [loadData]);

  const confirmLeave = useCallback(() => {
    return confirmLeaveIfUnsaved(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  const getRowChangeKind = useCallback(
    (rowKey: string) => recentChanges.get(rowKey) ?? null,
    [recentChanges],
  );

  return {
    data,
    isLoading,
    error,
    isFromLocalStorage,
    updateData,
    updateField,
    resetToMockData,
    saveToLocalStorage,
    hasUnsavedChanges,
    isSaving,
    saveFeedback,
    saveToBackend,
    confirmLeaveIfUnsaved: confirmLeave,
    reloadFromBackend: () => loadData({ highlightKind: "remote" }),
    remoteChangesAvailable,
    applyRemoteChanges,
    dismissRemoteChanges,
    getRowChangeKind,
    autoSaveEnabled,
    setAutoSaveEnabled,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    isApplyingRemoteChanges,
    recordOwnServerWrite,
  };
};

export const SchedulingDataProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const value = useSchedulingDataInternal();
  return React.createElement(
    SchedulingDataContext.Provider,
    { value },
    children,
  );
};

export const useSchedulingData = (): UseSchedulingDataReturn => {
  const ctx = useContext(SchedulingDataContext);
  if (!ctx) {
    throw new Error("useSchedulingData must be used within SchedulingDataProvider");
  }
  return ctx;
};
