import type { ValidationError } from "@/lib/scheduling/types";
import { EXAMPLE_SPREADSHEET_FILENAME } from "@/lib/spreadsheet/formatConstants";

export type ErrorSeverity = "error" | "warning" | "info" | "system";

export type HumanizedError = {
  code: string;
  title: string;
  whatHappened: string;
  howToFix: string;
  severity: ErrorSeverity;
  technicalDetail: string | null;
  sheet?: string;
  row_id?: string;
  field?: string;
};

export type HumanizeContext = "import" | "export" | "solver" | "validation" | "general";

type CatalogEntry = {
  title: string;
  whatHappened: string;
  howToFix: string;
  severity: ErrorSeverity;
};

const CATALOG: Record<string, CatalogEntry> = {
  internal_error: {
    title: "Unexpected scheduling error",
    whatHappened: "The scheduling service hit an unexpected error while processing your request.",
    howToFix:
      "Try again in a moment. If it keeps happening, use Check Data to find spreadsheet issues, or contact your administrator.",
    severity: "system",
  },
  solver_timeout: {
    title: "Solver ran out of time",
    whatHappened: "The solver stopped before it could find a complete schedule.",
    howToFix:
      "Use Check Data to find row-level issues first. You can also relax constraints, reduce locked sections, or try again — the schedule may still be possible with more time.",
    severity: "warning",
  },
  infeasible: {
    title: "No feasible schedule",
    whatHappened: "No schedule satisfies all of your current constraints.",
    howToFix:
      "Review the diagnostics below for sections or instructors to adjust. Unlock some sections, widen meeting patterns, or add rooms/timeslots, then try again.",
    severity: "error",
  },
  no_feasible_options: {
    title: "Section has no valid time slots",
    whatHappened: "At least one section cannot be placed in any allowed room and time combination.",
    howToFix:
      "Open the section in the editor and check its allowed meeting patterns, instructor availability, and room requirements. Add compatible timeslots or relax constraints.",
    severity: "error",
  },
  solver_failed: {
    title: "Solver could not finish",
    whatHappened: "The solver stopped without producing a schedule.",
    howToFix:
      "Try running Check Data, then run the solver again. If the problem persists, relax constraints or contact your administrator.",
    severity: "system",
  },
  solver_busy: {
    title: "Solver is already running",
    whatHappened: "Someone else is running the solver right now, so your request was not started.",
    howToFix: "Wait for the current run to finish, then try again.",
    severity: "info",
  },
  crosslist_capacity: {
    title: "Cross-listed group needs a bigger room",
    whatHappened: "A cross-listed group needs more seats than any allowed room can hold.",
    howToFix:
      "Lower enrollment caps, split the cross-list, or add a larger room that meets the group's requirements.",
    severity: "error",
  },
  network_error: {
    title: "Could not reach the scheduling service",
    whatHappened: "Your browser could not connect to the scheduling service.",
    howToFix:
      "Confirm the scheduling service is running (default port 5001), refresh the page, and try again.",
    severity: "system",
  },
  solver_response_invalid: {
    title: "Scheduling service returned an invalid response",
    whatHappened: "The scheduling service responded, but the reply was not in the expected format.",
    howToFix:
      "The service may have restarted or crashed. Confirm it is running, then try again.",
    severity: "system",
  },
  parse_failed: {
    title: "Spreadsheet could not be read",
    whatHappened: "The uploaded file could not be parsed as a scheduling spreadsheet.",
    howToFix: `Compare your file to ${EXAMPLE_SPREADSHEET_FILENAME} — sheet names, column headers, and delimiter rules must match.`,
    severity: "error",
  },
  invalid_file_type: {
    title: "Wrong file type",
    whatHappened: "The uploaded file is not a supported Excel workbook.",
    howToFix: "Save your spreadsheet as .xlsx (Excel workbook) and upload that file.",
    severity: "error",
  },
  missing_file: {
    title: "No file selected",
    whatHappened: "No spreadsheet file was attached to the upload.",
    howToFix: "Choose an Excel (.xlsx) file and try again.",
    severity: "error",
  },
  export_failed: {
    title: "Export failed",
    whatHappened: "The scheduling service could not generate a spreadsheet from your data.",
    howToFix: "Verify your scheduling data is complete, then try exporting again.",
    severity: "system",
  },
  import_failed: {
    title: "Import failed",
    whatHappened: "The spreadsheet could not be imported into the editor.",
    howToFix: `Check that your file matches ${EXAMPLE_SPREADSHEET_FILENAME}, then try again.`,
    severity: "error",
  },
  notes_parse_failed: {
    title: "Notes could not be read",
    whatHappened: "The scheduling data imported, but the Notes sheet could not be parsed.",
    howToFix: `Open the Notes sheet format in ${EXAMPLE_SPREADSHEET_FILENAME} and fix any formatting issues, then re-import.`,
    severity: "warning",
  },
  validation_failed: {
    title: "Validation check failed",
    whatHappened: "A data check could not be completed.",
    howToFix: "Use Check Data in the editor to find row-level issues, then fix them and try again.",
    severity: "system",
  },
  invalid_request: {
    title: "Invalid request",
    whatHappened: "The request sent to the scheduling service was not valid.",
    howToFix: "Refresh the page and try again. If the problem persists, contact your administrator.",
    severity: "system",
  },
  duplicate_id: {
    title: "Duplicate ID",
    whatHappened: "The same ID appears more than once in a sheet.",
    howToFix: "Give each row a unique ID in that sheet, or remove the duplicate row.",
    severity: "error",
  },
  unknown_instructor: {
    title: "Unknown instructor",
    whatHappened: "A section points to an instructor ID that does not exist.",
    howToFix:
      "Open the Instructors sheet and add the instructor, or change the section to use an existing instructor ID.",
    severity: "error",
  },
  unknown_room: {
    title: "Unknown room",
    whatHappened: "A reference points to a room ID that does not exist.",
    howToFix: "Open the Rooms sheet and add the room, or update the reference to an existing room ID.",
    severity: "error",
  },
  unknown_timeslot: {
    title: "Unknown timeslot",
    whatHappened: "A reference points to a timeslot ID that does not exist.",
    howToFix:
      "Open the Timeslots sheet and add the timeslot, or update the reference to an existing timeslot ID.",
    severity: "error",
  },
  unknown_section: {
    title: "Unknown section",
    whatHappened: "A reference points to a section ID that does not exist.",
    howToFix:
      "Open the Sections sheet and add the section, or update the reference to an existing section ID.",
    severity: "error",
  },
  unknown_meeting_pattern: {
    title: "Unknown meeting pattern",
    whatHappened: "A section references a meeting pattern ID that does not exist.",
    howToFix:
      "Open the MeetingPatterns sheet and add the pattern, or update the section to use an existing pattern ID.",
    severity: "error",
  },
  missing_meeting_patterns: {
    title: "Missing meeting patterns",
    whatHappened: "No meeting patterns are defined in your data.",
    howToFix: "Add at least one meeting pattern on the MeetingPatterns sheet.",
    severity: "error",
  },
  empty_pattern_timeslots: {
    title: "Meeting pattern has no timeslots",
    whatHappened: "A meeting pattern is defined but has no compatible timeslot sets.",
    howToFix: "Open the MeetingPatterns sheet and add compatible timeslot sets for the pattern.",
    severity: "error",
  },
  invalid_crosslist_group: {
    title: "Invalid cross-list group",
    whatHappened: "A cross-list group references sections that are missing or invalid.",
    howToFix: "Open the CrosslistGroups sheet and verify every member section ID exists on the Sections sheet.",
    severity: "error",
  },
  format_reference: {
    title: "Spreadsheet format reminder",
    whatHappened: "Your file may not match the expected spreadsheet layout.",
    howToFix: `Download and compare against ${EXAMPLE_SPREADSHEET_FILENAME} — sheet names, headers, and delimiter rules must match.`,
    severity: "info",
  },
  solver_error: {
    title: "Solver error",
    whatHappened: "The solver returned an error for this scheduling input.",
    howToFix: "Use Check Data to find issues, fix them in the editor or spreadsheet, then run the solver again.",
    severity: "error",
  },
};

