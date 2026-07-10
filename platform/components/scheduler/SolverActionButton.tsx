"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Rocket } from "lucide-react";

import { ViewportModal } from "@/components/scheduler/ViewportModal";
import { editorToolbarBtnAccent } from "@/components/scheduler/editors/editorToolbarStyles";
import type {
  ScheduleSolution,
  SchedulingInput,
  ValidationError,
} from "@/lib/scheduling/types";
import { isSectionArchived } from "@/lib/scheduling/sectionState";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";

type ApiSuccess = ScheduleSolution & { status: "ok" };
type ApiError = {
  status: "error";
  errors: ValidationError[];
  diagnostics?: {
    feasible_if_relax?: string[];
    feasible_if_remove_section?: string[];
    feasible_if_remove_instructor?: { instructor_id: string; section_count: number }[];
  };
};

const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";
const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";

export const SolverActionButton = ({
  data,
  onErrorChange,
}: {
  data: SchedulingInput | null;
  onErrorChange?: (message: string | null) => void;
}) => {
  const router = useRouter();
  const { begin, succeed, fail } = useSolverProgress();
  const [solverStatus, setSolverStatus] = useState<"idle" | "loading">("idle");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const archivedSectionCount =
    data?.sections.filter((section) => isSectionArchived(section)).length ?? 0;

  const runSolverConfirmed = async () => {
    setIsConfirmOpen(false);
    await runSolver();
  };

  const runSolver = async () => {
    if (!data) return;
    setSolverStatus("loading");
    onErrorChange?.(null);
    begin();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const raw = await response.text();
      let result: ApiSuccess | ApiError | null = null;
      try {
        result = JSON.parse(raw) as ApiSuccess | ApiError;
      } catch {
        fail();
        const msg = `Schedule API returned non-JSON response (status ${response.status}).`;
        onErrorChange?.(msg);
        return;
      }

      if (!response.ok || result.status === "error") {
        const nextError =
          result.status === "error" && result.errors.length > 0
            ? result.errors.map((err) => err.message).join(" ")
            : "Solver failed for this input.";
        if (result?.status === "error") {
          if (typeof window !== "undefined") {
            localStorage.setItem(
              LAST_SOLVER_ERROR_STORAGE_KEY,
              JSON.stringify({
                input: data,
                errors: result.errors,
                diagnostics: result.diagnostics,
                createdAt: new Date().toISOString(),
              }),
            );
          }
          fail();
          router.push("/solver-errors");
          return;
        }
        fail();
        onErrorChange?.(nextError);
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(
          LAST_SOLVER_RUN_STORAGE_KEY,
          JSON.stringify({
            input: data,
            solution: result,
            createdAt: new Date().toISOString(),
          }),
        );
      }
      succeed();
      router.push("/calendar");
    } catch (error) {
      fail();
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Solver request timed out. The schedule may be too complex — try relaxing constraints."
          : error instanceof Error
            ? error.message
            : "Failed to reach solver API.";
      onErrorChange?.(message);
    } finally {
      setSolverStatus("idle");
    }
  };

  return (
    <>
      <Button
        size="sm"
        radius="md"
        variant="light"
        className={editorToolbarBtnAccent}
        startContent={solverStatus === "idle" ? <Rocket className="size-3.5" aria-hidden /> : undefined}
        isLoading={solverStatus === "loading"}
        onPress={() => setIsConfirmOpen(true)}
        isDisabled={!data || solverStatus === "loading"}
      >
        Run Solver
      </Button>

      <ViewportModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} zIndex={1000}>
        {isConfirmOpen ? (
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="solver-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="solver-confirm-title" className="text-lg font-black text-slate-900">
                Are you sure?
              </h3>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setIsConfirmOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="px-6 py-5 text-sm text-slate-700 space-y-4">
              <p>
                Running the solver will update the calendar for any changes that you may have made in the editor.
                However, it will also re-optimize the schedule alignment, and will overwrite any manual adjustments
                you may have made on the calendar page.
              </p>
              {archivedSectionCount > 0 && (
                <p className="text-amber-800">
                  {archivedSectionCount} archived section
                  {archivedSectionCount === 1 ? "" : "s"} will not be scheduled.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="light" onPress={() => setIsConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  className="font-bold"
                  onPress={runSolverConfirmed}
                  isDisabled={solverStatus === "loading"}
                  isLoading={solverStatus === "loading"}
                >
                  Run Solver
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </ViewportModal>
    </>
  );
};
