"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { SpreadsheetFormatHelp } from "@/components/scheduler/SpreadsheetFormatHelp";
import { ValidationIssuesTable } from "@/components/scheduler/ValidationIssuesTable";
import { humanizeError } from "@/lib/errors/humanizeError";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";
import { hasLocatedIssues } from "@/lib/spreadsheet/validateClient";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";
import {
  appCardClass,
  appNativeBtnPrimary,
  appNativeBtnSecondary,
} from "@/lib/ui/appChromeStyles";

type SolverDiagnostics = {
  feasible_if_relax?: string[];
  feasible_if_remove_section?: string[];
  feasible_if_remove_instructor?: { instructor_id: string; section_count: number }[];
  diagnosis_truncated?: boolean;
  validation_issue_count?: number;
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

type StoredSolverError = {
  input: SchedulingInput;
  errors: ValidationError[];
  diagnostics?: SolverDiagnostics;
  createdAt: string;
};

import {
  LAST_SOLVER_ERROR_STORAGE_KEY,
} from "@/lib/solver/solverErrorStorage";

function readStoredError(): StoredSolverError | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LAST_SOLVER_ERROR_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSolverError;
  } catch {
    return null;
  }
}

export default function SolverErrorsPage() {
  const router = useRouter();
  const { begin, succeed, fail } = useSolverProgress();
  const [stored, setStored] = useState<StoredSolverError | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [retryStatus, setRetryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    setStored(readStoredError());
    setIsHydrated(true);
  }, []);

  const retryWithRemovedInstructors = async (instructorIds: string[]) => {
    if (!stored?.input) return;
    setRetryStatus("loading");
    setRetryError("");
    begin();
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stored.input,
          remove_instructors: instructorIds,
        }),
      });
      const result = await response.json();
      if (result.status === "ok") {
        localStorage.setItem(
          "wsom-last-solver-run",
          JSON.stringify({
            input: stored.input,
            solution: result,
            createdAt: new Date().toISOString(),
          }),
        );
        succeed();
        router.push("/calendar");
      } else {
        fail();
        setRetryError(
          result.errors?.[0]?.message ??
            "The solver still returned an error after removing those instructors.",
        );
        setRetryStatus("error");
      }
    } catch (err) {
      fail();
      setRetryError(
        err instanceof Error
          ? err.message.includes("fetch")
            ? "Could not reach the scheduling service. Confirm it is running and try again."
            : err.message
          : "Could not reach the scheduling service.",
      );
      setRetryStatus("error");
    }
  };

  const referencedSectionIds = useMemo(() => {
    if (!stored) return [];
    const ids = new Set<string>();
    const sectionIds = stored.input.sections.map((s) => s.id);
    stored.errors.forEach((err) => {
      if (err.sheet === "Sections" && err.row_id) {
        ids.add(err.row_id);
      }
      sectionIds.forEach((id) => {
        if (err.message.includes(id)) ids.add(id);
      });
    });
    (stored.diagnostics?.referenced_sections ?? []).forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [stored]);

  const locatedIssues = useMemo(() => {
    if (!stored) return [];
    return stored.errors.filter((err) => err.sheet || err.row_id || err.field);
  }, [stored]);

  const problematicSections = useMemo(() => {
    if (!stored) return [];
    return stored.input.sections.filter((s) => referencedSectionIds.includes(s.id));
  }, [stored, referencedSectionIds]);

  const sectionById = useMemo(() => {
    if (!stored) return new Map<string, SchedulingInput["sections"][number]>();
    return new Map(stored.input.sections.map((section) => [section.id, section]));
  }, [stored]);

  const instructorById = useMemo(() => {
    if (!stored) return new Map<string, SchedulingInput["instructors"][number]>();
    return new Map(stored.input.instructors.map((instructor) => [instructor.id, instructor]));
  }, [stored]);

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

  const topHumanized = useMemo(() => {
    if (!stored?.errors.length) return null;
    return humanizeError(stored.errors[0], "solver");
  }, [stored]);

  // The first error is already surfaced in the headline card, so only show the
  // "reported issues" card when it adds something: pinpointed rows or extra errors.
  const hasLocated = useMemo(
    () => locatedIssues.length > 0 || hasLocatedIssues(stored?.errors ?? []),
    [locatedIssues, stored],
  );
  const extraErrors = useMemo(() => (stored?.errors ?? []).slice(1), [stored]);
  const showReportedIssuesCard = hasLocated || extraErrors.length > 0;

  // The solver can emit the same section more than once; dedupe so the list is clean.
  const constrainedSections = useMemo(() => {
    const seen = new Set<string>();
    return (stored?.diagnostics?.most_constrained_sections ?? []).filter((x) => {
      if (seen.has(x.section_id)) return false;
      seen.add(x.section_id);
      return true;
    });
  }, [stored]);

  const capacitySections = useMemo(() => {
    const seen = new Set<string>();
    return (stored?.diagnostics?.sections_exceeding_room_capacity ?? []).filter((x) => {
      if (seen.has(x.section_id)) return false;
      seen.add(x.section_id);
      return true;
    });
  }, [stored]);

  const removableSections = useMemo(
    () => Array.from(new Set(stored?.diagnostics?.feasible_if_remove_section ?? [])),
    [stored],
  );

  // Overload/capacity diagnostics are often inflated when cross-listed sections
  // aren't grouped — surface a crosslist check in those cases.
  const showCrosslistTip = useMemo(() => {
    const d = stored?.diagnostics;
    if (!d) return false;
    return (
      capacitySections.length > 0 ||
      (d.feasible_if_remove_instructor ?? []).length > 0 ||
      constrainedSections.length > 0 ||
      (d.busiest_instructors ?? []).length > 0
    );
  }, [stored, capacitySections, constrainedSections]);

  const crosslistTipBullet = (
    <>
      Confirm every cross-listed offering is grouped: in{" "}
      <span className="font-semibold">Editor → Constraints</span>, open the{" "}
      <span className="font-semibold">Cross-list groups</span> table and make sure sections that
      share a room and time are in the same group. In{" "}
      <span className="font-semibold">Editor → Sections</span>, check that each section&apos;s{" "}
      <span className="font-semibold">Crosslist</span> column matches. Missing crosslists can make
      the solver count the same class more than once, so instructors look overloaded or rooms look
      too tight.
    </>
  );

  if (!isHydrated || !stored) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-black text-slate-900">Solver Error Details</h1>
          <p className="mt-2 text-slate-600">
            No solver error snapshot is available yet.
          </p>
          <Link
            href="/editor/sections"
            className="mt-4 inline-flex items-center rounded-lg bg-weatherhead-primary px-4 py-2 font-bold text-white"
          >
            Go to Editor Sections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-red-600" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-red-900">
              {topHumanized?.title ?? "Solver could not complete"}
            </h1>
            {topHumanized ? (
              <>
                <p className="mt-2 text-sm text-red-900">{topHumanized.whatHappened}</p>
                <p className="mt-2 text-sm font-semibold text-red-950">
                  What to do: {topHumanized.howToFix}
                </p>
                {topHumanized.technicalDetail ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-red-800/80 hover:text-red-900">
                      Technical details
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-red-100/60 px-3 py-2 font-mono text-[11px] text-red-900">
                      {topHumanized.technicalDetail}
                      {"\n"}Code: {topHumanized.code}
                    </pre>
                  </details>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-red-800">
                These specific values from your current input caused the solver failure.
              </p>
            )}
          </div>
        </div>
      </div>

      {showReportedIssuesCard ? (
        <div className={`${appCardClass} p-6`}>
          {hasLocated ? (
            <>
              <h2 className="text-lg font-bold text-slate-900">Pinpointed issues</h2>
              <p className="mt-1 text-sm text-slate-600">
                Fix these rows in your spreadsheet or editor, then run Check Data again.
              </p>
              <div className="mt-4">
                <ValidationIssuesTable issues={stored.errors} context="solver" />
              </div>
              <div className="mt-4">
                <SpreadsheetFormatHelp />
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-900">Other issues</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {extraErrors.map((err, index) => {
                  const human = humanizeError(err, "solver");
                  return (
                    <li
                      key={`${err.code}-${index}`}
                      className="rounded-lg border border-slate-200/80 bg-slate-50 p-3"
                    >
                      <div className="font-semibold text-slate-900">{human.title}</div>
                      <p className="mt-1 text-slate-700">{human.whatHappened}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-semibold">How to fix: </span>
                        {human.howToFix}
                      </p>
                      {human.technicalDetail ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">
                            Technical details
                          </summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600">
                            {human.technicalDetail}
                            {"\n"}Code: {human.code}
                          </pre>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {stored.diagnostics && (
        <div className={`${appCardClass} p-6`}>
          <h2 className="text-lg font-bold text-slate-900">How to get a working schedule</h2>
          <p className="mt-1 text-sm text-slate-600">
            The solver couldn&apos;t fit every section. Here are the fixes most likely to help,
            easiest first. Try one, then run the solver again.
          </p>

          {showCrosslistTip ? (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/80 px-4 py-3">
              <p className="text-sm font-bold text-violet-950">Check cross-lists first</p>
              <p className="mt-1 text-sm text-violet-900">{crosslistTipBullet}</p>
            </div>
          ) : null}

          <ol className="mt-5 space-y-4">
            {/* Fix 1: over-capacity sections (usually the clearest root cause) */}
            {capacitySections.length > 0 && (
              <li className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-red-900">
                    Make rooms big enough for these sections
                  </h3>
                </div>
                <p className="mt-2 text-sm text-red-900">
                  These sections need more seats than your largest room can hold, so they can never
                  be placed.
                </p>
                <p className="mt-2 text-sm font-semibold text-red-950">How to fix (do one):</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-900">
                  <li>
                    Lower the enrollment cap: go to{" "}
                    <span className="font-semibold">Editor → Sections</span>, find the section, and
                    reduce its cap to fit an existing room.
                  </li>
                  <li>
                    Or add a bigger room: go to{" "}
                    <span className="font-semibold">Editor → Rooms</span> and add a room with enough
                    capacity.
                  </li>
                </ul>
                <ul className="mt-2 space-y-1 rounded-md bg-white/70 p-2 text-xs text-red-900">
                  {capacitySections.map((x) => (
                    <li key={`capacity-${x.section_id}`}>
                      <span className="font-semibold">{formatSectionLabel(x.section_id)}</span> needs{" "}
                      {x.required_capacity ?? x.expected_enrollment ?? "unknown"} seats — largest
                      room holds {x.max_room_capacity}.
                    </li>
                  ))}
                </ul>
              </li>
            )}

            {/* Fix 2: overloaded instructors */}
            {(stored.diagnostics.feasible_if_remove_instructor ?? []).length > 0 && (
              <li className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white">
                    {capacitySections.length > 0 ? 2 : 1}
                  </span>
                  <h3 className="text-sm font-bold text-amber-900">
                    Ease the load on these instructors
                  </h3>
                </div>
                <p className="mt-2 text-sm text-amber-900">
                  These instructors are assigned more sections than can fit into the times they are
                  available. They&apos;re the biggest reason a schedule can&apos;t be built.
                </p>
                <p className="mt-2 text-sm font-semibold text-amber-950">How to fix (do one):</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  <li>
                    Give them more available times: go to{" "}
                    <span className="font-semibold">Editor → Instructors</span> and remove some of
                    their unavailable times, or allow more meeting patterns.
                  </li>
                  <li>
                    Or move some sections to another instructor: go to{" "}
                    <span className="font-semibold">Editor → Sections</span> and reassign a few of
                    their sections.
                  </li>
                  <li>
                    Or reduce how many sections they teach this term.
                  </li>
                </ul>
                <ul className="mt-2 space-y-1 rounded-md bg-white/70 p-2 text-xs text-amber-900">
                  {stored.diagnostics.feasible_if_remove_instructor?.map((i) => (
                    <li key={`overloaded-${i.instructor_id}`}>
                      <span className="font-semibold">{formatInstructorLabel(i.instructor_id)}</span>{" "}
                      — {i.section_count} section{i.section_count === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-md border border-amber-300 bg-white/60 p-3">
                  <p className="text-xs text-amber-900">
                    <span className="font-bold">Just want to test it?</span> Try building a schedule
                    with these instructors&apos; sections left out. This does not change your data —
                    it only previews whether the rest fits.
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={retryStatus === "loading"}
                      onClick={() => {
                        const ids = stored.diagnostics!.feasible_if_remove_instructor!.map(
                          (i) => i.instructor_id,
                        );
                        retryWithRemovedInstructors(ids);
                      }}
                    >
                      {retryStatus === "loading"
                        ? "Testing..."
                        : `Test without these ${stored.diagnostics.feasible_if_remove_instructor!.length} instructor(s)`}
                    </button>
                    <span className="text-xs text-amber-700">
                      Temporarily leaves out{" "}
                      {stored.diagnostics.feasible_if_remove_instructor!.reduce(
                        (s, i) => s + i.section_count,
                        0,
                      )}{" "}
                      sections
                    </span>
                    {retryStatus === "error" && retryError && (
                      <span className="text-xs font-medium text-red-600">{retryError}</span>
                    )}
                  </div>
                </div>
              </li>
            )}

            {/* Fix 3: loosen specific rules the solver flagged */}
            {(stored.diagnostics.feasible_if_relax ?? []).length > 0 && (
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-500 text-xs font-black text-white">
                    •
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">Loosen a few strict rules</h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  These specific rules are blocking a schedule. Relaxing any of them may be enough.
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">How to fix:</p>
                <p className="mt-1 text-sm text-slate-700">
                  In <span className="font-semibold">Editor → Constraints</span>, review and loosen
                  the rules below (for example, widen allowed days/times or remove an overly tight
                  restriction), then run the solver again.
                </p>
                <ul className="mt-2 space-y-1 rounded-md bg-white/80 p-2 text-xs text-slate-700">
                  {stored.diagnostics.feasible_if_relax?.map((item, index) => (
                    <li key={`relax-${index}`}>{item}</li>
                  ))}
                </ul>
              </li>
            )}

            {/* Fix 4: hard-to-place sections */}
            {constrainedSections.length > 0 && (
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-500 text-xs font-black text-white">
                    •
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Give hard-to-place sections more options
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  These sections have the fewest valid time/room combinations, so they&apos;re the
                  first to fail. Giving them more flexibility often unblocks the whole schedule.
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">How to fix (do one):</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  <li>
                    Allow more meeting patterns for the section in{" "}
                    <span className="font-semibold">Editor → Sections</span>.
                  </li>
                  <li>
                    Loosen its room requirements (for example, don&apos;t require a specific
                    feature) in <span className="font-semibold">Editor → Sections</span>.
                  </li>
                  <li>
                    Free up the instructor&apos;s time in{" "}
                    <span className="font-semibold">Editor → Instructors</span>.
                  </li>
                </ul>
                <ul className="mt-2 space-y-1 rounded-md bg-white/80 p-2 text-xs text-slate-700">
                  {constrainedSections.slice(0, 8).map((x) => (
                    <li key={`constrained-${x.section_id}`}>
                      <span className="font-semibold">{formatSectionLabel(x.section_id)}</span> — only{" "}
                      {x.option_count} valid time/room option{x.option_count === 1 ? "" : "s"}
                      {x.instructor_id
                        ? `, taught by ${formatInstructorLabel(x.instructor_id)}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </li>
            )}

            {/* Fix 5: last resort — remove a section */}
            {removableSections.length > 0 && (
              <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-500 text-xs font-black text-white">
                    •
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Last resort: drop a blocking section
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  If nothing else works, removing one of these sections lets the rest schedule.
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">How to fix:</p>
                <p className="mt-1 text-sm text-slate-700">
                  In <span className="font-semibold">Editor → Sections</span>, archive or delete the
                  section (or move it to a later term), then run the solver again.
                </p>
                <ul className="mt-2 space-y-1 rounded-md bg-white/80 p-2 text-xs text-slate-700">
                  {removableSections.map((sectionId) => (
                    <li key={`remove-${sectionId}`}>
                      <span className="font-semibold">{formatSectionLabel(sectionId)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )}

            {/* Fallback when the solver couldn't pinpoint a specific lever */}
            {capacitySections.length === 0 &&
              (stored.diagnostics.feasible_if_remove_instructor ?? []).length === 0 &&
              (stored.diagnostics.feasible_if_relax ?? []).length === 0 &&
              constrainedSections.length === 0 &&
              removableSections.length === 0 && (
                <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-slate-900">
                    No single fix stood out — try these general steps
                  </h3>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    <li>
                      Run <span className="font-semibold">Check Data</span> in the editor to catch
                      row-level problems (missing rooms, bad IDs, empty fields).
                    </li>
                    <li>
                      In <span className="font-semibold">Editor → Instructors</span>, widen
                      availability for instructors who teach many sections.
                    </li>
                    <li>
                      In <span className="font-semibold">Editor → Sections</span>, allow more meeting
                      patterns and loosen room requirements.
                    </li>
                    <li>
                      In <span className="font-semibold">Editor → Constraints</span>, review{" "}
                      <span className="font-semibold">Cross-list groups</span> and confirm every
                      cross-listed offering is grouped — missing groups can inflate section counts.
                    </li>
                    <li>Then run the solver again.</li>
                  </ol>
                </li>
              )}
          </ol>

          {/* Reference: busiest instructors (context, not an action) */}
          {(stored.diagnostics.busiest_instructors ?? []).length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
                See section counts per instructor
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {stored.diagnostics.busiest_instructors?.slice(0, 8).map((x) => (
                  <li key={`busy-${x.instructor_id}`}>
                    {formatInstructorLabel(x.instructor_id)}: {x.section_count} sections
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
              Technical details
            </summary>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <div>
                <span className="font-semibold text-slate-700">Error codes: </span>
                {(stored.diagnostics.error_codes ?? []).join(", ") || "None"}
              </div>
              {(stored.diagnostics.referenced_sections ?? []).length > 0 ? (
                <div>
                  <span className="font-semibold text-slate-700">Sections flagged: </span>
                  {stored.diagnostics.referenced_sections!
                    .map((sectionId) => formatSectionLabel(sectionId))
                    .join(", ")}
                </div>
              ) : null}
              {stored.diagnostics.diagnosis_truncated ? (
                <p className="text-amber-700">
                  The analysis was shortened to avoid a long wait. Use Check Data for row-level
                  issues, or retry the solver.
                </p>
              ) : null}
            </div>
          </details>
        </div>
      )}

      {problematicSections.length > 0 ? (
        <div className={`${appCardClass} p-6`}>
          <h2 className="text-lg font-bold text-slate-900">Current values for flagged sections</h2>
          <p className="mt-1 text-sm text-slate-600">
            These sections were named in the error above. Here are their current settings so you can
            spot what to change in <span className="font-semibold">Editor → Sections</span>.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2">Instructor</th>
                  <th className="px-3 py-2">Enrollment</th>
                  <th className="px-3 py-2">Allowed Patterns</th>
                  <th className="px-3 py-2">Room Requirements</th>
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
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/editor/sections" className={appNativeBtnPrimary}>
          Go to Editor to fix your data
          <ArrowRight className="size-3.5" />
        </Link>
        <Link href="/calendar" className={appNativeBtnSecondary}>
          Back to Calendar
        </Link>
      </div>
    </div>
  );
}
