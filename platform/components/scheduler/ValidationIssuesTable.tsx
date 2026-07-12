"use client";

import type { ValidationError } from "@/lib/scheduling/types";

type ValidationIssuesTableProps = {
  issues: ValidationError[];
  maxRows?: number;
  showOverflow?: boolean;
};

export function ValidationIssuesTable({
  issues,
  maxRows,
  showOverflow = true,
}: ValidationIssuesTableProps) {
  const located = issues.filter((issue) => issue.sheet || issue.row_id || issue.field);
  const rows = located.length > 0 ? located : issues;
  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;
  const overflow = maxRows && rows.length > maxRows ? rows.length - maxRows : 0;

  if (displayRows.length === 0) {
    return null;
  }

  const hasLocationColumns = located.length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            {hasLocationColumns ? (
              <>
                <th className="px-3 py-2">Sheet</th>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Field</th>
              </>
            ) : null}
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Message</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((issue, index) => (
            <tr
              key={`${issue.code}-${issue.sheet ?? ""}-${issue.row_id ?? ""}-${issue.field ?? ""}-${index}`}
              className="border-t border-slate-100"
            >
              {hasLocationColumns ? (
                <>
                  <td className="px-3 py-2 font-medium text-slate-900">{issue.sheet ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{issue.row_id ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{issue.field ?? "—"}</td>
                </>
              ) : null}
              <td className="px-3 py-2 font-mono text-xs font-bold text-red-600">{issue.code}</td>
              <td className="px-3 py-2 text-slate-700">{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showOverflow && overflow > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          {overflow} more issue{overflow === 1 ? "" : "s"} not shown.
        </p>
      ) : null}
    </div>
  );
}