function locationHint(error: ValidationError): string {
  const parts: string[] = [];
  if (error.sheet) parts.push(`sheet "${error.sheet}"`);
  if (error.row_id) parts.push(`row "${error.row_id}"`);
  if (error.field) parts.push(`field "${error.field}"`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function locatedHowToFix(error: ValidationError, baseFix: string): string {
  const loc = locationHint(error);
  if (!loc) return baseFix;
  if (error.sheet && error.row_id && error.field) {
    return `Open the ${error.sheet} sheet, find row ${error.row_id}, and fix the ${error.field} column. ${baseFix}`;
  }
  if (error.sheet && error.row_id) {
    return `Open the ${error.sheet} sheet and fix row ${error.row_id}. ${baseFix}`;
  }
  if (error.sheet) {
    return `Check the ${error.sheet} sheet. ${baseFix}`;
  }
  return baseFix;
}

function looksLikeRawTechnicalText(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("traceback") ||
    lowered.includes("keyerror") ||
    lowered.includes("status ") ||
    lowered.includes("non-json") ||
    /^[a-z]+error:/i.test(text) ||
    /\(status \d{3}\)/.test(text)
  );
}

function pickTechnicalDetail(error: ValidationError): string | null {
  if (error.detail?.trim()) return error.detail.trim();
  if (looksLikeRawTechnicalText(error.message)) return error.message.trim();
  return null;
}

function safeUserMessage(error: ValidationError): string {
  const msg = error.message.trim();
  if (!msg) return "Something went wrong with your scheduling data.";
  if (looksLikeRawTechnicalText(msg)) {
    return "The scheduling service reported a technical problem.";
  }
  return msg;
}

export function humanizeError(
  error: ValidationError,
  _context: HumanizeContext = "general",
): HumanizedError {
  const catalog = CATALOG[error.code];
  const technicalDetail = pickTechnicalDetail(error);
  const userMessage = safeUserMessage(error);
  const hasLocation = Boolean(error.sheet || error.row_id || error.field);

  if (catalog) {
    return {
      code: error.code,
      title: catalog.title,
      whatHappened: hasLocation
        ? `${catalog.whatHappened}${locationHint(error)}`
        : userMessage !== catalog.whatHappened && !looksLikeRawTechnicalText(error.message)
          ? userMessage
          : catalog.whatHappened,
      howToFix: locatedHowToFix(error, catalog.howToFix),
      severity: catalog.severity,
      technicalDetail,
      sheet: error.sheet,
      row_id: error.row_id,
      field: error.field,
    };
  }

  return {
    code: error.code,
    title: hasLocation ? "Data issue found" : "Something went wrong",
    whatHappened: userMessage,
    howToFix: locatedHowToFix(
      error,
      `Review your spreadsheet or editor data against ${EXAMPLE_SPREADSHEET_FILENAME}, then try again.`,
    ),
    severity: hasLocation ? "error" : "system",
    technicalDetail: technicalDetail ?? (error.code !== "unknown" ? `Error code: ${error.code}` : null),
    sheet: error.sheet,
    row_id: error.row_id,
    field: error.field,
  };
}

export function humanizeErrors(
  errors: ValidationError[],
  context: HumanizeContext = "general",
): HumanizedError[] {
  return errors.map((error) => humanizeError(error, context));
}

export function humanizedSummary(
  errors: ValidationError[],
  context: HumanizeContext = "general",
): string {
  const humanized = humanizeErrors(errors, context).filter((e) => e.code !== "format_reference");
  if (humanized.length === 0) return "Something went wrong.";
  if (humanized.length === 1) return humanized[0].title;
  return `${humanized.length} issues found — starting with: ${humanized[0].title}`;
}

export function humanizedDetail(
  errors: ValidationError[],
  context: HumanizeContext = "general",
): string {
  return humanizeErrors(errors, context)
    .filter((e) => e.code !== "format_reference")
    .map((e) => `${e.title}\n${e.whatHappened}\nHow to fix: ${e.howToFix}`)
    .join("\n\n");
}

export function severityColorClass(severity: ErrorSeverity): string {
  switch (severity) {
    case "error":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-sky-500";
    case "system":
    default:
      return "bg-slate-500";
  }
}

export function severityTextClass(severity: ErrorSeverity): string {
  switch (severity) {
    case "error":
      return "text-red-800";
    case "warning":
      return "text-amber-900";
    case "info":
      return "text-sky-900";
    case "system":
    default:
      return "text-slate-800";
  }
}
