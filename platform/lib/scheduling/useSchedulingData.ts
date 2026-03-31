"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { SchedulingInput } from "./types";

const STORAGE_KEY = "wsom-scheduling-data";
export const SCHEDULING_DATA_REFRESH_EVENT = "wsom-scheduling-data-refresh";

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
        setData(result.data);
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

  const saveToLocalStorage = useCallback(() => {
    // no-op: localStorage cache disabled
  }, []);

  // Update entire data object
  const updateData = useCallback((newData: SchedulingInput) => {
    setData(newData);
    setHasUnsavedChanges(true);
  }, []);

  // Update a specific field
  const updateField = useCallback(
    <K extends keyof SchedulingInput>(field: K, value: SchedulingInput[K]) => {
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, [field]: value };
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

