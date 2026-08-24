import { Agent, fetch as undiciFetch } from "undici";

import { SOLVER_API_TIMEOUT_MS } from "@/lib/solver-timeouts";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";
const SOLVER_FALLBACK_URLS = ["http://localhost:5001", "http://localhost:8000"];

/** Node's fetch defaults to a 300s headers timeout; solver runs can exceed that. */
const solverFetchDispatcher = new Agent({
  headersTimeout: SOLVER_API_TIMEOUT_MS,
  bodyTimeout: SOLVER_API_TIMEOUT_MS,
  connectTimeout: 30_000,
});

export type SolverJsonBody = Record<string, unknown> & {
  status?: string;
  errors?: Array<{
    code?: string;
    message?: string;
    detail?: string;
    sheet?: string;
    row_id?: string;
    field?: string;
  }>;
  issues?: Array<{
    code?: string;
    message?: string;
    detail?: string;
    sheet?: string;
    row_id?: string;
    field?: string;
  }>;
};

export async function parseSolverResponse(response: Response): Promise<SolverJsonBody> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as SolverJsonBody;
  } catch {
    return { raw, status: "error" };
  }
}

type FetchSolverResult = {
  response: Response;
  data: SolverJsonBody;
  baseUrl: string;
};

type FetchSolverOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  parseBody?: "json" | "none";
};

/** POST/GET the solver with URL fallbacks and optional timeout / external abort. */
export async function fetchSolver(
  path: string,
  init?: RequestInit,
  options?: FetchSolverOptions,
): Promise<FetchSolverResult> {
  const candidateUrls = [SOLVER_URL, ...SOLVER_FALLBACK_URLS].filter(
    (url, idx, arr) => arr.indexOf(url) === idx,
  );
  const parseBody = options?.parseBody ?? "json";

  let lastError: unknown = null;

  for (const baseUrl of candidateUrls) {
    try {
      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      const external = options?.signal ?? init?.signal;
      if (external) {
        if (external.aborted) {
          controller.abort();
        } else {
          external.addEventListener("abort", onExternalAbort, { once: true });
        }
      }
      const timeoutId =
        options?.timeoutMs != null
          ? setTimeout(() => controller.abort(), options.timeoutMs)
          : null;

      try {
        const response = await undiciFetch(`${baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          dispatcher: solverFetchDispatcher,
        });

        if (timeoutId) clearTimeout(timeoutId);
        external?.removeEventListener("abort", onExternalAbort);

        if (response.status === 404 || response.status === 405) {
          continue;
        }

        // Keep successful binary/file bodies intact for the caller.
        if (response.ok && parseBody === "none") {
          return { response, data: {}, baseUrl };
        }

        const data = await parseSolverResponse(response);
        return { response, data, baseUrl };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        external?.removeEventListener("abort", onExternalAbort);
      }
    } catch (error) {
      lastError = error;
      // Don't try fallback URLs if the caller cancelled / timed out.
      if (error instanceof DOMException && error.name === "AbortError") {
        break;
      }
    }
  }

  if (lastError instanceof DOMException && lastError.name === "AbortError") {
    // Preserve AbortError so callers can distinguish cancel vs other failures.
    throw lastError;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to reach scheduling service.");
}

export function solverErrorsFromBody(
  data: SolverJsonBody,
  fallbackCode: string,
  fallbackMessage: string,
): Array<{
  code: string;
  message: string;
  detail?: string;
  sheet?: string;
  row_id?: string;
  field?: string;
}> {
  const source = Array.isArray(data.errors)
    ? data.errors
    : Array.isArray(data.issues)
      ? data.issues
      : null;

  if (source && source.length > 0) {
    return source.map((error) => ({
      code: typeof error.code === "string" ? error.code : fallbackCode,
      message: typeof error.message === "string" ? error.message : fallbackMessage,
      ...(typeof error.detail === "string" ? { detail: error.detail } : {}),
      ...(typeof error.sheet === "string" ? { sheet: error.sheet } : {}),
      ...(typeof error.row_id === "string" ? { row_id: error.row_id } : {}),
      ...(typeof error.field === "string" ? { field: error.field } : {}),
    }));
  }

  if (typeof data.raw === "string" && data.raw.length > 0) {
    return [
      {
        code: "solver_response_invalid",
        message:
          "The scheduling service returned an unexpected response. It may have restarted — confirm it is running and try again.",
        detail: data.raw.slice(0, 500),
      },
    ];
  }

  return [{ code: fallbackCode, message: fallbackMessage }];
}
