import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

export type ValidateInputResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: ValidationError[]; issueCount: number };

export async function validateSchedulingInput(
  input: SchedulingInput,
): Promise<ValidateInputResult> {
  const response = await fetch("/api/validate-scheduling-input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  const data = (await response.json()) as {
    status?: string;
    issues?: ValidationError[];
    issue_count?: number;
  };

  const issues = Array.isArray(data.issues) ? data.issues : [];
  if (response.ok && data.status === "ok" && issues.length === 0) {
    return { ok: true, issues: [] };
  }

  return {
    ok: false,
    issues,
    issueCount: typeof data.issue_count === "number" ? data.issue_count : issues.length,
  };
}

export function hasLocatedIssues(issues: ValidationError[]): boolean {
  return issues.some((issue) => issue.sheet || issue.row_id || issue.field);
}
