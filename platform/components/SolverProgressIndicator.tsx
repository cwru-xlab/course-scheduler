"use client";

import clsx from "clsx";

import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";

/** Thin progress bar flush against the bottom edge of the sticky topbar. */
export function SolverProgressIndicator() {
  const { isRunning, progress } = useSolverProgress();

  if (!isRunning) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1 bg-emerald-950/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
      aria-hidden
    >
      <div
        className="h-full bg-emerald-600 transition-[width] duration-300 ease-out shadow-[0_0_8px_rgba(5,150,105,0.45)]"
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

/** Compact percent badge for the sticky navbar (high contrast, always on top). */
export function SolverProgressBadge({ className }: { className?: string }) {
  const { isRunning, progress } = useSolverProgress();

  if (!isRunning) return null;

  return (
    <div
      className={clsx(
        "flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/90 bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-900 shadow-md ring-1 ring-emerald-100",
        className,
      )}
      aria-live="polite"
      aria-label={`Solver progress ${progress} percent`}
    >
      <span
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
        aria-hidden
      />
      <span>{progress}%</span>
    </div>
  );
}

/**
 * @deprecated Use {@link SolverProgressBadge} inside the navbar instead.
 * Kept for compatibility; renders the same badge without fixed positioning.
 */
export function SolverProgressPercent() {
  return <SolverProgressBadge />;
}
