"use client";

import { useEffect } from "react";
import { AlertTriangle, CloudUpload } from "lucide-react";
import { Button } from "@heroui/button";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

/** Global unsaved-changes banner and browser tab-close warning. */
export function UnsavedChangesGuard() {
  const {
    hasUnsavedChanges,
    isSaving,
    saveFeedback,
    autoSaveEnabled,
    saveToBackend,
  } = useSchedulingData();

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  const showBanner = hasUnsavedChanges || saveFeedback?.type === "error";

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-40 border-b border-amber-200 bg-amber-50 px-4 py-2 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-900">
          {saveFeedback?.type === "error" ? (
            <>
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span className="font-medium">Save failed: {saveFeedback.message}</span>
            </>
          ) : isSaving ? (
            <>
              <CloudUpload className="size-4 shrink-0 animate-pulse" aria-hidden />
              <span className="font-medium">
                {autoSaveEnabled ? "Auto-saving changes…" : "Saving changes…"}
              </span>
            </>
          ) : autoSaveEnabled ? (
            <>
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span className="font-medium">
                Unsaved changes — auto-save will publish them shortly, or click Save now.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span className="font-medium">
                Unsaved changes — auto-save is off. Click Save to publish edits to the server.
              </span>
            </>
          )}
        </div>
        {!isSaving && hasUnsavedChanges && saveFeedback?.type !== "error" && (
          <Button
            size="sm"
            color="warning"
            className="font-semibold"
            onPress={() => void saveToBackend({ manual: true })}
          >
            Save now
          </Button>
        )}
      </div>
    </div>
  );
}
