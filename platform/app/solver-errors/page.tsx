"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

type SolverDiagnostics = {
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

type StoredSolverError = {
  input: SchedulingInput;
  errors: ValidationError[];
  diagnostics?: SolverDiagnostics;
  createdAt: string;
};

const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";

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
        router.push("/calendar");
      } else {
        setRetryError(
          result.errors?.[0]?.message ?? "Solver still returned an error after removal."
        );
        setRetryStatus("error");
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Network error");
      setRetryStatus("error");
    }
  };

  const referencedSectionIds = useMemo(() => {
    if (!stored) return [];
    const ids = new Set<string>();
    const sectionIds = stored.input.sections.map((s) => s.id);
    stored.errors.forEach((err) => {
      sectionIds.forEach((id) => {
        if (err.message.includes(id)) ids.add(id);
      });
    });
    return Array.from(ids);
  }, [stored]);

  const problematicSections = useMemo(() => {
    if (!stored) return [];
    return stored.input.sections.filter((s) => referencedSectionIds.includes(s.id));
  }, [stored, referencedSectionIds]);

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
          <div>
            <h1 className="text-2xl font-black text-red-900">Solver Error Details</h1>
            <p className="mt-1 text-sm text-red-800">
              These specific values from your current input caused the solver failure.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Returned Errors</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {stored.errors.map((err) => (
            <li key={`${err.code}-${err.message}`} className="rounded-lg bg-slate-50 p-3">
              <span className="font-mono text-xs font-bold text-red-600">{err.code}</span>
              <div className="mt-1 text-slate-700">{err.message}</div>
            </li>
          ))}
        </ul>
      </div>

      {stored.diagnostics && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">Diagnostics</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Feasible if relax:</span>{" "}
              {(stored.diagnostics.feasible_if_relax ?? []).join(", ") || "None"}
            </div>
            <div>
              <span className="font-semibold">Feasible if remove section:</span>{" "}
              {(stored.diagnostics.feasible_if_remove_section ?? []).join(", ") || "None"}
            </div>
            <div>
              <span className="font-semibold">Feasible if remove instructor:</span>{" "}
              {(stored.diagnostics.feasible_if_remove_instructor ?? []).length
                ? stored.diagnostics.feasible_if_remove_instructor!.map((i) => `${i.instructor_id} (${i.section_count} sections)`).join(", ")
                : "None"}
            </div>
            {(stored.diagnostics.feasible_if_remove_instructor ?? []).length > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  disabled={retryStatus === "loading"}
                  onClick={() => {
                    const ids = stored.diagnostics!.feasible_if_remove_instructor!.map((i) => i.instructor_id);
                    retryWithRemovedInstructors(ids);
                  }}
                >
                  {retryStatus === "loading" ? "Solving..." : `Retry without ${stored.diagnostics.feasible_if_remove_instructor!.length} instructor(s)`}
                </button>
                <span className="text-xs text-slate-400">
                  Removes {stored.diagnostics.feasible_if_remove_instructor!.reduce((s, i) => s + i.section_count, 0)} sections
                  ({stored.diagnostics.feasible_if_remove_instructor!.map((i) => i.instructor_id).join(", ")})
                </span>
                {retryStatus === "error" && retryError && (
                  <span className="text-xs text-red-600 font-medium">{retryError}</span>
                )}
              </div>
            )}
            <div>
              <span className="font-semibold">Error codes:</span>{" "}
              {(stored.diagnostics.error_codes ?? []).join(", ") || "None"}
            </div>
            <div>
              <span className="font-semibold">Referenced sections:</span>{" "}
              {(stored.diagnostics.referenced_sections ?? []).join(", ") || "None"}
            </div>
          </div>
          {(stored.diagnostics.sections_exceeding_room_capacity ?? []).length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">Sections Exceeding All Room Capacities</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {stored.diagnostics.sections_exceeding_room_capacity?.map((x) => (
                  <li key={`capacity-${x.section_id}`}>
                    {x.section_id}: required capacity{" "}
                    {x.required_capacity ?? x.expected_enrollment ?? "unknown"} &gt; max room capacity{" "}
                    {x.max_room_capacity}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(stored.diagnostics.most_constrained_sections ?? []).length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">Most Constrained Sections (fewest valid options)</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {stored.diagnostics.most_constrained_sections?.slice(0, 8).map((x) => (
                  <li key={`constrained-${x.section_id}`}>
                    {x.section_id} ({x.course_id ?? "unknown course"}) - options: {x.option_count}
                    {x.instructor_id ? `, instructor: ${x.instructor_id}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(stored.diagnostics.busiest_instructors ?? []).length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">Busiest Instructors (section count)</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {stored.diagnostics.busiest_instructors?.slice(0, 8).map((x) => (
                  <li key={`busy-${x.instructor_id}`}>
                    {x.instructor_id}: {x.section_count}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Problematic Section Values</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sections referenced directly in solver error messages.
        </p>
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
                  <th className="px-3 py-2">Allowed Patterns</th>
                  <th className="px-3 py-2">Room Requirements</th>
                </tr>
              </thead>
              <tbody>
                {problematicSections.map((section) => (
                  <tr key={section.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{section.id}</td>
                    <td className="px-3 py-2">{section.instructor_id}</td>
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

      <div>
        <Link
          href="/editor/sections"
          className="inline-flex items-center rounded-lg bg-weatherhead-primary px-4 py-2 font-bold text-white"
        >
          Back to Editor Sections to Fix Data
        </Link>
      </div>
    </div>
  );
}
