"use client";

import { useEffect } from "react";

import { useIslandNotify } from "@/components/GlobalStatusBar";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

const STICKY_ID = "remote-changes";

/** Island sticky when server data changed, or while auto-refresh is applying. */
export function RemoteChangesBanner() {
  const {
    remoteChangesAvailable,
    remoteChangeAuthor,
    hasUnsavedChanges,
    applyRemoteChanges,
    dismissRemoteChanges,
    isSaving,
    autoRefreshEnabled,
    isApplyingRemoteChanges,
  } = useSchedulingData();
  const { setSticky, clearSticky } = useIslandNotify();

  useEffect(() => {
    if (isApplyingRemoteChanges) {
      setSticky({
        id: STICKY_ID,
        tone: "info",
        priority: 70,
        icon: "refresh",
        message: "Auto-refresh — loading another user's updates…",
      });
      return;
    }

    if (!remoteChangesAvailable) {
      clearSticky(STICKY_ID);
      return;
    }

    const who = remoteChangeAuthor
      ? `Updates from ${remoteChangeAuthor} are available.`
      : "Updates from another user are available.";

    let detail: string;
    if (hasUnsavedChanges) {
      detail = autoRefreshEnabled
        ? "Save or discard your edits first — auto-refresh will apply them afterward."
        : "Save or discard your edits, then refresh to load updates.";
    } else if (autoRefreshEnabled) {
      detail = "Auto-refresh is on but could not apply yet. Refresh now to load updates.";
    } else {
      detail = "Auto-refresh is off — refresh to see what changed.";
    }

    setSticky({
      id: STICKY_ID,
      tone: "info",
      priority: 70,
      icon: "refresh",
      message: (
        <span>
          <span className="font-semibold">{who}</span> {detail}
        </span>
      ),
      secondaryAction: {
        label: "Not now",
        variant: "flat",
        onPress: dismissRemoteChanges,
      },
      action: {
        label: "Refresh data",
        variant: "primary",
        isLoading: isSaving,
        isDisabled: hasUnsavedChanges,
        onPress: () => void applyRemoteChanges(),
      },
    });
  }, [
    isApplyingRemoteChanges,
    remoteChangesAvailable,
    remoteChangeAuthor,
    hasUnsavedChanges,
    autoRefreshEnabled,
    isSaving,
    applyRemoteChanges,
    dismissRemoteChanges,
    setSticky,
    clearSticky,
  ]);

  useEffect(() => {
    return () => clearSticky(STICKY_ID);
  }, [clearSticky]);

  return null;
}
