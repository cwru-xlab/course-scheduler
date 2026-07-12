const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";
const SOLVER_FALLBACK_URLS = ["http://localhost:5001", "http://localhost:8000"];

export type SolverJsonBody = Record<string, unknown> & {
  status?: string;
  errors?: Array<{
    code?: string;
    message?: string;
    sheet?: string;
    row_id?: string;
    field?: string;
  }>;
  issues?: Array<{
    code?: string;
    message?: string;
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

/** POST/GET the solver with URL fallbacks and optional timeout. */
export async function fetchSolver(
  path: string,
  init?: RequestInit,
  options?: { timeoutMs?: number },
): Promise<FetchSolverResult> {
  const candidateUrls = [SOLVER_URL, ...SOLVER_FALLBACK_URLS].filter(
    (url, idx, arr) => arr.indexOf(url) === idx,
  );

  let lastError: unknown = null;

  for (const baseUrl of candidateUrls) {
    try {
      const controller = options?.timeoutMs ? new AbortController() : null;
      const timeoutId =
        controller && options?.timeoutMs
          ? setTimeout(() => controller.abort(), options.timeoutMs)
          : null;

      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller?.signal ?? init?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (response.status === 404 || response.status === 405) {
        continue;
      }

      const data = await parseSolverResponse(response);
      return { response, data, baseUrl };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof DOMException && lastError.name === "AbortError") {
    throw new Error("Scheduling service request timed out.");
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
      ...(typeof error.sheet === "string" ? { sheet: error.sheet } : {}),
      ...(typeof error.row_id === "string" ? { row_id: error.row_id } : {}),
      ...(typeof error.field === "string" ? { field: error.field } : {}),
    }));
  }

  if (typeof data.raw === "string" && data.raw.length > 0) {
    return [
      {
        code: "solver_response_invalid",
        message: `Scheduling service returned a non-JSON response: ${data.raw.slice(0, 240)}`,
      },
    ];
  }

  return [{ code: fallbackCode, message: fallbackMessage }];
}
