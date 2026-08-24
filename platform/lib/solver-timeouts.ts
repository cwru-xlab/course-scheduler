/** CP-SAT search budget (seconds). Keep in sync with solver/app.py SOLVER_MAX_TIME_SECONDS. */
export const SOLVER_MAX_TIME_SECONDS = 600;

/** Flask fetch timeout: solver budget + model-build / serialization headroom. */
export const SOLVER_API_TIMEOUT_MS = SOLVER_MAX_TIME_SECONDS * 1000 + 60_000;

/** Client/session hard stop: API timeout + network buffer. */
export const SOLVER_CLIENT_TIMEOUT_MS = SOLVER_API_TIMEOUT_MS + 60_000;

/** Next.js route maxDuration (seconds) for /api/schedule. */
export const SOLVER_ROUTE_MAX_DURATION_SEC = Math.ceil(SOLVER_CLIENT_TIMEOUT_MS / 1000);
