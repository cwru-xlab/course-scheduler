"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { SolverSessionState } from "@/lib/solver-session";

const IDLE: SolverSessionState = {
  sessionId: "default",
  locked: false,
  runId: null,
  progress: 0,
  status: "idle",
  startedBy: null,
  startedByNetworkId: null,
  startedAt: null,
  error: null,
};

type Listener = () => void;

let currentState: SolverSessionState = IDLE;
const listeners = new Set<Listener>();
let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;

function isSessionState(value: unknown): value is SolverSessionState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.locked === "boolean" && typeof v.progress === "number" && typeof v.status === "string";
}

function emit() {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

function applyRaw(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isSessionState(parsed)) {
      currentState = parsed;
      emit();
    }
  } catch {
    /* ignore */
  }
}

function connect() {
  if (typeof window === "undefined") return;
  if (es) return;

  es = new EventSource("/api/solver-session/stream");
  es.addEventListener("snapshot", (ev) => applyRaw((ev as MessageEvent).data));
  es.addEventListener("state", (ev) => applyRaw((ev as MessageEvent).data));
  es.onerror = () => {
    es?.close();
    es = null;
    if (refCount <= 0) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  };
}

function retain() {
  refCount += 1;
  if (refCount === 1) connect();
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    es?.close();
    es = null;
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  retain();
  return () => {
    listeners.delete(listener);
    release();
  };
}

function getSnapshot() {
  return currentState;
}

function getServerSnapshot() {
  return IDLE;
}

/**
 * Mirror of the server SolverSession via a shared SSE connection.
 * Progress / locked / status are server-owned — never invent client-side %.
 */
export function useSolverSession(): SolverSessionState & {
  cancelRun: () => Promise<boolean>;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const cancelRun = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/solver-lock", { method: "DELETE" });
      if (!res.ok) return false;
      const data = (await res.json()) as { cancelled?: boolean };
      return data.cancelled === true;
    } catch {
      return false;
    }
  }, []);

  return { ...state, cancelRun };
}

/** @deprecated Use useSolverSession — kept for calendar / button call sites. */
export type SolverLockStatus = {
  active: boolean;
  startedBy: string | null;
  startedByNetworkId: string | null;
  startedAt: number | null;
  progress: number;
  cancelled: boolean;
};

export function useSolverLock(): SolverLockStatus & {
  cancelRun: () => Promise<boolean>;
} {
  const session = useSolverSession();
  return {
    active: session.locked,
    startedBy: session.startedBy,
    startedByNetworkId: session.startedByNetworkId,
    startedAt: session.startedAt,
    progress: session.progress,
    cancelled: session.status === "cancelled",
    cancelRun: session.cancelRun,
  };
}
