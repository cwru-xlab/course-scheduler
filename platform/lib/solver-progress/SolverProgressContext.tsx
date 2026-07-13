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
  /** True only when THIS client initiated the run (via begin). */
  isRunningLocally: boolean;
  begin: () => void;
  succeed: () => void;
  fail: () => void;
  /** Drive the progress bar for a run started by ANOTHER user (observer mode). */
  beginObserved: (startedAt?: number | null) => void;
  endObserved: () => void;
};

const SolverProgressContext = createContext<SolverProgressContextValue | null>(null);

export function SolverProgressProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const isRunningLocallyRef = useRef(false);
  const [isRunningLocally, setIsRunningLocally] = useState(false);
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

  const startAnimation = useCallback(
    (startedAt?: number | null) => {
      clearTimers();
      startedAtRef.current =
        typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : Date.now();
      setIsRunning(true);
      setProgress((prev) => (prev > 1 ? prev : 1));
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        const t = Math.min(elapsed / ESTIMATED_MAX_MS, 1);
        const next = Math.min(
          PROGRESS_CAP,
          Math.max(1, Math.floor((1 - Math.exp(-2.8 * t)) * PROGRESS_CAP)),
        );
        setProgress((prev) => (next > prev ? next : prev));
      }, 150);
    },
    [clearTimers],
  );

  const finishToComplete = useCallback(() => {
    clearTimers();
    setProgress(100);
    completeTimerRef.current = window.setTimeout(reset, COMPLETE_HOLD_MS);
  }, [clearTimers, reset]);

  const begin = useCallback(() => {
    isRunningLocallyRef.current = true;
    setIsRunningLocally(true);
    startAnimation();
  }, [startAnimation]);

  const succeed = useCallback(() => {
    isRunningLocallyRef.current = false;
    setIsRunningLocally(false);
    finishToComplete();
  }, [finishToComplete]);

  const fail = useCallback(() => {
    isRunningLocallyRef.current = false;
    setIsRunningLocally(false);
    reset();
  }, [reset]);

  const beginObserved = useCallback(
    (startedAt?: number | null) => {
      // Never override a local run's own progress animation.
      if (isRunningLocallyRef.current) return;
      startAnimation(startedAt);
    },
    [startAnimation],
  );

  const endObserved = useCallback(() => {
    if (isRunningLocallyRef.current) return;
    finishToComplete();
  }, [finishToComplete]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(
    () => ({
      isRunning,
      progress,
      isRunningLocally,
      begin,
      succeed,
      fail,
      beginObserved,
      endObserved,
    }),
    [isRunning, progress, isRunningLocally, begin, succeed, fail, beginObserved, endObserved],
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
