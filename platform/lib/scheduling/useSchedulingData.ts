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
import { mergeEditorSaveIntoCalendar } from "./mergeEditorIntoSnapshot";
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
import type { SchedulingDataRevision } from "@/lib/scheduling/dataRevision";

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
  remoteChangeAuthor: string | null;
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
  const [remoteChangeAuthor, setRemoteChangeAuthor] = useState<string | null>(null);
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
  const serverRevisionRef = useRef<SchedulingDataRevision | null>(null);
  const pendingRemoteRevisionRef = useRef<SchedulingDataRevision | null>(null);
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
    (remote: SchedulingInput, revision?: SchedulingDataRevision | null) => {
      const normalized = normalizeCrosslistData(remote);
      serverFingerprintRef.current = fingerprintSchedulingInput(normalized);
      serverRevisionRef.current = revision ?? null;
      pendingRemoteDataRef.current = null;
      pendingRemoteRevisionRef.current = null;
      setRemoteChangesAvailable(false);
      setRemoteChangeAuthor(null);
      dismissedRemoteFingerprintRef.current = null;
    },
    [],
  );

  const isOwnServerRevision = useCallback(
    (revision: SchedulingDataRevision | null | undefined): boolean => {
      const networkId = user?.networkId;
      if (!networkId || !revision) return false;
      return revision.lastModifiedByNetworkId === networkId;
    },
    [user?.networkId],
  );

  const isForeignServerChange = useCallback(
    (
      remote: SchedulingInput,
      remoteFingerprint: string,
      revision?: SchedulingDataRevision | null,
    ): boolean => {
      const baseline = serverFingerprintRef.current;
      if (!baseline || remoteFingerprint === baseline) return false;

      if (isOwnServerRevision(revision)) {
        return false;
      }

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
    [isOwnServerRevision],
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
      pendingRemoteRevisionRef.current = null;
      setRemoteChangesAvailable(false);
      setRemoteChangeAuthor(null);
      dismissedRemoteFingerprintRef.current = null;
    },
    [markRecentChanges],
  );

  const fetchRemoteSnapshot = useCallback(async (): Promise<{
    data: SchedulingInput;
    revision: SchedulingDataRevision | null;
  } | null> => {
    const response = await fetch("/api/data", {
      method: "GET",
      cache: "no-store",
    });
    const result = (await response.json()) as
      | {
          status: "ok";
          data: SchedulingInput;
          meta?: { revision?: SchedulingDataRevision | null };
        }
      | { status: "error"; errors: { code: string; message: string }[] };

    if (!response.ok || result.status !== "ok") {
      throw new Error(
        result.status === "error" && result.errors?.length
          ? result.errors.map((e) => e.message).join(" | ")
          : "Failed to load data.",
      );
    }

    return {
      data: normalizeCrosslistData(result.data),
      revision: result.meta?.revision ?? null,
    };
  }, []);

  const recordOwnServerWrite = useCallback(async () => {
    markOwnServerWrite();
    if (user?.networkId) {
      serverRevisionRef.current = {
        lastModifiedByNetworkId: user.networkId,
        lastModifiedByName: user.name,
        lastModifiedAt: new Date().toISOString(),
      };
    }
    try {
      const remote = await fetchRemoteSnapshot();
      if (remote) syncServerBaselineFromRemote(remote.data, remote.revision);
    } catch {
      /* baseline will catch up on next poll */
    }
  }, [fetchRemoteSnapshot, markOwnServerWrite, syncServerBaselineFromRemote, user]);

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

        applyServerSnapshot(remote.data, {
          changeKind: options?.highlightKind,
          compareWith: dataRef.current,
        });
        serverRevisionRef.current = remote.revision;
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
    if (saveInFlightRef.current) return;
    try {
      const remote = await fetchRemoteSnapshot();
      if (!remote) return;

      const { data: remoteData, revision } = remote;
      const remoteFingerprint = fingerprintSchedulingInput(remoteData);
      const baseline = serverFingerprintRef.current;

      if (!baseline) {
        syncServerBaselineFromRemote(remoteData, revision);
        return;
      }

      if (remoteFingerprint === baseline) {
        pendingRemoteDataRef.current = null;
        pendingRemoteRevisionRef.current = null;
        setRemoteChangesAvailable(false);
        setRemoteChangeAuthor(null);
        return;
      }

      if (!isForeignServerChange(remoteData, remoteFingerprint, revision)) {
        syncServerBaselineFromRemote(remoteData, revision);
        return;
      }

      if (autoRefreshEnabledRef.current && !hasUnsavedChangesRef.current) {
        setIsApplyingRemoteChanges(true);
        try {
          applyServerSnapshot(remoteData, {
            changeKind: "remote",
            compareWith: dataRef.current,
          });
          serverRevisionRef.current = revision;
        } finally {
          setIsApplyingRemoteChanges(false);
        }
        return;
      }

      if (dismissedRemoteFingerprintRef.current === remoteFingerprint) {
        return;
      }

      pendingRemoteDataRef.current = remoteData;
      pendingRemoteRevisionRef.current = revision;
      setRemoteChangeAuthor(revision?.lastModifiedByName ?? null);
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
      serverRevisionRef.current = pendingRemoteRevisionRef.current;
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
    setRemoteChangeAuthor(null);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = () => {
      void checkForRemoteChanges();
    };
    window.addEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    };
  }, [checkForRemoteChanges]);

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
      if (user?.networkId) {
        serverRevisionRef.current = {
          lastModifiedByNetworkId: user.networkId,
          lastModifiedByName: user.name,
          lastModifiedAt: new Date().toISOString(),
        };
      }
      markOwnServerWrite();
      pendingRemoteDataRef.current = null;
      pendingRemoteRevisionRef.current = null;
      setRemoteChangesAvailable(false);
      setRemoteChangeAuthor(null);
      dismissedRemoteFingerprintRef.current = null;
      markRecentChanges(savedKeys, "local");

      const isManualOrAutosaveOff = options?.manual || !autoSaveEnabledRef.current;
      setSaveFeedback({
        type: "success",
        message: isManualOrAutosaveOff ? "Changes saved successfully." : "Saved.",
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
      clearSaveFeedbackSoon(isManualOrAutosaveOff ? 5000 : 2500);

      const dataRevision =
        user?.networkId
          ? {
              lastModifiedByNetworkId: user.networkId,
              lastModifiedByName: user.name ?? user.networkId,
              lastModifiedAt: new Date().toISOString(),
            }
          : undefined;
      void mergeEditorSaveIntoCalendar(beforeSave, dataRevision);

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
  }, [clearSaveFeedbackSoon, markOwnServerWrite, markRecentChanges, user]);

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
    hasUnsavedChangesRef.current = true;
    setData(normalizeCrosslistData(newData));
    setHasUnsavedChanges(true);
    setSaveFeedback(null);
  }, []);

  const updateField = useCallback(
    <K extends keyof SchedulingInput>(field: K, value: SchedulingInput[K]) => {
      hasUnsavedChangesRef.current = true;
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
    remoteChangeAuthor,
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
