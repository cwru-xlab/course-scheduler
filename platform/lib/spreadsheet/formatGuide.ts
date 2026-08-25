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
    "Confirm the solver host is reachable from the web app (SOLVER_URL) and running. " +
    `If you recently imported a spreadsheet, verify its structure matches ${EXAMPLE_SPREADSHEET_FILENAME} — ` +
    "misaligned sheets, headers, or delimiters can cause the service to fail with a generic network error."
  );
}

/** Hostname (no credentials) for diagnostic messages. */
export function solverHostLabel(solverUrl: string): string {
  try {
    const u = new URL(solverUrl);
    return u.host || solverUrl;
  } catch {
    return solverUrl || "unknown";
  }
}

/**
 * Classify Next.js → Flask proxy failures so 502s are diagnosable in the UI
 * (timeout vs refused vs other), without leaking credentials from SOLVER_URL.
 */
export function classifySolverProxyFailure(
  rawMessage: string,
  solverUrl: string,
): { code: string; message: string; detail: string } {
  const host = solverHostLabel(solverUrl);
  const raw = (rawMessage || "Failed to reach scheduling service.").trim();
  const detail = `${raw} (SOLVER_URL host: ${host})`;

  if (/timed out|etimedout|timeout/i.test(raw)) {
    return {
      code: "solver_proxy_timeout",
      message:
        `The scheduling service at ${host} did not respond in time. ` +
        "It may still be solving, overloaded, firewalled from Vercel, or the request exceeded the proxy timeout.",
      detail,
    };
  }
  if (/econnrefused|enotfound|getaddrinfo|ehostunreach|enetunreach/i.test(raw)) {
    return {
      code: "network_error",
      message:
        `Could not connect to the scheduling service at ${host}. ` +
        "Confirm SOLVER_URL points at a reachable solver and that the process is running.",
      detail,
    };
  }
  if (/econnreset|socket hang up/i.test(raw)) {
    return {
      code: "network_error",
      message:
        `The connection to the scheduling service at ${host} was reset. ` +
        "The solver may have crashed or closed the connection mid-request.",
      detail,
    };
  }
  if (isFetchFailedMessage(raw)) {
    return {
      code: "network_error",
      message: formatSolverServiceUnavailable("solver"),
      detail,
    };
  }
  return {
    code: "network_error",
    message: raw,
    detail,
  };
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
      error.code === "network_error" && isFetchFailedMessage(error.message)
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
  const normalized = errors.map((error) => {
    // Preserve already-classified proxy failures (friendly message + technical detail).
    if (error.code === "solver_proxy_timeout") {
      return error;
    }
    if (error.code === "network_error" && error.detail) {
      return error;
    }
    return {
      ...error,
      message:
        error.code === "network_error" && isFetchFailedMessage(error.message)
          ? normalizeNetworkError(error.message, "solver")
          : error.message,
    };
  });

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
