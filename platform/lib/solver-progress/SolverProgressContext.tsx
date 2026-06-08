"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Matches the schedule API / solver timeout budget (ms). */
const ESTIMATED_MAX_MS = 150_000;
/** Hold at this value until the solver actually returns. */
const PROGRESS_CAP = 92;
const COMPLETE_HOLD_MS = 500;

type SolverProgressContextValue = {
  isRunning: boolean;
  progress: number;
  begin: () => void;
  succeed: () => void;
  fail: () => void;
};

const SolverProgressContext = createContext<SolverProgressContextValue | null>(null);

export function SolverProgressProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const tickRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (completeTimerRef.current != null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setIsRunning(false);
    setProgress(0);
  }, [clearTimers]);

  const begin = useCallback(() => {
    clearTimers();
    startedAtRef.current = Date.now();
    setIsRunning(true);
    setProgress(1);
    tickRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const t = Math.min(elapsed / ESTIMATED_MAX_MS, 1);
      const next = Math.min(
        PROGRESS_CAP,
        Math.max(1, Math.floor((1 - Math.exp(-2.8 * t)) * PROGRESS_CAP)),
      );
      setProgress((prev) => (next > prev ? next : prev));
    }, 150);
  }, [clearTimers]);

  const succeed = useCallback(() => {
    clearTimers();
    setProgress(100);
    completeTimerRef.current = window.setTimeout(reset, COMPLETE_HOLD_MS);
  }, [clearTimers, reset]);

  const fail = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(
    () => ({ isRunning, progress, begin, succeed, fail }),
    [isRunning, progress, begin, succeed, fail],
  );

  return (
    <SolverProgressContext.Provider value={value}>{children}</SolverProgressContext.Provider>
  );
}

export function useSolverProgress() {
  const ctx = useContext(SolverProgressContext);
  if (!ctx) {
    throw new Error("useSolverProgress must be used within SolverProgressProvider");
  }
  return ctx;
}
