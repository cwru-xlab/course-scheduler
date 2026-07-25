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
/** Hold at this value until the solver actually returns (for local animation fallback). */
const PROGRESS_CAP = 92;
const COMPLETE_HOLD_MS = 500;
/** How often to push progress updates to the server (ms). */
const PROGRESS_PUSH_INTERVAL_MS = 1000;

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
  /** Sync progress from server (called by SolverActivityBridge). */
  syncFromServer: (serverProgress: number) => void;
  /** Get a function to push progress to server (for local runs). */
  getProgressPusher: () => ((progress: number) => Promise<void>) | null;
  setProgressPusher: (pusher: (progress: number) => Promise<void>) => void;
};

const SolverProgressContext = createContext<SolverProgressContextValue | null>(null);

export function SolverProgressProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const isRunningLocallyRef = useRef(false);
  const [isRunningLocally, setIsRunningLocally] = useState(false);
  const tickRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);
  const pushTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const progressPusherRef = useRef<((progress: number) => Promise<void>) | null>(null);

  const clearTimers = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (completeTimerRef.current != null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    if (pushTimerRef.current != null) {
      window.clearInterval(pushTimerRef.current);
      pushTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setIsRunning(false);
    setProgress(0);
  }, [clearTimers]);

  const startAnimation = useCallback(
    (startedAt?: number | null, pushToServer = false) => {
      clearTimers();
      startedAtRef.current =
        typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : Date.now();
      setIsRunning(true);
      setProgress((prev) => (prev > 1 ? prev : 1));

      // Local animation tick
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        const t = Math.min(elapsed / ESTIMATED_MAX_MS, 1);
        const next = Math.min(
          PROGRESS_CAP,
          Math.max(1, Math.floor((1 - Math.exp(-2.8 * t)) * PROGRESS_CAP)),
        );
        setProgress((prev) => (next > prev ? next : prev));
      }, 150);

      // Push progress to server periodically (only for local runs)
      if (pushToServer && progressPusherRef.current) {
        const pusher = progressPusherRef.current;
        pushTimerRef.current = window.setInterval(() => {
          const elapsed = Date.now() - startedAtRef.current;
          const t = Math.min(elapsed / ESTIMATED_MAX_MS, 1);
          const currentProgress = Math.min(
            PROGRESS_CAP,
            Math.max(1, Math.floor((1 - Math.exp(-2.8 * t)) * PROGRESS_CAP)),
          );
          void pusher(currentProgress);
        }, PROGRESS_PUSH_INTERVAL_MS);
      }
    },
    [clearTimers],
  );

  const finishToComplete = useCallback(() => {
    clearTimers();
    setProgress(100);
    // Push final progress to server
    if (progressPusherRef.current) {
      void progressPusherRef.current(100);
    }
    completeTimerRef.current = window.setTimeout(reset, COMPLETE_HOLD_MS);
  }, [clearTimers, reset]);

  const begin = useCallback(() => {
    isRunningLocallyRef.current = true;
    setIsRunningLocally(true);
    startAnimation(undefined, true); // Push to server
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
      startAnimation(startedAt, false); // Don't push to server for observed runs
    },
    [startAnimation],
  );

  const endObserved = useCallback(() => {
    if (isRunningLocallyRef.current) return;
    finishToComplete();
  }, [finishToComplete]);

  const syncFromServer = useCallback((serverProgress: number) => {
    // Only sync if we're not running locally (observers sync from server)
    if (isRunningLocallyRef.current) return;
    setProgress((prev) => (serverProgress > prev ? serverProgress : prev));
  }, []);

  const getProgressPusher = useCallback(() => progressPusherRef.current, []);

  const setProgressPusher = useCallback((pusher: (progress: number) => Promise<void>) => {
    progressPusherRef.current = pusher;
  }, []);

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
      syncFromServer,
      getProgressPusher,
      setProgressPusher,
    }),
    [
      isRunning,
      progress,
      isRunningLocally,
      begin,
      succeed,
      fail,
      beginObserved,
      endObserved,
      syncFromServer,
      getProgressPusher,
      setProgressPusher,
    ],
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
