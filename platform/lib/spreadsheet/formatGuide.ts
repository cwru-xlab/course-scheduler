import type { ValidationError } from "@/lib/scheduling/types";
import {
  humanizedDetail,
  humanizedSummary,
  type HumanizeContext,
} from "@/lib/errors/humanizeError";
import {
  EXAMPLE_SPREADSHEET_FILENAME,
  EXAMPLE_SPREADSHEET_PATH,
  FORMAT_COMPARE_HINT,
  FORMAT_RULES_SUMMARY,
  REQUIRED_SHEETS,
} from "@/lib/spreadsheet/formatConstants";

export {
  EXAMPLE_SPREADSHEET_FILENAME,
  EXAMPLE_SPREADSHEET_PATH,
  FORMAT_COMPARE_HINT,
  FORMAT_RULES_SUMMARY,
  REQUIRED_SHEETS,
};

const FORMAT_HINT_CODE = "format_reference";

export function isFetchFailedMessage(message: string): boolean {
  return /fetch failed|failed to fetch|networkerror|network error|etimedout|econnrefused|econnreset|socket hang up|timed out|timeout/i.test(
    message,
  );
}

export function isLikelySpreadsheetFormatIssue(error: ValidationError): boolean {
  const text = `${error.code} ${error.message}`.toLowerCase();
  return (
    error.code === "parse_failed" ||
    error.code === "invalid_file_type" ||
    error.code === "missing_file" ||
    text.includes("invalid headers") ||
    text.includes("missing required sheet") ||
    text.includes("sheet '") ||
    text.includes("missing required value")
  );
}

export function isLikelyDataStructureSolverIssue(errors: ValidationError[]): boolean {
  return errors.some((error) => {
    const text = `${error.code} ${error.message}`.toLowerCase();
    return (
      Boolean(error.sheet || error.row_id || error.field) ||
      error.code === "no_feasible_options" ||
      error.code === "crosslist_capacity" ||
      error.code === "unknown_instructor" ||
      error.code === "unknown_meeting_pattern" ||
      error.code === "unknown_timeslot" ||
      error.code === "unknown_section" ||
      error.code === "unknown_room" ||
      error.code === "duplicate_id" ||
      error.code === "missing_meeting_patterns" ||
      error.code === "internal_error" ||
      text.includes("keyerror") ||
      text.includes("invalid") ||
      text.includes("missing")
    );
  });
}

function formatReferenceError(): ValidationError {
  return {
    code: FORMAT_HINT_CODE,
    message: FORMAT_COMPARE_HINT,
  };
}

export function formatSolverServiceUnavailable(context: "import" | "export" | "solver"): string {
  const action =
    context === "import"
      ? "import your spreadsheet"
      : context === "export"
        ? "export a spreadsheet"
        : "run the solver";

  return (
    `Could not reach the scheduling service to ${action}. ` +
    "Confirm the solver is running (default port 5001). " +
    `If you recently imported a spreadsheet, verify its structure matches ${EXAMPLE_SPREADSHEET_FILENAME} — ` +
    "misaligned sheets, headers, or delimiters can cause the service to fail with a generic network error."
  );
}

export function normalizeNetworkError(
  message: string,
  context: "import" | "export" | "solver",
): string {
  if (isFetchFailedMessage(message)) {
    return formatSolverServiceUnavailable(context);
  }
  return message;
}

export function enrichSpreadsheetErrors(
  errors: ValidationError[],
  context: "import" | "export",
): ValidationError[] {
  const normalized = errors.map((error) => ({
    ...error,
    message:
      error.code === "network_error"
        ? normalizeNetworkError(error.message, context)
        : error.message,
  }));

  const needsFormatHint = normalized.some(isLikelySpreadsheetFormatIssue);
  if (!needsFormatHint) {
    return normalized;
  }

  if (normalized.some((error) => error.code === FORMAT_HINT_CODE)) {
    return normalized;
  }

  return [...normalized, formatReferenceError()];
}

export function enrichSolverErrors(errors: ValidationError[]): ValidationError[] {
  const normalized = errors.map((error) => ({
    ...error,
    message:
      error.code === "network_error"
        ? normalizeNetworkError(error.message, "solver")
        : error.message,
  }));

  const needsFormatHint =
    normalized.some(isLikelySpreadsheetFormatIssue) ||
    isLikelyDataStructureSolverIssue(normalized);

  if (!needsFormatHint) {
    return normalized;
  }

  if (normalized.some((error) => error.code === FORMAT_HINT_CODE)) {
    return normalized;
  }

  return [
    ...normalized,
    {
      code: FORMAT_HINT_CODE,
      message:
        `${FORMAT_COMPARE_HINT} Misaligned spreadsheet data often surfaces as solver failures or generic network errors even when the editor appears to load.`,
    },
  ];
}

export function formatErrorsSummary(
  errors: ValidationError[],
  context: HumanizeContext = "general",
): string {
  const enriched =
    context === "import" || context === "export"
      ? enrichSpreadsheetErrors(errors, context)
      : context === "solver"
        ? enrichSolverErrors(errors)
        : errors;
  return humanizedSummary(enriched, context);
}

export function formatErrorsDetail(
  errors: ValidationError[],
  context: HumanizeContext = "general",
): string {
  const enriched =
    context === "import" || context === "export"
      ? enrichSpreadsheetErrors(errors, context)
      : context === "solver"
        ? enrichSolverErrors(errors)
        : errors;
  return humanizedDetail(enriched, context);
}
