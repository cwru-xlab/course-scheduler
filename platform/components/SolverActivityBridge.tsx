"use client";

import { useEffect, useRef } from "react";

import { useIslandNotify } from "@/components/GlobalStatusBar";
import { useSolverLock } from "@/lib/solver-lock-client";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";

const STICKY_ID = "solver-remote";

/**
 * App-wide bridge that reflects another user's solver run when the lock poll
 * sees it (best-effort on multi-instance hosts):
 *  - drives the shared progress bar in observer mode, and
 *  - shows an island sticky naming who started the run.
 *
 * The user who started the run drives progress via begin()/succeed()/fail();
 * `isRunningLocally` prevents this bridge from interfering.
 */
export function SolverActivityBridge() {
  const lock = useSolverLock();
  const { isRunningLocally, beginObserved, endObserved } = useSolverProgress();
  const { setSticky, clearSticky } = useIslandNotify();
  const observingRef = useRef(false);

  useEffect(() => {
    const othersRunning = lock.active && !isRunningLocally;
    if (othersRunning && !observingRef.current) {
      observingRef.current = true;
      beginObserved(lock.startedAt);
    } else if (!othersRunning && observingRef.current) {
      observingRef.current = false;
      endObserved();
    }
  }, [lock.active, lock.startedAt, isRunningLocally, beginObserved, endObserved]);

  useEffect(() => {
    if (!lock.active || isRunningLocally) {
      clearSticky(STICKY_ID);
      return;
    }

    setSticky({
      id: STICKY_ID,
      tone: "info",
      priority: 60,
      icon: "loader",
      message: (
        <span>
          {lock.startedBy
            ? `${lock.startedBy} is running the solver…`
            : "Someone is running the solver…"}{" "}
          <span className="font-normal opacity-80">
            The schedule will update for everyone when it finishes.
          </span>
        </span>
      ),
    });
  }, [lock.active, lock.startedBy, isRunningLocally, setSticky, clearSticky]);

  useEffect(() => {
    return () => clearSticky(STICKY_ID);
  }, [clearSticky]);

  return null;
}
