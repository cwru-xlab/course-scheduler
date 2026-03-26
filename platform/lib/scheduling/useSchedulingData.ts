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

  // Load data on mount
  const loadData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      setError(null);

      // If there's a saved draft in localStorage, prefer that so unsaved edits
      // survive a full page refresh until the backend is explicitly updated.
      if (typeof window !== "undefined") {
        const draftRaw = localStorage.getItem(STORAGE_KEY);
        if (draftRaw) {
          try {
            const draft = JSON.parse(draftRaw) as SchedulingInput;
            if (isMounted) {
              setData(draft);
              setIsFromLocalStorage(true);
              setHasUnsavedChanges(false);
            }
            return;
          } catch {
            // Corrupt draft; fall through to backend fetch.
          }
        }
      }

      // Primary source: backend persisted data
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
        if (typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_KEY);
        }
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

  // Save to localStorage
  const saveToLocalStorage = useCallback(() => {
    if (data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setIsFromLocalStorage(true);
      setHasUnsavedChanges(false);
    }
  }, [data]);

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
    // Legacy: keep behavior but simply clear local storage drafts.
    localStorage.removeItem(STORAGE_KEY);
    setIsFromLocalStorage(false);
    setHasUnsavedChanges(false);
    // Reload from backend
    await loadData();
  }, [loadData]);

  // Auto-save to localStorage when data changes
  useEffect(() => {
    if (data && hasUnsavedChanges) {
      const timeoutId = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setIsFromLocalStorage(true);
        setHasUnsavedChanges(false);
      }, 500); // Debounce saves by 500ms

      return () => clearTimeout(timeoutId);
    }
  }, [data, hasUnsavedChanges]);

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

