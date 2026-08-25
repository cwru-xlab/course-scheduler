/**
 * Canonical solver-run state.
 *
 * Distributed lock + session fields live in the solver DB (via /sync/solver-session).
 * AbortController + progress timers remain process-local on the Next.js instance
 * that acquired the lock (only that instance can abort the in-flight Flask fetch).
 */

import { fetchSolver } from "@/lib/api/solverFetch";
import {
  SOLVER_API_TIMEOUT_MS,
  SOLVER_CLIENT_TIMEOUT_MS,
} from "@/lib/solver-timeouts";

export type SolverSessionStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SolverSessionState = {
  sessionId: string;
  locked: boolean;
  runId: string | null;
  progress: number;
  status: SolverSessionStatus;
  startedBy: string | null;
  startedByNetworkId: string | null;
  startedAt: number | null;
  error: string | null;
};

/** Legacy shape still returned by GET /api/solver-lock for debugging. */
export type SolverLockCompat = {
  active: boolean;
  startedAt: number | null;
  startedBy: string | null;
  startedByNetworkId: string | null;
  progress: number;
  cancelled: boolean;
};

type Listener = (state: SolverSessionState) => void;

type InternalState = SolverSessionState & {
  abortController: AbortController | null;
  progressTimer: ReturnType<typeof setInterval> | null;
  maxRuntimeTimer: ReturnType<typeof setTimeout> | null;
  lastBroadcastAt: number;
  lastBroadcastProgress: number;
  lastRemoteSyncAt: number;
  /** True when this process owns the AbortController for the current run. */
  ownsRun: boolean;
};

const DEFAULT_SESSION_ID = "default";
/** Matches schedule API / solver timeout budget. */
const ESTIMATED_MAX_MS = SOLVER_API_TIMEOUT_MS;
const PROGRESS_CAP = 92;
const TICK_MS = 250;
const MAX_RUNTIME_MS = SOLVER_CLIENT_TIMEOUT_MS;
const BROADCAST_THROTTLE_MS = 250;
const REMOTE_SYNC_MS = 2000;
const SYNC_TIMEOUT_MS = 8_000;

const globalRef = globalThis as unknown as {
  __solverSession?: InternalState;
  __solverSessionListeners?: Set<Listener>;
};

function emptyState(): InternalState {
  return {
    sessionId: DEFAULT_SESSION_ID,
    locked: false,
    runId: null,
    progress: 0,
    status: "idle",
    startedBy: null,
    startedByNetworkId: null,
    startedAt: null,
    error: null,
    abortController: null,
    progressTimer: null,
    maxRuntimeTimer: null,
    lastBroadcastAt: 0,
    lastBroadcastProgress: -1,
    lastRemoteSyncAt: 0,
    ownsRun: false,
  };
}

function getInternal(): InternalState {
  if (!globalRef.__solverSession) {
    globalRef.__solverSession = emptyState();
  }
  return globalRef.__solverSession;
}

function getListeners(): Set<Listener> {
  if (!globalRef.__solverSessionListeners) {
    globalRef.__solverSessionListeners = new Set();
  }
  return globalRef.__solverSessionListeners;
}

function publicSnapshot(state: InternalState = getInternal()): SolverSessionState {
  return {
    sessionId: state.sessionId,
    locked: state.locked,
    runId: state.runId,
    progress: state.progress,
    status: state.status,
    startedBy: state.startedBy,
    startedByNetworkId: state.startedByNetworkId,
    startedAt: state.startedAt,
    error: state.error,
  };
}

function estimateProgress(startedAt: number, now = Date.now()): number {
  const elapsed = Math.max(0, now - startedAt);
  return Math.min(
    PROGRESS_CAP,
    Math.max(1, Math.floor((elapsed / ESTIMATED_MAX_MS) * PROGRESS_CAP)),
  );
}

function clearTimers(state: InternalState) {
  if (state.progressTimer != null) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
  if (state.maxRuntimeTimer != null) {
    clearTimeout(state.maxRuntimeTimer);
    state.maxRuntimeTimer = null;
  }
}

function broadcast(force = false) {
  const state = getInternal();
  const now = Date.now();
  if (
    !force &&
    now - state.lastBroadcastAt < BROADCAST_THROTTLE_MS &&
    state.progress === state.lastBroadcastProgress
  ) {
    return;
  }
  state.lastBroadcastAt = now;
  state.lastBroadcastProgress = state.progress;
  const snap = publicSnapshot(state);
  for (const listener of Array.from(getListeners())) {
    try {
      listener(snap);
    } catch {
      /* ignore broken listeners */
    }
  }
}

