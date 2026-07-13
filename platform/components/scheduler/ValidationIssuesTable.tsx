"use client";

import type { ValidationError } from "@/lib/scheduling/types";
import {
  humanizeError,
  severityColorClass,
  severityTextClass,
  type HumanizeContext,
} from "@/lib/errors/humanizeError";

type ValidationIssuesTableProps = {
  issues: ValidationError[];
  maxRows?: number;
  showOverflow?: boolean;
  context?: HumanizeContext;
};

function TechnicalDetails({ detail, code }: { detail: string | null; code: string }) {
  if (!detail && !code) return null;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-700">
        Technical details
      </summary>
      <div className="mt-1 rounded-md bg-slate-100 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-slate-600">
        {detail ? <div>{detail}</div> : null}
        {code ? (
          <div className={detail ? "mt-1 text-slate-500" : undefined}>Code: {code}</div>
        ) : null}
      </div>
    </details>
  );
}

export function ValidationIssuesTable({
  issues,
  maxRows,
  showOverflow = true,
  context = "general",
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
            <th className="px-3 py-2 w-8" aria-label="Severity" />
            {hasLocationColumns ? (
              <>
                <th className="px-3 py-2">Sheet</th>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Field</th>
              </>
            ) : null}
            <th className="px-3 py-2">Issue</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((issue, index) => {
            const human = humanizeError(issue, context);
            return (
              <tr
                key={`${issue.code}-${issue.sheet ?? ""}-${issue.row_id ?? ""}-${issue.field ?? ""}-${index}`}
                className="border-t border-slate-100 align-top"
              >
                <td className="px-3 py-2">
                  <span
                    className={`inline-block size-2.5 rounded-full ${severityColorClass(human.severity)}`}
                    title={human.severity}
                    aria-hidden
                  />
                </td>
                {hasLocationColumns ? (
                  <>
                    <td className="px-3 py-2 font-medium text-slate-900">{issue.sheet ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{issue.row_id ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{issue.field ?? "—"}</td>
                  </>
                ) : null}
                <td className="px-3 py-2">
                  <div className={`font-semibold ${severityTextClass(human.severity)}`}>
                    {human.title}
                  </div>
                  <p className="mt-0.5 text-slate-700">{human.whatHappened}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">How to fix: </span>
                    {human.howToFix}
                  </p>
                  <TechnicalDetails detail={human.technicalDetail} code={human.code} />
                </td>
              </tr>
            );
          })}
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
