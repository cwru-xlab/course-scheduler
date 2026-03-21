"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

type SolverDiagnostics = {
  feasible_if_relax?: string[];
  feasible_if_remove_section?: string[];
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
  const stored = useMemo(() => readStoredError(), []);

  const referencedSectionIds = useMemo(() => {
    if (!stored) return [];
    const ids = new Set<string>();
    const sectionIds = stored.input.sections.map((s) => s.id);
    stored.errors.forEach((err) => {
      sectionIds.forEach((id) => {
        if (err.message.includes(id)) ids.add(id);
      });
    });
    return [...ids];
  }, [stored]);

  const problematicSections = useMemo(() => {
    if (!stored) return [];
    return stored.input.sections.filter((s) => referencedSectionIds.includes(s.id));
  }, [stored, referencedSectionIds]);

  if (!stored) {
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
          </div>
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
