"use client";

import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";

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
