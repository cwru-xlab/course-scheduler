"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { ClipboardCheck } from "lucide-react";

import { editorToolbarBtnSecondary } from "@/components/scheduler/editors/editorToolbarStyles";
import type { SchedulingInput } from "@/lib/scheduling/types";
import { validateSchedulingInput } from "@/lib/spreadsheet/validateClient";
import { storeSolverErrorSnapshot } from "@/lib/solver/solverErrorStorage";

export function CheckDataButton({
  data,
  onErrorChange,
}: {
  data: SchedulingInput | null;
  onErrorChange?: (message: string | null) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const checkData = async () => {
    if (!data) return;
    setStatus("loading");
    onErrorChange?.(null);

    try {
      const result = await validateSchedulingInput(data);
      if (result.ok) {
        onErrorChange?.("No structural or feasibility issues found. You can run the solver.");
        return;
      }

      const summary =
        result.issueCount === 1
          ? "Found 1 data issue — see details on the error page."
          : `Found ${result.issueCount} data issues — see details on the error page.`;

      if (typeof window !== "undefined") {
        storeSolverErrorSnapshot(data, result.issues, {
          validation_issue_count: result.issueCount,
          error_codes: Array.from(new Set(result.issues.map((issue) => issue.code))),
        });
      }

      onErrorChange?.(summary);
      router.push("/solver-errors");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to validate scheduling data.";
      onErrorChange?.(message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <Button
      size="sm"
      radius="md"
      variant="light"
      className={editorToolbarBtnSecondary}
      startContent={status === "idle" ? <ClipboardCheck className="size-3.5" aria-hidden /> : undefined}
      isLoading={status === "loading"}
      onPress={() => void checkData()}
      isDisabled={!data || status === "loading"}
    >
      Check Data
    </Button>
  );
}
