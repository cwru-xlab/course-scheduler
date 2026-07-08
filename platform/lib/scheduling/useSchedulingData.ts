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

const STORAGE_KEY = "wsom-scheduling-data";
export const SCHEDULING_DATA_REFRESH_EVENT = "wsom-scheduling-data-refresh";

const AUTO_SAVE_DELAY_MS = 2000;
const REMOTE_POLL_INTERVAL_MS = 60_000;
const RECENT_HIGHLIGHT_MS = 90_000;

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
  saveToBackend: () => Promise<boolean>;
  confirmLeaveIfUnsaved: () => boolean;
  reloadFromBackend: () => Promise<void>;
  remoteChangesAvailable: boolean;
  applyRemoteChanges: () => Promise<void>;
  dismissRemoteChanges: () => void;
  getRowChangeKind: (rowKey: string) => RecentChangeKind | null;
};

const SchedulingDataContext = createContext<UseSchedulingDataReturn | null>(
  null,
);

const useSchedulingDataInternal = (): UseSchedulingDataReturn => {
  const [data, setData] = useState<SchedulingInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromLocalStorage, setIsFromLocalStorage] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [remoteChangesAvailable, setRemoteChangesAvailable] = useState(false);
  const [recentChanges, setRecentChanges] = useState<
    Map<string, RecentChangeKind>
  >(() => new Map());

  const dataRef = useRef<SchedulingInput | null>(null);
  const serverFingerprintRef = useRef<string | null>(null);
  const pendingRemoteDataRef = useRef<SchedulingInput | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRemoteFingerprintRef = useRef<string | null>(null);
  const savedBaselineRef = useRef<SchedulingInput | null>(null);

  dataRef.current = data;

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
      const localFingerprint = serverFingerprintRef.current;

      if (!localFingerprint) {
        serverFingerprintRef.current = remoteFingerprint;
        return;
      }

      if (remoteFingerprint === localFingerprint) {
        pendingRemoteDataRef.current = null;
        setRemoteChangesAvailable(false);
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
  }, [fetchRemoteSnapshot, isSaving]);

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
      if (hasUnsavedChanges) {
        void checkForRemoteChanges();
        return;
      }
      void applyRemoteChanges();
    };
    window.addEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    };
  }, [applyRemoteChanges, checkForRemoteChanges, hasUnsavedChanges, isSaving]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void checkForRemoteChanges();
    };

    const intervalId = window.setInterval(poll, REMOTE_POLL_INTERVAL_MS);
    const onVisible = () => poll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkForRemoteChanges]);

  const clearSaveFeedbackSoon = useCallback((delayMs = 5000) => {
    if (saveFeedbackTimerRef.current) clearTimeout(saveFeedbackTimerRef.current);
    saveFeedbackTimerRef.current = setTimeout(() => setSaveFeedback(null), delayMs);
  }, []);

  const saveToBackend = useCallback(async (): Promise<boolean> => {
    const current = dataRef.current;
    if (!current) return false;

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return false;
    }

    const beforeSave = normalizeCrosslistData(current);
    const baseline = savedBaselineRef.current;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const result = await persistSchedulingInput(beforeSave);
      if (!result.ok) {
        setSaveFeedback({ type: "error", message: result.message });
        return false;
      }

      const savedKeys = diffSchedulingRowKeys(baseline, beforeSave);
      setHasUnsavedChanges(false);
      savedBaselineRef.current = beforeSave;
      serverFingerprintRef.current = fingerprintSchedulingInput(beforeSave);
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
        void saveToBackend();
      }
    }
  }, [clearSaveFeedbackSoon, markRecentChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges || isSaving) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveToBackend();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [data, hasUnsavedChanges, isSaving, saveToBackend]);

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
