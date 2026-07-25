/**
 * Canonical solver-run state for a single Next.js process.
 *
 * Clients mirror this via SSE — they never invent progress.
 * Not shared across replicas; scale-out requires Redis (or similar).
 */

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
};

const DEFAULT_SESSION_ID = "default";
/** Matches schedule API / solver timeout budget. */
const ESTIMATED_MAX_MS = 150_000;
const PROGRESS_CAP = 92;
const TICK_MS = 250;
const MAX_RUNTIME_MS = 180_000;
const BROADCAST_THROTTLE_MS = 250;

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
  const t = Math.min(elapsed / ESTIMATED_MAX_MS, 1);
  return Math.min(
    PROGRESS_CAP,
    Math.max(1, Math.floor((1 - Math.exp(-2.8 * t)) * PROGRESS_CAP)),
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
  }, TICK_MS);

  state.maxRuntimeTimer = setTimeout(() => {
    const current = getInternal();
    if (!current.locked || current.status !== "running") return;
    // Force-fail: abort in-flight fetch and unlock so UI never stays stuck.
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

export function readSolverSession(): SolverSessionState {
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
 * Acquire the session lock and start the server progress ticker.
 * Returns the AbortSignal for the Flask fetch, or null if already locked.
 */
export function beginSolverRun(input: {
  startedBy: string | null;
  startedByNetworkId: string | null;
}): { runId: string; signal: AbortSignal } | null {
  const state = getInternal();
  if (state.locked) return null;

  const abortController = new AbortController();
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  state.locked = true;
  state.runId = runId;
  state.progress = 0;
  state.status = "running";
  state.startedBy = input.startedBy;
  state.startedByNetworkId = input.startedByNetworkId;
  state.startedAt = Date.now();
  state.error = null;
  state.abortController = abortController;
  state.lastBroadcastProgress = -1;

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
  clearTimers(state);

  const isCancel = opts.status === "cancelled";
  state.status = opts.status;
  state.error = opts.error ?? null;
  state.progress = isCancel ? 0 : (opts.progress ?? (opts.status === "completed" ? 100 : state.progress));
  state.locked = false;
  state.abortController = null;
  // Keep startedBy / startedAt briefly for banner attribution, then clear on next begin.
  // For idle UX after cancel/fail, clear run attribution so buttons re-enable cleanly.
  if (opts.status === "cancelled" || opts.status === "failed") {
    state.startedBy = null;
    state.startedByNetworkId = null;
    state.startedAt = null;
    state.runId = null;
  } else if (opts.status === "completed") {
    // Keep startedBy for "last run" display elsewhere; unlock means not running.
    state.runId = null;
  }

  broadcast(true);

  // After a short hold on completed/failed, return status to idle (progress bar gone).
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

/** Owner cancel: abort Flask proxy fetch and unlock without completing to 100%. */
export function cancelSolverSession(networkId: string): boolean {
  const state = getInternal();
  if (!state.locked) return false;
  if (state.startedByNetworkId !== networkId) return false;

  try {
    state.abortController?.abort();
  } catch {
    /* ignore */
  }

  finishSession({ status: "cancelled", progress: 0, error: null });
  return true;
}

export function getActiveAbortSignal(): AbortSignal | null {
  return getInternal().abortController?.signal ?? null;
}

// --- Compatibility shims for existing schedule route during migration ---

export function acquireSolverLock(
  startedBy: string | null,
  startedByNetworkId: string | null,
): boolean {
  return beginSolverRun({ startedBy, startedByNetworkId }) !== null;
}

export function releaseSolverLock(): void {
  const state = getInternal();
  if (!state.locked) return;
  // Generic release without a known outcome — treat as failed unlock.
  clearTimers(state);
  state.locked = false;
  state.abortController = null;
  state.status = "idle";
  state.progress = 0;
  state.runId = null;
  state.startedBy = null;
  state.startedByNetworkId = null;
  state.startedAt = null;
  state.error = null;
  broadcast(true);
}

export function readSolverLock(): SolverLockCompat {
  return toLockCompat();
}

export function cancelSolverRun(): boolean {
  const state = getInternal();
  if (!state.locked || !state.startedByNetworkId) return false;
  return cancelSolverSession(state.startedByNetworkId);
}

export function isSolverCancelled(): boolean {
  return getInternal().status === "cancelled";
}
