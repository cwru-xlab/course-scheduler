"use client";

import { useState } from "react";
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
  };
};

const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";
const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";

export const SolverActionButton = ({ data }: { data: SchedulingInput | null }) => {
  const router = useRouter();
  const [solverStatus, setSolverStatus] = useState<"idle" | "loading">("idle");
  const [solverError, setSolverError] = useState<string | null>(null);

  const runSolver = async () => {
    if (!data) return;
    setSolverStatus("loading");
    setSolverError(null);

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
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
        error instanceof Error ? error.message : "Failed to reach solver API.";
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
        onPress={runSolver}
      >
        Run Solver
      </Button>
      {solverError && (
        <p className="text-xs text-red-600 max-w-md text-right">{solverError}</p>
      )}
    </div>
  );
};