function applyRemoteSession(remote: Partial<SolverSessionState> & { cancelRequested?: boolean }) {
  const state = getInternal();
  // Don't clobber a run this process owns with a stale remote idle.
  if (state.ownsRun && state.locked) return;

  state.locked = Boolean(remote.locked);
  state.runId = typeof remote.runId === "string" ? remote.runId : null;
  state.progress = typeof remote.progress === "number" ? remote.progress : 0;
  state.status =
    remote.status === "running" ||
    remote.status === "completed" ||
    remote.status === "failed" ||
    remote.status === "cancelled" ||
    remote.status === "idle"
      ? remote.status
      : state.locked
        ? "running"
        : "idle";
  state.startedBy = typeof remote.startedBy === "string" ? remote.startedBy : null;
  state.startedByNetworkId =
    typeof remote.startedByNetworkId === "string" ? remote.startedByNetworkId : null;
  state.startedAt = typeof remote.startedAt === "number" ? remote.startedAt : null;
  state.error = typeof remote.error === "string" ? remote.error : null;
  broadcast(true);
}

/** Returns true when the owning process should abort (cancel requested). */
async function syncProgressToSolver(runId: string, progress: number): Promise<boolean> {
  try {
    const { response, data } = await fetchSolver(
      "/sync/solver-session/progress",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, progress }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok && data.cancelRequested === true) return true;
    return false;
  } catch {
    return false;
  }
}

async function syncFinishToSolver(opts: {
  runId: string | null;
  status: Exclude<SolverSessionStatus, "running" | "idle">;
  error?: string | null;
  progress?: number;
}): Promise<void> {
  try {
    await fetchSolver(
      "/sync/solver-session/finish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: opts.runId,
          status: opts.status,
          error: opts.error ?? null,
          progress: opts.progress,
        }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
  } catch {
    /* best-effort */
  }
}

function startProgressTicker(state: InternalState) {
  clearTimers(state);
  state.progressTimer = setInterval(() => {
    const current = getInternal();
    if (!current.locked || current.status !== "running" || current.startedAt == null) {
      return;
    }
    const next = estimateProgress(current.startedAt);
    if (next > current.progress) {
      current.progress = next;
      broadcast(false);
    }
    const now = Date.now();
    // Sync progress + cancel_requested on a slower cadence than the local ticker
    // so remote cancels are observed even after progress hits PROGRESS_CAP.
    if (
      current.ownsRun &&
      current.runId &&
      now - current.lastRemoteSyncAt >= REMOTE_SYNC_MS
    ) {
      current.lastRemoteSyncAt = now;
      void syncProgressToSolver(current.runId, current.progress).then((cancelRequested) => {
        if (!cancelRequested) return;
        const live = getInternal();
        if (!live.ownsRun || !live.locked) return;
        try {
          live.abortController?.abort();
        } catch {
          /* ignore */
        }
        finishSession({ status: "cancelled", progress: 0, error: null });
      });
    }
  }, TICK_MS);

  state.maxRuntimeTimer = setTimeout(() => {
    const current = getInternal();
    if (!current.locked || current.status !== "running") return;
    try {
      current.abortController?.abort();
    } catch {
      /* ignore */
    }
    finishSession({
      status: "failed",
      error: "Solver run exceeded the maximum allowed time and was stopped.",
      progress: current.progress,
    });
  }, MAX_RUNTIME_MS);
}

