import type { ScheduleSolution, SchedulingInput, ValidationError } from "./types";

export const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";
export const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";

export type SolverDiagnostics = {
  feasible_if_relax?: string[];
  feasible_if_remove_section?: string[];
  feasible_if_remove_instructor?: { instructor_id: string; section_count: number }[];
  error_codes?: string[];
  referenced_sections?: string[];
  busiest_instructors?: { instructor_id: string; section_count: number }[];
  sections_exceeding_room_capacity?: {
    section_id: string;
    required_capacity?: number;
    expected_enrollment?: number;
    max_room_capacity: number;
  }[];
  most_constrained_sections?: {
    section_id: string;
    course_id?: string;
    instructor_id?: string;
    option_count: number;
    expected_enrollment?: number;
  }[];
};

export type StoredSolverError = {
  input: SchedulingInput;
  errors: ValidationError[];
  diagnostics?: SolverDiagnostics;
  createdAt: string;
};

/** Persisted after a successful /api/schedule response. */
export type StoredSolverRun = {
  input: SchedulingInput;
  solution: ScheduleSolution & { status?: string; diagnostics?: SolverDiagnostics };
  /** Top-level copy when the API attaches diagnostics alongside the solution. */
  diagnostics?: SolverDiagnostics;
  createdAt: string;
};

export function parseLastSolverRun(): StoredSolverRun | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSolverRun;
  } catch {
    return null;
  }
}

export function parseLastSolverError(): StoredSolverError | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LAST_SOLVER_ERROR_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSolverError;
  } catch {
    return null;
  }
}

export type LatestSolverSnapshot =
  | { kind: "success"; createdAt: string; run: StoredSolverRun }
  | { kind: "error"; createdAt: string; error: StoredSolverError };

/** Most recent solver outcome by `createdAt` (success run vs error snapshot). */
export function getLatestSolverSnapshot(): LatestSolverSnapshot | null {
  const run = parseLastSolverRun();
  const err = parseLastSolverError();
  if (!run && !err) return null;
  if (!err) return { kind: "success", createdAt: run!.createdAt, run: run! };
  if (!run) return { kind: "error", createdAt: err!.createdAt, error: err! };
  const tr = new Date(run.createdAt).getTime();
  const te = new Date(err.createdAt).getTime();
  return tr >= te
    ? { kind: "success", createdAt: run.createdAt, run }
    : { kind: "error", createdAt: err.createdAt, error: err };
}

export function diagnosticsFromRun(run: StoredSolverRun): SolverDiagnostics | undefined {
  return run.diagnostics ?? run.solution?.diagnostics;
}
