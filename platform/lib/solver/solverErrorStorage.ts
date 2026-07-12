import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";
import { enrichSolverErrors, normalizeNetworkError } from "@/lib/spreadsheet/formatGuide";

export const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";

type SolverErrorPayload = {
  input: SchedulingInput;
  errors: ValidationError[];
  diagnostics?: unknown;
  createdAt: string;
};

export function storeSolverErrorSnapshot(
  input: SchedulingInput,
  errors: ValidationError[],
  diagnostics?: unknown,
): void {
  if (typeof window === "undefined") return;
  const payload: SolverErrorPayload = {
    input,
    errors: enrichSolverErrors(errors),
    diagnostics,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(LAST_SOLVER_ERROR_STORAGE_KEY, JSON.stringify(payload));
}

export function storeSolverNetworkError(input: SchedulingInput, rawMessage: string): ValidationError[] {
  const message = normalizeNetworkError(rawMessage, "solver");
  const errors = enrichSolverErrors([{ code: "network_error", message }]);
  storeSolverErrorSnapshot(input, errors);
  return errors;
}
