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

import type { SchedulingInput } from "./types";
import { normalizeCrosslistData } from "./crosslist";

const STORAGE_KEY = "wsom-scheduling-data";
export const SCHEDULING_DATA_REFRESH_EVENT = "wsom-scheduling-data-refresh";
const POLL_INTERVAL_MS = 4000;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    )
    .join(",")}}`;
};

export type SolverLockStatus = {
  active: boolean;
  startedBy: string | null;
  startedAt: number | null;
};

type UseSchedulingDataReturn = {
  data: SchedulingInput | null;
  isLoading: boolean;
  error: string | null;
  isFromLocalStorage: boolean;
  updateData: (newData: SchedulingInput) => void;
  updateField: <K extends keyof SchedulingInput>(
    field: K,
    value: SchedulingInput[K]
  ) => void;
  resetToMockData: () => Promise<void>;
  saveToLocalStorage: () => void;
  hasUnsavedChanges: boolean;
  reloadFromBackend: () => Promise<void>;
  solverLock: SolverLockStatus;
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
  const [solverLock, setSolverLock] = useState<SolverLockStatus>({
    active: false,
    startedBy: null,
    startedAt: null,
  });
  const dataSignatureRef = useRef<string | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Always fetch from the backend (no localStorage cache)
  const loadData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      setError(null);

      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }

      const response = await fetch("/api/data", { method: "GET" });
      const result = (await response.json()) as
        | { status: "ok"; data: SchedulingInput }
        | { status: "error"; errors: { code: string; message: string }[] };

      if (!response.ok || result.status !== "ok") {
        const message =
          result.status === "error" && result.errors?.length
            ? result.errors.map((e) => `${e.code}: ${e.message}`).join(" | ")
            : "Failed to load persisted data.";
        throw new Error(message);
      }

      if (isMounted) {
        const normalized = normalizeCrosslistData(result.data);
        setData(normalized);
        dataSignatureRef.current = stableStringify(normalized);
        setIsFromLocalStorage(false);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      if (isMounted) {
        setError(
          err instanceof Error ? err.message : "Failed to load data.",
        );
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = () => {
      void loadData();
    };
    window.addEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(SCHEDULING_DATA_REFRESH_EVENT, handleRefresh);
    };
  }, [loadData]);

  // Background poll: silently pull in changes made by other users.
  // Skipped while the local editor has unsaved changes, so we don't clobber
  // in-progress edits. Also skipped when the tab is hidden.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const pollLock = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/solver-lock", { cache: "no-store" });
        if (!res.ok) return;
        const state = (await res.json()) as SolverLockStatus;
        if (cancelled) return;
        setSolverLock((prev) =>
          prev.active === state.active &&
          prev.startedBy === state.startedBy &&
          prev.startedAt === state.startedAt
            ? prev
            : state,
        );
      } catch {
        // silent
      }
    };

    const pollOnce = async () => {
      if (cancelled) return;
      void pollLock();
      if (hasUnsavedChangesRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const response = await fetch("/api/data", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = (await response.json()) as
          | { status: "ok"; data: SchedulingInput }
          | { status: "error" };
        if (result.status !== "ok") return;
        if (cancelled) return;
        if (hasUnsavedChangesRef.current) return;
        const normalized = normalizeCrosslistData(result.data);
        const signature = stableStringify(normalized);
        if (signature === dataSignatureRef.current) return;
        dataSignatureRef.current = signature;
        setData(normalized);
      } catch {
        // Silent: transient network errors shouldn't disrupt the user.
      }
    };

    const interval = window.setInterval(pollOnce, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (!document.hidden) void pollOnce();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const saveToLocalStorage = useCallback(() => {
    // no-op: localStorage cache disabled
  }, []);

  // Update entire data object
  const updateData = useCallback((newData: SchedulingInput) => {
    setData(normalizeCrosslistData(newData));
    setHasUnsavedChanges(true);
  }, []);

  // Update a specific field
  const updateField = useCallback(
    <K extends keyof SchedulingInput>(field: K, value: SchedulingInput[K]) => {
      setData((prev) => {
        if (!prev) return prev;
        return normalizeCrosslistData({ ...prev, [field]: value });
      });
      setHasUnsavedChanges(true);
    },
    []
  );

  // Reset to mock data
  const resetToMockData = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsFromLocalStorage(false);
    setHasUnsavedChanges(false);
    await loadData();
  }, [loadData]);

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
    reloadFromBackend: () => loadData(),
    solverLock,
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

