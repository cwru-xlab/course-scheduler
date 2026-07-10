"use client";

import { Button } from "@heroui/button";
import { RefreshCw } from "lucide-react";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

/** Prompt when server data changed, or while auto-refresh is applying updates. */
export function RemoteChangesBanner() {
  const {
    remoteChangesAvailable,
    remoteChangeAuthor,
    hasUnsavedChanges,
    applyRemoteChanges,
    dismissRemoteChanges,
    isSaving,
    saveFeedback,
    autoRefreshEnabled,
    isApplyingRemoteChanges,
  } = useSchedulingData();

  const stackedBelowUnsaved =
    hasUnsavedChanges || saveFeedback?.type === "error" || isSaving;

  if (isApplyingRemoteChanges) {
    return (
      <div
        className={`fixed inset-x-0 z-[39] border-b border-sky-200 bg-sky-50 px-4 py-2.5 sm:px-6 lg:px-8 ${
          stackedBelowUnsaved ? "top-28" : "top-16"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-sky-950">
          <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
          <span className="font-medium">Auto-refresh — loading another user&apos;s updates…</span>
        </div>
      </div>
    );
  }

  if (!remoteChangesAvailable) return null;

  return (
    <div
      className={`fixed inset-x-0 z-[39] border-b border-sky-200 bg-sky-50 px-4 py-2.5 sm:px-6 lg:px-8 ${
        stackedBelowUnsaved ? "top-28" : "top-16"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sky-950">
          <span className="font-semibold">
            {remoteChangeAuthor
              ? `Updates from ${remoteChangeAuthor} are available.`
              : "Updates from another user are available."}
          </span>{" "}
          {hasUnsavedChanges ? (
            autoRefreshEnabled ? (
              "Save or discard your edits first — auto-refresh will apply them afterward."
            ) : (
              "Save or discard your edits, then refresh to load updates from the server."
            )
          ) : autoRefreshEnabled ? (
            "Auto-refresh is on but could not apply yet. Refresh now to load updates."
          ) : (
            "Auto-refresh is off — refresh to see what changed. Updated rows will be highlighted in blue."
          )}
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
