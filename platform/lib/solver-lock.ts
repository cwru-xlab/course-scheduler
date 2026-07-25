/**
 * @deprecated Prefer `@/lib/solver-session`. Kept as a thin re-export so existing
 * imports keep working during the SSE migration.
 */
export {
  readSolverLock,
  acquireSolverLock,
  releaseSolverLock,
  cancelSolverRun,
  isSolverCancelled,
  type SolverLockCompat as SolverLockState,
} from "@/lib/solver-session";
