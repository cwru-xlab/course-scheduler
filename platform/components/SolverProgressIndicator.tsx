"use client";

import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";
import { pageHorizontalInsetRightClassName } from "@/lib/layout/pageGutters";

/** Thin green bar flush against the bottom edge of the sticky topbar. */
export function SolverProgressIndicator() {
  const { isRunning, progress } = useSolverProgress();

  if (!isRunning) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-emerald-100/80"
      aria-hidden
    >
      <div
        className="h-full bg-emerald-500 transition-[width] duration-300 ease-out"
        style={{ width: `${progress}%` }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Solver progress"
      />
    </div>
  );
}

/** Percent label below the topbar, aligned with the user menu on the right. */
export function SolverProgressPercent() {
  const { isRunning, progress } = useSolverProgress();

  if (!isRunning) return null;

  return (
    <span
      className={`pointer-events-none fixed top-16 z-40 mt-0.5 text-[10px] font-semibold tabular-nums text-emerald-600 ${pageHorizontalInsetRightClassName}`}
      aria-live="polite"
    >
      {progress}%
    </span>
  );
}
