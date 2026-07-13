"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { useSolverLock } from "@/lib/solver-lock-client";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";

/**
 * App-wide bridge that reflects another user's solver run to everyone:
 *  - drives the shared progress bar in "observer" mode while the solver lock
 *    is held by someone else, and
 *  - shows a top banner naming who started the run.
 *
 * The user who actually started the run drives progress via begin()/succeed()
 * themselves; `isRunningLocally` prevents this bridge from interfering.
 */
export function SolverActivityBridge() {
  const lock = useSolverLock();
  const { isRunningLocally, beginObserved, endObserved } = useSolverProgress();
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

  if (!lock.active || isRunningLocally) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-40 border-b border-sky-200/80 bg-sky-50/95 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-sky-950">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span className="font-medium">
          {lock.startedBy
            ? `${lock.startedBy} is running the solver…`
            : "Someone is running the solver…"}{" "}
          <span className="font-normal text-sky-800">
            The schedule will update for everyone when it finishes.
          </span>
        </span>
      </div>
    </div>
  );
}
