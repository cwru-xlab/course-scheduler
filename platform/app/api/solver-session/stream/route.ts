import {
  readSolverSession,
  subscribeSolverSession,
  type SolverSessionState,
} from "@/lib/solver-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 15_000;

function encodeEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE stream of SolverSession state.
 * On connect: immediate full snapshot. Then every broadcast + heartbeats.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event, data)));
        } catch {
          closed = true;
        }
      };

      // Immediate snapshot for late joiners / reconnects.
      send("snapshot", readSolverSession());

      const onUpdate = (state: SolverSessionState) => {
        send("state", state);
      };
      unsubscribe = subscribeSolverSession(onUpdate);

      heartbeatId = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
      if (unsubscribe) unsubscribe();
      if (heartbeatId) clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable buffering on some proxies
      "X-Accel-Buffering": "no",
    },
  });
}
