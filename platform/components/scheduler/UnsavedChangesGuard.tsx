"use client";

import { useEffect } from "react";
import { AlertTriangle, CloudUpload } from "lucide-react";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

/** Global unsaved-changes banner and browser tab-close warning. */
export function UnsavedChangesGuard() {
  const { hasUnsavedChanges, isSaving, saveFeedback } = useSchedulingData();

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
      <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-amber-900">
        {saveFeedback?.type === "error" ? (
          <>
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="font-medium">Save failed: {saveFeedback.message}</span>
          </>
        ) : isSaving ? (
          <>
            <CloudUpload className="size-4 shrink-0 animate-pulse" aria-hidden />
            <span className="font-medium">Saving changes…</span>
          </>
        ) : (
          <>
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="font-medium">
              Unsaved changes — auto-saving shortly, or click Save now.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
