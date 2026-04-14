"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Rocket } from "lucide-react";

import type {
  ScheduleSolution,
  SchedulingInput,
  ValidationError,
} from "@/lib/scheduling/types";

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

export const SolverActionButton = ({ data }: { data: SchedulingInput | null }) => {
  const router = useRouter();
  const [solverStatus, setSolverStatus] = useState<"idle" | "loading">("idle");
  const [solverError, setSolverError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const runSolverConfirmed = async () => {
    setIsConfirmOpen(false);
    await runSolver();
  };

  const runSolver = async () => {
    if (!data) return;
    setSolverStatus("loading");
    setSolverError(null);

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
        setSolverError(
          `Schedule API returned non-JSON response (status ${response.status}).`,
        );
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
          router.push("/solver-errors");
          return;
        }
        setSolverError(nextError);
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
      router.push("/calendar");
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Solver request timed out. The schedule may be too complex — try relaxing constraints."
          : error instanceof Error
            ? error.message
            : "Failed to reach solver API.";
      setSolverError(message);
    } finally {
      setSolverStatus("idle");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="flat"
        className="font-bold border border-weatherhead-primary/25 bg-weatherhead-primary/15 text-weatherhead-primary shadow-sm hover:bg-weatherhead-primary/25"
        startContent={solverStatus === "idle" ? <Rocket className="size-4" /> : undefined}
        isLoading={solverStatus === "loading"}
        onPress={() => setIsConfirmOpen(true)}
        isDisabled={!data || solverStatus === "loading"}
      >
        Run Solver
      </Button>
      {solverError && (
        <p className="text-xs text-red-600 max-w-md text-right">{solverError}</p>
      )}

      {isConfirmOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
            style={{ zIndex: 1000 }}
            role="presentation"
            onClick={() => setIsConfirmOpen(false)}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
};
