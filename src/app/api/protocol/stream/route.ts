import { dispatchProtocol } from "@/lib/protocol-gateway";
import type { MeshMetricsTick, ProtocolState, SyncStatus } from "@/lib/protocol-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventMsg = { event: "metrics" | "error"; data: unknown };

let latest: EventMsg | null = null;
let inflight = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(e: EventMsg) => void>();

async function collectSnapshot(): Promise<MeshMetricsTick> {
  const [stRes, ssRes] = await Promise.all([
    dispatchProtocol("GET", "state"),
    dispatchProtocol("GET", "sync-status"),
  ]);
  const st = stRes.data as ProtocolState;
  const ss = ssRes.data as SyncStatus;
  const devices = st.devices ?? [];
  return {
    ts: Date.now(),
    engine_mode: stRes.engineMode,
    local_points: devices.reduce((a, d) => a + (d.total_points ?? 0), 0),
    cloud_points: st.cloud?.total_points ?? 0,
    devices: devices.length,
    federated_reachable: devices.filter((d) => d.online !== false).length,
    queue_depth: ss.queue_depth ?? 0,
    open_conflicts: (ss.open_conflicts ?? []).length,
    online: ss.online ?? true,
  };
}

async function tick() {
  if (inflight) return;
  inflight = true;
  try {
    latest = { event: "metrics", data: await collectSnapshot() };
  } catch {
    latest = { event: "error", data: { ts: Date.now(), reason: "mesh telemetry unavailable" } };
  } finally {
    inflight = false;
  }
  for (const listener of listeners) listener(latest);
}

function subscribe(fn: (e: EventMsg) => void): () => void {
  listeners.add(fn);
  if (latest) fn(latest);
  if (!timer) {
    timer = setInterval(tick, 1200);
    void tick();
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
      latest = null;
    }
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe((e) => send(e.event, e.data));
      const keepalive = setInterval(() => send("ping", { ts: Date.now() }), 15000);
      cleanup = () => {
        unsubscribe();
        clearInterval(keepalive);
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
