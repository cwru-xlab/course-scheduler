"use client";

import { useEffect } from "react";

import { useIslandNotify } from "@/components/GlobalStatusBar";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

const STICKY_ID = "unsaved-or-save-error";

/** beforeunload guard + island sticky for unsaved / save failures. */
export function UnsavedChangesGuard() {
  const {
    hasUnsavedChanges,
    isSaving,
    saveFeedback,
    autoSaveEnabled,
    saveToBackend,
  } = useSchedulingData();
  const { setSticky, clearSticky, flash } = useIslandNotify();

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // Transient save success (and warnings) → island flash.
  useEffect(() => {
    if (saveFeedback?.type !== "success") return;
    const warningSuffix =
      saveFeedback.warnings && saveFeedback.warnings.length > 0
        ? ` Warning: ${saveFeedback.warnings.join(" ")}`
        : "";
    flash({
      tone: "success",
      message: `${saveFeedback.message}${warningSuffix}`,
    });
  }, [saveFeedback, flash]);

  useEffect(() => {
    if (saveFeedback?.type === "error") {
      setSticky({
        id: STICKY_ID,
        tone: "error",
        priority: 100,
        icon: "warn",
        message: `Save failed: ${saveFeedback.message}`,
        action: {
          label: "Retry save",
          variant: "warning",
          onPress: () => void saveToBackend({ manual: true }),
        },
      });
      return;
    }

    if (isSaving && hasUnsavedChanges) {
      setSticky({
        id: STICKY_ID,
        tone: "warn",
        priority: 80,
        icon: "upload",
        message: autoSaveEnabled ? "Auto-saving changes…" : "Saving changes…",
      });
      return;
    }

    if (hasUnsavedChanges && !autoSaveEnabled) {
      setSticky({
        id: STICKY_ID,
        tone: "warn",
        priority: 80,
        icon: "warn",
        message: "Unsaved changes — auto-save is off. Click Save to publish edits.",
        action: {
          label: "Save now",
          variant: "warning",
          onPress: () => void saveToBackend({ manual: true }),
        },
      });
      return;
    }

    clearSticky(STICKY_ID);
  }, [
    saveFeedback,
    hasUnsavedChanges,
    isSaving,
    autoSaveEnabled,
    saveToBackend,
    setSticky,
    clearSticky,
  ]);

  useEffect(() => {
    return () => clearSticky(STICKY_ID);
  }, [clearSticky]);

  return null;
}
