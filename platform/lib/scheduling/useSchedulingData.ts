"use client";

import { useCallback, useEffect, useState } from "react";

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
};

export const useSchedulingData = (): UseSchedulingDataReturn => {
  const [data, setData] = useState<SchedulingInput | null>(null);
  const [mockData, setMockData] = useState<SchedulingInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromLocalStorage, setIsFromLocalStorage] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load data on mount
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // First, try to load from localStorage
        const storedData = localStorage.getItem(STORAGE_KEY);

        if (storedData) {
          try {
            const parsed = JSON.parse(storedData) as SchedulingInput;
            if (isMounted) {
              setData(parsed);
              setIsFromLocalStorage(true);
            }
          } catch {
            // Invalid JSON in localStorage, will fall back to mock data
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        // Always fetch mock data as fallback/reference
        const response = await fetch("/api/mock-data", { method: "GET" });
        const result = (await response.json()) as {
          status: "ok" | "error";
          data?: SchedulingInput;
          error?: string;
        };

        if (!response.ok || result.status !== "ok" || !result.data) {
          throw new Error(result.error ?? "Failed to load mock data.");
        }

        if (isMounted) {
          setMockData(result.data);

          // If no localStorage data, use mock data
          if (!storedData) {
            setData(result.data);
            setIsFromLocalStorage(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load data."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

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
    if (mockData) {
      setData(mockData);
      localStorage.removeItem(STORAGE_KEY);
      setIsFromLocalStorage(false);
      setHasUnsavedChanges(false);
    } else {
      // Refetch mock data if not available
      setIsLoading(true);
      try {
        const response = await fetch("/api/mock-data", { method: "GET" });
        const result = (await response.json()) as {
          status: "ok" | "error";
          data?: SchedulingInput;
          error?: string;
        };

        if (!response.ok || result.status !== "ok" || !result.data) {
          throw new Error(result.error ?? "Failed to load mock data.");
        }

        setData(result.data);
        setMockData(result.data);
        localStorage.removeItem(STORAGE_KEY);
        setIsFromLocalStorage(false);
        setHasUnsavedChanges(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reset data.");
      } finally {
        setIsLoading(false);
      }
    }
  }, [mockData]);

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
  };
};
