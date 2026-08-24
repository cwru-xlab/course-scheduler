import "server-only";

import http from "node:http";
import https from "node:https";

import { SOLVER_API_TIMEOUT_MS } from "@/lib/solver-timeouts";

import { parseSolverResponse, type SolverJsonBody } from "./solverFetch";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";

type FetchSolverLongResult = {
  response: Response;
  data: SolverJsonBody;
  baseUrl: string;
};

type FetchSolverLongOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Solver /solve can exceed Node fetch's default 300s headers timeout.
 * Uses node:http directly — only import from server route handlers (not middleware).
 */
export async function fetchSolverLong(
  path: string,
  init?: RequestInit,
  options?: FetchSolverLongOptions,
): Promise<FetchSolverLongResult> {
  const timeoutMs = options?.timeoutMs ?? SOLVER_API_TIMEOUT_MS;
  const url = `${SOLVER_URL}${path}`;
  const response = await nodeHttpFetch(url, init, timeoutMs, options?.signal);
  const data = await parseSolverResponse(response);
  return { response, data, baseUrl: SOLVER_URL };
}

function nodeHttpFetch(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const method = init?.method ?? "GET";
    const headers = normalizeHeaders(init?.headers);
    const body =
      init?.body == null
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : Buffer.from(init.body as ArrayBuffer);

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          const text = Buffer.concat(chunks).toString("utf8");
          resolve(
            new Response(text, {
              status: res.statusCode ?? 502,
              headers: res.headers as HeadersInit,
            }),
          );
        });
        res.on("error", (error) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        });
      },
    );

    const onAbort = () => {
      clearTimeout(timer);
      req.destroy();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal?.aborted) {
      onAbort();
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      req.destroy(new Error(`Solver request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    if (body != null) {
      req.write(body);
    }
    req.end();
  });
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}
