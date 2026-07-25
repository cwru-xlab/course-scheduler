// In-memory solver lock, scoped to a single Next.js server process.
// Works for the deployed single-container setup (see platform/Dockerfile).
// Not shared across replicas — if the app is scaled horizontally, replace
// this with a lock in the solver DB or a shared cache.

export type SolverLockState = {
  active: boolean;
  startedAt: number | null;
  startedBy: string | null;
  /** Network ID of the user who started the run (for ownership checks). */
  startedByNetworkId: string | null;
  /** Progress percentage (0-100), updated by the running client. */
  progress: number;
  /** Whether the run has been cancelled. */
  cancelled: boolean;
};

const globalRef = globalThis as unknown as {
  __solverLock?: SolverLockState;
};

// Stale-lock timeout: if a solver run doesn't clear its lock within this
// window (e.g. process crashed mid-solve), consider it stale so the UI
// doesn't stay disabled forever. Matches the /api/schedule fetch timeout
// (150s) plus a small buffer.
const STALE_LOCK_MS = 180_000;

const getState = (): SolverLockState => {
  if (!globalRef.__solverLock) {
    globalRef.__solverLock = {
      active: false,
      startedAt: null,
      startedBy: null,
      startedByNetworkId: null,
      progress: 0,
      cancelled: false,
    };
  }
  return globalRef.__solverLock;
};

export const readSolverLock = (): SolverLockState => {
  const state = getState();
  if (
    state.active &&
    state.startedAt !== null &&
    Date.now() - state.startedAt > STALE_LOCK_MS
  ) {
    state.active = false;
    state.startedAt = null;
    state.startedBy = null;
    state.startedByNetworkId = null;
    state.progress = 0;
    state.cancelled = false;
  }
  return { ...state };
};

export const acquireSolverLock = (
  startedBy: string | null,
  startedByNetworkId: string | null,
): boolean => {
  const state = readSolverLock();
  if (state.active) return false;
  const current = getState();
  current.active = true;
  current.startedAt = Date.now();
  current.startedBy = startedBy;
  current.startedByNetworkId = startedByNetworkId;
  current.progress = 0;
  current.cancelled = false;
  return true;
};

export const releaseSolverLock = (): void => {
  const current = getState();
  current.active = false;
  current.startedAt = null;
  current.startedBy = null;
  current.startedByNetworkId = null;
  current.progress = 0;
  current.cancelled = false;
};

export const updateSolverProgress = (progress: number): void => {
  const current = getState();
  if (current.active) {
    current.progress = Math.max(0, Math.min(100, progress));
  }
};

export const cancelSolverRun = (): boolean => {
  const current = getState();
  if (!current.active) return false;
  current.cancelled = true;
  return true;
};

export const isSolverCancelled = (): boolean => {
  return getState().cancelled;
};
