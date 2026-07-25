"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X, XCircle } from "lucide-react";

import { useSolverSession } from "@/lib/solver-session-client";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";

/**
 * App-wide banner reflecting the shared SolverSession.
 * Progress bar is driven by SolverProgressProvider (same SSE state).
 */
export function SolverActivityBridge() {
  const session = useSolverSession();
  const { isRunningLocally } = useSolverProgress();
  const [showCancelledBanner, setShowCancelledBanner] = useState(false);
  const prevStatusRef = useRef(session.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = session.status;

    if (session.status === "cancelled" && prev !== "cancelled") {
      setShowCancelledBanner(true);
    }

    if (session.status === "running" || session.locked) {
      setShowCancelledBanner(false);
    }
  }, [session.status, session.locked]);

  const dismissCancelled = () => setShowCancelledBanner(false);

  if (showCancelledBanner && !session.locked) {
    return (
      <div className="fixed inset-x-0 top-16 z-40 border-b border-amber-200/80 bg-amber-50/95 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-amber-950">
          <XCircle className="size-4 shrink-0" aria-hidden />
          <span className="font-medium flex-1">Solver run was cancelled.</span>
          <button
            type="button"
            onClick={dismissCancelled}
            className="rounded-md p-1 text-amber-800/70 hover:bg-amber-100 hover:text-amber-950 transition-colors"
            aria-label="Dismiss cancellation banner"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  // Initiator already has local UX; only show banner to observers.
  if (!session.locked || isRunningLocally) return null;

  if (session.status === "cancelled") {
    return (
      <div className="fixed inset-x-0 top-16 z-40 border-b border-amber-200/80 bg-amber-50/95 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-amber-950">
          <XCircle className="size-4 shrink-0" aria-hidden />
          <span className="font-medium flex-1">
            {session.startedBy
              ? `${session.startedBy} cancelled the solver run.`
              : "Solver run is being cancelled…"}
          </span>
          <button
            type="button"
            onClick={dismissCancelled}
            className="rounded-md p-1 text-amber-800/70 hover:bg-amber-100 hover:text-amber-950 transition-colors"
            aria-label="Dismiss cancellation banner"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 top-16 z-40 border-b border-sky-200/80 bg-sky-50/95 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-sky-950">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span className="font-medium">
          {session.startedBy
            ? `${session.startedBy} is running the solver…`
            : "Someone is running the solver…"}{" "}
          <span className="font-normal text-sky-800">
            The schedule will update for everyone when it finishes.
          </span>
        </span>
      </div>
    </div>
  );
}
