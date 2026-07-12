// In-memory solver lock, scoped to a single Next.js server process.
// Works for the deployed single-container setup (see platform/Dockerfile).
// Not shared across replicas — if the app is scaled horizontally, replace
// this with a lock in the solver DB or a shared cache.

type SolverLockState = {
  active: boolean;
  startedAt: number | null;
  startedBy: string | null;
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
    globalRef.__solverLock = { active: false, startedAt: null, startedBy: null };
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
  }
  return { ...state };
};

export const acquireSolverLock = (startedBy: string | null): boolean => {
  const state = readSolverLock();
  if (state.active) return false;
  const current = getState();
  current.active = true;
  current.startedAt = Date.now();
  current.startedBy = startedBy;
  return true;
};

export const releaseSolverLock = (): void => {
  const current = getState();
  current.active = false;
  current.startedAt = null;
  current.startedBy = null;
};
