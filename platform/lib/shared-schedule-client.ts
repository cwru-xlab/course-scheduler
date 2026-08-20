"use client";

import { useEffect, useRef, useState } from "react";

import type { SchedulingDataRevision } from "@/lib/scheduling/dataRevision";
import type { SectionLockState } from "@/lib/scheduling/types";

export type SharedScheduleMeta = {
  revision: number;
  ranBy: string | null;
  ranAt: number | null;
  dataRevision: SchedulingDataRevision | null;
};

export type SharedScheduleSnapshot = {
  input: unknown;
  solution: unknown;
  lockedSectionIds: string[];
  sectionLocks?: Record<string, SectionLockState>;
  createdAt: string;
  dataRevision?: SchedulingDataRevision;
};

export type SharedScheduleFull = SharedScheduleMeta & {
  snapshot: SharedScheduleSnapshot | null;
};

const POLL_MS = 4000;

/** Fetch the full shared-schedule snapshot payload on demand. */
export async function fetchSharedScheduleFull(): Promise<SharedScheduleFull | null> {
  try {
    const res = await fetch("/api/shared-schedule?full=1", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SharedScheduleFull;
  } catch {
    return null;
  }
}

/** Poll cheap shared-schedule metadata so the UI can react to new runs. */
export const useSharedScheduleMeta = (): SharedScheduleMeta => {
  const [state, setState] = useState<SharedScheduleMeta>({
    revision: 0,
    ranBy: null,
    ranAt: null,
    dataRevision: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const pull = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/shared-schedule", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as SharedScheduleMeta;
        if (cancelled) return;
        setState((prev) =>
          prev.revision === next.revision &&
          prev.ranBy === next.ranBy &&
          prev.ranAt === next.ranAt &&
          prev.dataRevision?.lastModifiedAt === next.dataRevision?.lastModifiedAt &&
          prev.dataRevision?.lastModifiedByName === next.dataRevision?.lastModifiedByName
            ? prev
            : next,
        );
      } catch {
        // silent
      }
    };

    void pull();
    const interval = window.setInterval(pull, POLL_MS);
    const handleVisibility = () => {
      if (!document.hidden) void pull();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return state;
};

export type SharedScheduleFullResult = SharedScheduleFull & {
  loading: boolean;
};

/** Poll the cheap meta and fetch the full snapshot whenever the revision bumps. */
export const useSharedScheduleFull = (): SharedScheduleFullResult => {
  const meta = useSharedScheduleMeta();
  const [full, setFull] = useState<SharedScheduleFull | null>(null);
  const [loading, setLoading] = useState(false);
  const lastRevisionRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (meta.revision === 0) {
      setFull(null);
      lastRevisionRef.current = 0;
      return;
    }
    if (meta.revision === lastRevisionRef.current) return;
    let cancelled = false;
    setLoading(true);
    fetchSharedScheduleFull()
      .then((next) => {
        if (cancelled) return;
        setFull(next);
        lastRevisionRef.current = meta.revision;
      })
      .catch(() => {
        // keep the previous snapshot; retry on the next poll tick
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meta.revision]);

  return {
    ...(full ?? {
      revision: meta.revision,
      ranBy: null,
      ranAt: null,
      snapshot: null,
    }),
    dataRevision: meta.dataRevision,
    loading,
  };
};
