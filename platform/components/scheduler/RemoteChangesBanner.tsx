"use client";

import { Button } from "@heroui/button";
import { RefreshCw } from "lucide-react";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

/** Prompt when server data changed without replacing in-memory state. */
export function RemoteChangesBanner() {
  const {
    remoteChangesAvailable,
    hasUnsavedChanges,
    applyRemoteChanges,
    dismissRemoteChanges,
    isSaving,
    saveFeedback,
  } = useSchedulingData();

  if (!remoteChangesAvailable) return null;

  const stackedBelowUnsaved =
    hasUnsavedChanges || saveFeedback?.type === "error" || isSaving;

  return (
    <div
      className={`fixed inset-x-0 z-[39] border-b border-sky-200 bg-sky-50 px-4 py-2.5 sm:px-6 lg:px-8 ${
        stackedBelowUnsaved ? "top-28" : "top-16"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sky-950">
          <span className="font-semibold">Recent edits are available.</span>{" "}
          {hasUnsavedChanges
            ? "Save or discard your changes, then refresh to load updates from the server."
            : "Refresh to see what changed. Updated rows will be highlighted in blue."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="font-semibold text-sky-900"
            onPress={dismissRemoteChanges}
          >
            Not now
          </Button>
          <Button
            size="sm"
            color="primary"
            className="font-semibold"
            startContent={<RefreshCw className="size-3.5" aria-hidden />}
            isLoading={isSaving}
            isDisabled={hasUnsavedChanges}
            onPress={() => void applyRemoteChanges()}
          >
            Refresh data
          </Button>
        </div>
      </div>
    </div>
  );
}
