"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth-client";
import { useSolverSession } from "@/lib/solver-session-client";

/**
 * Progress UI driven entirely by the server SolverSession (SSE).
 * begin/succeed/fail are no-ops kept for call-site compatibility —
 * the schedule API + session ticker own the real lifecycle.
 */
type SolverProgressContextValue = {
  isRunning: boolean;
  progress: number;
  /** True when THIS user started the current run. */
  isRunningLocally: boolean;
  status: string;
  startedBy: string | null;
  error: string | null;
  cancelRun: () => Promise<boolean>;
  /** @deprecated no-op — server owns progress */
  begin: () => void;
  /** @deprecated no-op — server owns progress */
  succeed: () => void;
  /** @deprecated no-op — server owns progress */
  fail: () => void;
  /** @deprecated no-op */
  beginObserved: (startedAt?: number | null) => void;
  /** @deprecated no-op */
  endObserved: () => void;
  /** @deprecated no-op */
  cancelObserved: () => void;
  /** @deprecated no-op */
  syncFromServer: (serverProgress: number) => void;
  /** @deprecated no-op */
  getProgressPusher: () => ((progress: number) => Promise<void>) | null;
  /** @deprecated no-op */
  setProgressPusher: (pusher: (progress: number) => Promise<void>) => void;
};

const SolverProgressContext = createContext<SolverProgressContextValue | null>(null);

export function SolverProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const session = useSolverSession();

  const isRunning =
    session.locked ||
    session.status === "running" ||
    // Brief completed flash at 100% before idle
    (session.status === "completed" && session.progress >= 100);

  const isRunningLocally =
    session.locked &&
    session.startedByNetworkId != null &&
    user?.networkId === session.startedByNetworkId;

  const noop = useCallback(() => {}, []);
  const noopAsync = useCallback(async () => {}, []);

  const value = useMemo(
    () => ({
      isRunning,
      progress: session.progress,
      isRunningLocally,
      status: session.status,
      startedBy: session.startedBy,
      error: session.error,
      cancelRun: session.cancelRun,
      begin: noop,
      succeed: noop,
      fail: noop,
      beginObserved: noop,
      endObserved: noop,
      cancelObserved: noop,
      syncFromServer: noop,
      getProgressPusher: () => null,
      setProgressPusher: noop,
    }),
    [
      isRunning,
      session.progress,
      isRunningLocally,
      session.status,
      session.startedBy,
      session.error,
      session.cancelRun,
      noop,
      noopAsync,
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
