"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Rocket, XCircle } from "lucide-react";

import { ViewportModal } from "@/components/scheduler/ViewportModal";
import { editorToolbarBtnAccent } from "@/components/scheduler/editors/editorToolbarStyles";
import { humanizedSummary } from "@/lib/errors/humanizeError";
import { useAuth } from "@/lib/auth-client";
import { isSectionArchived } from "@/lib/scheduling/sectionState";
import type {
  ScheduleSolution,
  SchedulingInput,
  ValidationError,
} from "@/lib/scheduling/types";
import { useSolverLock } from "@/lib/solver-lock-client";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";
import { storeSolverErrorSnapshot } from "@/lib/solver/solverErrorStorage";
import {
  enrichSolverErrors,
  formatErrorsSummary,
  normalizeNetworkError,
} from "@/lib/spreadsheet/formatGuide";
import { validateSchedulingInput } from "@/lib/spreadsheet/validateClient";

const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";

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

export const SolverActionButton = ({
  data,
  onErrorChange,
}: {
  data: SchedulingInput | null;
  onErrorChange?: (message: string | null) => void;
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const solverLock = useSolverLock();
  const { begin, succeed, fail, cancelRun, isRunningLocally } = useSolverProgress();
  const [solverStatus, setSolverStatus] = useState<"idle" | "loading">("idle");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const clientAbortRef = useRef<AbortController | null>(null);

  const isMyRun =
    isRunningLocally ||
    (solverLock.active &&
      solverLock.startedByNetworkId !== null &&
      user?.networkId === solverLock.startedByNetworkId);
  const solverBusyRemote = solverLock.active && !isMyRun && solverStatus !== "loading";
  const archivedSectionCount =
    data?.sections.filter((section) => isSectionArchived(section)).length ?? 0;

  const handleCancelSolver = async () => {
    setIsCancelling(true);
    try {
      clientAbortRef.current?.abort();
      await cancelRun();
    } finally {
      setIsCancelling(false);
      setSolverStatus("idle");
    }
  };

  const runSolverConfirmed = async () => {
    setIsConfirmOpen(false);
    await runSolver();
  };

  const runSolver = async () => {
    if (!data) return;
    if (solverBusyRemote) return;
    setSolverStatus("loading");
    onErrorChange?.(null);
    begin();

    try {
      const validation = await validateSchedulingInput(data);
      if (!validation.ok) {
        const summary =
          validation.issueCount === 1
            ? "Found 1 data issue before running the solver."
            : `Found ${validation.issueCount} data issues before running the solver.`;
        if (typeof window !== "undefined") {
          storeSolverErrorSnapshot(data, validation.issues, {
            validation_issue_count: validation.issueCount,
            error_codes: Array.from(new Set(validation.issues.map((issue) => issue.code))),
          });
        }
        fail();
        onErrorChange?.(summary);
        router.push("/solver-errors");
        return;
      }

      const controller = new AbortController();
      clientAbortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 180_000);
      let response: Response;
      try {
        response = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        clientAbortRef.current = null;
      }

      // Cancelled on server (or client abort after cancel)
      if (response.status === 499) {
        fail();
        return;
      }

      const raw = await response.text();
      let result: ApiSuccess | ApiError | null = null;
      try {
        result = JSON.parse(raw) as ApiSuccess | ApiError;
      } catch {
        fail();
        const errors = enrichSolverErrors([
          {
            code: "solver_response_invalid",
            message:
              "The scheduling service returned an unexpected response. Confirm it is running and try again.",
            detail: `HTTP status ${response.status}`,
          },
        ]);
        onErrorChange?.(humanizedSummary(errors, "solver"));
        return;
      }

      if (result.status === "error" && result.errors?.some((e) => e.code === "solver_cancelled")) {
        fail();
        return;
      }

      if (!response.ok || result.status === "error") {
        const enrichedErrors =
          result.status === "error"
            ? enrichSolverErrors(result.errors)
            : enrichSolverErrors([
                { code: "solver_error", message: "Solver failed for this input." },
              ]);
        const nextError = formatErrorsSummary(enrichedErrors, "solver");

        if (typeof window !== "undefined") {
          storeSolverErrorSnapshot(
            data,
            enrichedErrors,
            result?.status === "error" ? result.diagnostics : undefined,
          );
        }
        fail();
        onErrorChange?.(nextError);
        router.push("/solver-errors");
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
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (isAbort) {
        // Cancel or timeout after cancel — don't treat as a user-facing solver failure.
        fail();
        return;
      }
      fail();
      const rawMessage =
        error instanceof Error ? error.message : "Failed to reach solver API.";
      const message = normalizeNetworkError(rawMessage, "solver");
      const enrichedErrors = enrichSolverErrors([{ code: "network_error", message }]);
      if (typeof window !== "undefined" && data) {
        storeSolverErrorSnapshot(data, enrichedErrors);
      }
      onErrorChange?.(formatErrorsSummary(enrichedErrors, "solver"));
    } finally {
      setSolverStatus("idle");
    }
  };

  const showCancel = isMyRun && (solverStatus === "loading" || isRunningLocally);
  const showLoadingRun = solverStatus === "loading" && !showCancel && !solverBusyRemote;

  return (
    <>
      {showCancel ? (
        <Button
          size="sm"
          radius="md"
          variant="light"
          className="h-8 min-h-8 min-w-0 gap-1.5 px-3 text-xs font-semibold tracking-tight shadow-none bg-rose-50 text-rose-700 border border-rose-200 data-[hover=true]:bg-rose-100"
          startContent={<XCircle className="size-3.5" aria-hidden />}
          isLoading={isCancelling}
          onPress={handleCancelSolver}
          isDisabled={isCancelling}
        >
          Cancel Solver
        </Button>
      ) : (
        <Button
          size="sm"
          radius="md"
          variant="light"
          className={editorToolbarBtnAccent}
          startContent={
            showLoadingRun ? undefined : <Rocket className="size-3.5" aria-hidden />
          }
          isLoading={showLoadingRun}
          onPress={() => setIsConfirmOpen(true)}
          isDisabled={!data || solverBusyRemote || solverStatus === "loading"}
          title={
            solverBusyRemote
              ? solverLock.startedBy
                ? `Solver is running (started by ${solverLock.startedBy}). Please wait.`
                : "Solver is running. Please wait."
              : undefined
          }
        >
          {solverBusyRemote
            ? solverLock.startedBy
              ? `Running (${solverLock.startedBy})…`
              : "Solver running…"
            : "Run Solver"}
        </Button>
      )}

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
                  isDisabled={solverStatus === "loading" || solverLock.active}
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
