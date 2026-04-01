"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";
import {
  PENALTY_COLOR_LEGEND,
  formatPenaltyValue,
  maxNumericPenaltyInBreakdown,
  orderedPenaltyEntries,
  penaltyDescriptionForKey,
  penaltyTitleForKey,
  penaltyValueColor,
} from "@/lib/scheduling/penaltyLabels";
import {
  LAST_SOLVER_RUN_STORAGE_KEY,
  type SolverDiagnostics,
  type StoredSolverError,
  type StoredSolverRun,
  diagnosticsFromRun,
  getLatestSolverSnapshot,
} from "@/lib/scheduling/solverLastSnapshot";

function DiagnosticsSections({
  diagnostics,
  formatSectionLabel,
  formatInstructorLabel,
  retryWithRemovedInstructors,
  retryStatus,
  retryError,
  storedError,
}: {
  diagnostics: SolverDiagnostics;
  formatSectionLabel: (sectionId: string) => string;
  formatInstructorLabel: (instructorId: string) => string;
  retryWithRemovedInstructors?: (instructorIds: string[]) => void;
  retryStatus: "idle" | "loading" | "error";
  retryError: string;
  storedError: StoredSolverError | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold text-slate-900">Diagnostics</h2>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        <div>
          <span className="font-semibold">Feasible if relax:</span>{" "}
          {(diagnostics.feasible_if_relax ?? []).join(", ") || "None"}
        </div>
        <div>
          <span className="font-semibold">Feasible if remove section:</span>{" "}
          {(diagnostics.feasible_if_remove_section ?? []).length
            ? diagnostics.feasible_if_remove_section!
                .map((sectionId) => formatSectionLabel(sectionId))
                .join(", ")
            : "None"}
        </div>
        <div>
          <span className="font-semibold">Feasible if remove instructor:</span>{" "}
          {(diagnostics.feasible_if_remove_instructor ?? []).length
            ? diagnostics.feasible_if_remove_instructor!
                .map((i) => `${formatInstructorLabel(i.instructor_id)} (${i.section_count} sections)`)
                .join(", ")
            : "None"}
        </div>
        {storedError &&
          retryWithRemovedInstructors &&
          (diagnostics.feasible_if_remove_instructor ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                disabled={retryStatus === "loading"}
                onClick={() => {
                  const ids = diagnostics.feasible_if_remove_instructor!.map((i) => i.instructor_id);
                  retryWithRemovedInstructors(ids);
                }}
              >
                {retryStatus === "loading"
                  ? "Solving..."
                  : `Retry without ${diagnostics.feasible_if_remove_instructor!.length} instructor(s)`}
              </button>
              <span className="text-xs text-slate-400">
                Removes{" "}
                {diagnostics.feasible_if_remove_instructor!.reduce((s, i) => s + i.section_count, 0)}{" "}
                sections (
                {diagnostics.feasible_if_remove_instructor!.map((i) =>
                  formatInstructorLabel(i.instructor_id),
                ).join(", ")}
                )
              </span>
              {retryStatus === "error" && retryError && (
                <span className="text-xs font-medium text-red-600">{retryError}</span>
              )}
            </div>
          )}
        <div>
          <span className="font-semibold">Error codes:</span>{" "}
          {(diagnostics.error_codes ?? []).join(", ") || "None"}
        </div>
        <div>
          <span className="font-semibold">Referenced sections:</span>{" "}
          {(diagnostics.referenced_sections ?? []).length
            ? diagnostics
                .referenced_sections!.map((sectionId) => formatSectionLabel(sectionId))
                .join(", ")
            : "None"}
        </div>
      </div>
      {(diagnostics.sections_exceeding_room_capacity ?? []).length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-slate-900">Sections Exceeding All Room Capacities</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {diagnostics.sections_exceeding_room_capacity?.map((x) => (
              <li key={`capacity-${x.section_id}`}>
                {formatSectionLabel(x.section_id)}: required capacity{" "}
                {x.required_capacity ?? x.expected_enrollment ?? "unknown"} &gt; max room capacity{" "}
                {x.max_room_capacity}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(diagnostics.most_constrained_sections ?? []).length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-slate-900">Most Constrained Sections (fewest valid options)</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {diagnostics.most_constrained_sections?.slice(0, 8).map((x) => (
              <li key={`constrained-${x.section_id}`}>
                {formatSectionLabel(x.section_id)} - options: {x.option_count}
                {x.instructor_id ? `, instructor: ${formatInstructorLabel(x.instructor_id)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(diagnostics.busiest_instructors ?? []).length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-slate-900">Busiest Instructors (section count)</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {diagnostics.busiest_instructors?.slice(0, 8).map((x) => (
              <li key={`busy-${x.instructor_id}`}>
                {formatInstructorLabel(x.instructor_id)}: {x.section_count}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function SolverDiagnosticsPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ReturnType<typeof getLatestSolverSnapshot>>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [retryStatus, setRetryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    setSnapshot(getLatestSolverSnapshot());
    setIsHydrated(true);
  }, []);

  const storedError = snapshot?.kind === "error" ? snapshot.error : null;
  const storedSuccess = snapshot?.kind === "success" ? snapshot.run : null;

  const retryWithRemovedInstructors = async (instructorIds: string[]) => {
    if (!storedError?.input) return;
    setRetryStatus("loading");
    setRetryError("");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...storedError.input,
          remove_instructors: instructorIds,
        }),
      });
      const result = await response.json();
      if (result.status === "ok") {
        localStorage.setItem(
          LAST_SOLVER_RUN_STORAGE_KEY,
          JSON.stringify({
            input: storedError.input,
            solution: result,
            ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
            createdAt: new Date().toISOString(),
          }),
        );
        router.push("/calendar");
      } else {
        setRetryError(result.errors?.[0]?.message ?? "Solver still returned an error after removal.");
        setRetryStatus("error");
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Network error");
      setRetryStatus("error");
    }
  };

  const referencedSectionIds = useMemo(() => {
    if (!storedError) return [];
    const ids = new Set<string>();
    const sectionIds = storedError.input.sections.map((s) => s.id);
    storedError.errors.forEach((err) => {
      sectionIds.forEach((id) => {
        if (err.message.includes(id)) ids.add(id);
      });
    });
    return Array.from(ids);
  }, [storedError]);

  const problematicSections = useMemo(() => {
    if (!storedError) return [];
    return storedError.input.sections.filter((s) => referencedSectionIds.includes(s.id));
  }, [storedError, referencedSectionIds]);

  const sectionById = useMemo(() => {
    const input = storedSuccess?.input ?? storedError?.input;
    if (!input) return new Map<string, SchedulingInput["sections"][number]>();
    return new Map(input.sections.map((section) => [section.id, section]));
  }, [storedSuccess, storedError]);

  const instructorById = useMemo(() => {
    const input = storedSuccess?.input ?? storedError?.input;
    if (!input) return new Map<string, SchedulingInput["instructors"][number]>();
    return new Map(input.instructors.map((instructor) => [instructor.id, instructor]));
  }, [storedSuccess, storedError]);

  const formatSectionLabel = (sectionId: string) => {
    const section = sectionById.get(sectionId);
    if (!section) return sectionId;
    const dept = (section.department ?? "").trim();
    const course = String(section.course_id ?? "").trim();
    const code = (section.section_code ?? "").trim();
    return [dept, course, code].filter(Boolean).join(" ");
  };

  const formatInstructorLabel = (instructorId: string) => {
    const instructor = instructorById.get(instructorId);
    if (!instructor) return instructorId;
    return `${instructor.name || instructorId} (${instructorId})`;
  };

  if (!isHydrated) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-500">Loading…</div>
    );
  }

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-black text-slate-900">Solver diagnostics</h1>
          <p className="mt-2 text-slate-600">
            No solver snapshot is available yet. Run the solver from the editor (or the calendar when
            connected), then return here to view scores, penalties, explanations, and engine
            diagnostics.
          </p>
          <Link
            href="/editor/sections"
            className="mt-4 inline-flex items-center rounded-lg bg-weatherhead-primary px-4 py-2 font-bold text-white"
          >
            Go to Editor
          </Link>
        </div>
      </div>
    );
  }

  if (snapshot.kind === "success" && storedSuccess) {
    const sol = storedSuccess.solution;
    const diag = diagnosticsFromRun(storedSuccess);
    const penalties = sol.penalty_breakdown ?? {};
    const explanations = sol.explanations ?? [];
    const penaltyBreakdownRecord = penalties as Record<string, unknown>;
    const maxPenaltyThisRun = maxNumericPenaltyInBreakdown(penaltyBreakdownRecord);

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-black text-emerald-950">Successful solver run</h1>
              <p className="mt-1 text-sm text-emerald-900">
                Snapshot from{" "}
                <time dateTime={storedSuccess.createdAt}>
                  {new Date(storedSuccess.createdAt).toLocaleString()}
                </time>
                . This is the most recent outcome compared to any stored error snapshot.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">Run summary</h2>
          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-500">Total score</dt>
              <dd>{sol.total_score}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Assignments</dt>
              <dd>{sol.assignments?.length ?? 0}</dd>
            </div>
          </dl>
          {Object.keys(penalties).length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">Penalty breakdown</h3>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{PENALTY_COLOR_LEGEND}</p>
              <ul className="mt-3 space-y-2">
                {orderedPenaltyEntries(penaltyBreakdownRecord).map(([key, v]) => {
                  const title = penaltyTitleForKey(key);
                  const description = penaltyDescriptionForKey(key);
                  return (
                    <li
                      key={key}
                      className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-sm"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{title}</div>
                          {description ? (
                            <div className="mt-0.5 text-xs leading-snug text-slate-600">{description}</div>
                          ) : null}
                        </div>
                        <div
                          className="shrink-0 text-right font-mono text-sm font-semibold tabular-nums sm:pt-0.5"
                          style={{ color: penaltyValueColor(v, maxPenaltyThisRun) }}
                        >
                          {formatPenaltyValue(v)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {diag ? (
          <DiagnosticsSections
            diagnostics={diag}
            formatSectionLabel={formatSectionLabel}
            formatInstructorLabel={formatInstructorLabel}
            retryStatus={retryStatus}
            retryError={retryError}
            storedError={null}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            The solver did not attach an extra <strong>diagnostics</strong> object to this successful
            response. If your engine supports it, include the same diagnostic fields on{" "}
            <code className="rounded bg-slate-200 px-1">status: ok</code> payloads to show them here.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/calendar"
            className="inline-flex items-center rounded-lg bg-weatherhead-primary px-4 py-2 font-bold text-white"
          >
            Back to calendar
          </Link>
          <Link
            href="/editor/sections"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-50"
          >
            Editor
          </Link>
        </div>
      </div>
    );
  }

  /* Error snapshot (latest) */
  const err = storedError!;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-red-600" />
          <div>
            <h1 className="text-2xl font-black text-red-900">Solver error</h1>
            <p className="mt-1 text-sm text-red-800">
              Snapshot from{" "}
              <time dateTime={err.createdAt}>{new Date(err.createdAt).toLocaleString()}</time>. This
              is the most recent outcome when it is newer than your last successful run.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Returned errors</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {err.errors.map((e: ValidationError) => (
            <li key={`${e.code}-${e.message}`} className="rounded-lg bg-slate-50 p-3">
              <span className="font-mono text-xs font-bold text-red-600">{e.code}</span>
              <div className="mt-1 text-slate-700">{e.message}</div>
            </li>
          ))}
        </ul>
      </div>

      {err.diagnostics && (
        <DiagnosticsSections
          diagnostics={err.diagnostics}
          formatSectionLabel={formatSectionLabel}
          formatInstructorLabel={formatInstructorLabel}
          retryWithRemovedInstructors={retryWithRemovedInstructors}
          retryStatus={retryStatus}
          retryError={retryError}
          storedError={err}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Problematic section values</h2>
        <p className="mt-1 text-sm text-slate-500">Sections referenced directly in solver error messages.</p>
        {problematicSections.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No explicit section IDs were identified in error messages.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2">Instructor</th>
                  <th className="px-3 py-2">Enrollment</th>
                  <th className="px-3 py-2">Allowed patterns</th>
                  <th className="px-3 py-2">Room requirements</th>
                </tr>
              </thead>
              <tbody>
                {problematicSections.map((section) => (
                  <tr key={section.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{formatSectionLabel(section.id)}</td>
                    <td className="px-3 py-2">{formatInstructorLabel(section.instructor_id)}</td>
                    <td className="px-3 py-2">{section.expected_enrollment}</td>
                    <td className="px-3 py-2">{section.allowed_meeting_patterns.join(", ") || "None"}</td>
                    <td className="px-3 py-2">{section.room_requirements.join(", ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/editor/sections"
          className="inline-flex items-center rounded-lg bg-weatherhead-primary px-4 py-2 font-bold text-white"
        >
          Back to editor to fix data
        </Link>
        <Link
          href="/calendar"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-50"
        >
          Calendar
        </Link>
      </div>
    </div>
  );
}