export function subscribeSolverSession(listener: Listener): () => void {
  const listeners = getListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Local snapshot only (SSE). Prefer readSolverSessionRemote for cross-replica. */
export function readSolverSession(): SolverSessionState {
  return publicSnapshot();
}

export async function readSolverSessionRemote(): Promise<SolverSessionState> {
  const local = getInternal();
  if (local.ownsRun && local.locked) {
    return publicSnapshot(local);
  }
  try {
    const { response, data } = await fetchSolver(
      "/sync/solver-session",
      { method: "GET", cache: "no-store" },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok) {
      applyRemoteSession(data as Partial<SolverSessionState>);
      return publicSnapshot();
    }
  } catch {
    /* keep local */
  }
  return publicSnapshot();
}

export function toLockCompat(state: SolverSessionState = readSolverSession()): SolverLockCompat {
  return {
    active: state.locked,
    startedAt: state.startedAt,
    startedBy: state.startedBy,
    startedByNetworkId: state.startedByNetworkId,
    progress: state.progress,
    cancelled: state.status === "cancelled",
  };
}

/**
 * Acquire the distributed session lock and start the server progress ticker.
 * Returns the AbortSignal for the Flask fetch, or null if already locked.
 */
export async function beginSolverRun(input: {
  startedBy: string | null;
  startedByNetworkId: string | null;
}): Promise<{ runId: string; signal: AbortSignal } | null> {
  const state = getInternal();
  if (state.ownsRun && state.locked) return null;

  let remoteSession: Partial<SolverSessionState> | null = null;
  let acquired = false;
  try {
    const { response, data } = await fetchSolver(
      "/sync/solver-session/acquire",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedBy: input.startedBy,
          startedByNetworkId: input.startedByNetworkId,
          ttlMs: SOLVER_CLIENT_TIMEOUT_MS,
        }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.status === 409) {
      applyRemoteSession((data.session as Partial<SolverSessionState>) ?? data);
      return null;
    }
    if (response.ok && data.acquired === true && data.session) {
      acquired = true;
      remoteSession = data.session as Partial<SolverSessionState>;
    } else if (response.status === 404 || response.status === 405) {
      // Old solver without sync endpoints — fall back to process-local lock.
      if (state.locked) return null;
      acquired = true;
    } else if (!response.ok) {
      return null;
    }
  } catch {
    // Solver unreachable: process-local lock only (dev / degraded).
    if (state.locked) return null;
    acquired = true;
  }

  if (!acquired) return null;

  const abortController = new AbortController();
  const runId =
    (typeof remoteSession?.runId === "string" && remoteSession.runId) ||
    `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  state.locked = true;
  state.runId = runId;
  state.progress = 0;
  state.status = "running";
  state.startedBy = input.startedBy;
  state.startedByNetworkId = input.startedByNetworkId;
  state.startedAt =
    typeof remoteSession?.startedAt === "number" ? remoteSession.startedAt : Date.now();
  state.error = null;
  state.abortController = abortController;
  state.lastBroadcastProgress = -1;
  state.ownsRun = true;

  startProgressTicker(state);
  broadcast(true);

  return { runId, signal: abortController.signal };
}

export function finishSession(opts: {
  status: Exclude<SolverSessionStatus, "running" | "idle">;
  error?: string | null;
  progress?: number;
}): void {
  const state = getInternal();
  const runId = state.runId;
  clearTimers(state);

  const isCancel = opts.status === "cancelled";
  state.status = opts.status;
  state.error = opts.error ?? null;
  state.progress = isCancel
    ? 0
    : (opts.progress ?? (opts.status === "completed" ? 100 : state.progress));
  state.locked = false;
  state.abortController = null;
  state.ownsRun = false;

  if (opts.status === "cancelled" || opts.status === "failed") {
    state.startedBy = null;
    state.startedByNetworkId = null;
    state.startedAt = null;
    state.runId = null;
  } else if (opts.status === "completed") {
    state.runId = null;
  }

  broadcast(true);

  void syncFinishToSolver({
    runId,
    status: opts.status,
    error: opts.error ?? null,
    progress: state.progress,
  });

  if (opts.status === "completed") {
    setTimeout(() => {
      const current = getInternal();
      if (current.status === "completed" && !current.locked) {
        current.status = "idle";
        current.progress = 0;
        broadcast(true);
      }
    }, 600);
  } else if (opts.status === "cancelled" || opts.status === "failed") {
    setTimeout(() => {
      const current = getInternal();
      if (
        (current.status === "cancelled" || current.status === "failed") &&
        !current.locked
      ) {
        current.status = "idle";
        current.error = null;
        current.progress = 0;
        broadcast(true);
      }
    }, 3000);
  }
}

/** Owner cancel: abort Flask proxy fetch (if local) and unlock distributed lock. */
export async function cancelSolverSession(networkId: string): Promise<boolean> {
  const state = getInternal();

  // Prefer distributed cancel so any replica can clear the lock.
  let remoteCancelled = false;
  try {
    const { response, data } = await fetchSolver(
      "/sync/solver-session/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ networkId }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.status === 403) return false;
    if (response.ok && data.cancelled === true) {
      remoteCancelled = true;
    } else if (response.ok && data.cancelled === false && !state.locked) {
      return false;
    }
  } catch {
    /* local-only cancel below */
  }

  if (state.locked && state.startedByNetworkId === networkId) {
    try {
      state.abortController?.abort();
    } catch {
      /* ignore */
    }
    finishSession({ status: "cancelled", progress: 0, error: null });
    return true;
  }

  // Another replica owns the AbortController; cancel_requested is set in DB and
  // that owner will abort + finish on the next progress sync.
  return remoteCancelled;
}

export function getActiveAbortSignal(): AbortSignal | null {
  return getInternal().abortController?.signal ?? null;
}

// --- Compatibility shims for existing schedule route during migration ---

export async function acquireSolverLock(
  startedBy: string | null,
  startedByNetworkId: string | null,
): Promise<boolean> {
  return (await beginSolverRun({ startedBy, startedByNetworkId })) !== null;
}

export function releaseSolverLock(): void {
  const state = getInternal();
  if (!state.locked) return;
  clearTimers(state);
  const runId = state.runId;
  state.locked = false;
  state.abortController = null;
  state.ownsRun = false;
  state.status = "idle";
  state.progress = 0;
  state.runId = null;
  state.startedBy = null;
  state.startedByNetworkId = null;
  state.startedAt = null;
  state.error = null;
  broadcast(true);
  void syncFinishToSolver({ runId, status: "failed", error: "Solver lock released." });
}

export function readSolverLock(): SolverLockCompat {
  return toLockCompat();
}

export async function cancelSolverRun(): Promise<boolean> {
  const state = getInternal();
  if (!state.locked || !state.startedByNetworkId) return false;
  return cancelSolverSession(state.startedByNetworkId);
}

export function isSolverCancelled(): boolean {
  return getInternal().status === "cancelled";
}
