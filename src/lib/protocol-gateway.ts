import { getProtocolRuntime } from "./protocol-runtime";
import type { EngineMode, PolicyConfig, ProtocolHealth, SearchMode, SnapshotExport } from "./protocol-types";

const ALLOWED_PORTS = new Set(
  (process.env.PROTOCOL_ALLOWED_PORTS ?? process.env.EDGE_PORTS ?? "3030,3031")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean),
);

const REMOTE_ENGINE = (process.env.PROTOCOL_ENGINE_URL ?? process.env.EDGE_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.EDGE_TOKEN ?? "";
const FORCE_EMBEDDED = process.env.PROTOCOL_FORCE_EMBEDDED === "1";

let cachedProbe: { ts: number; alive: boolean; url: string | null } = {
  ts: 0,
  alive: false,
  url: null,
};

export function resolvePythonBaseUrl(port = "3030"): { ok: true; url: string } | { ok: false; status: number; error: string } {
  if (!ALLOWED_PORTS.has(port)) {
    return { ok: false, status: 403, error: `Port ${port} is not in PROTOCOL_ALLOWED_PORTS` };
  }
  if (REMOTE_ENGINE) {
    return { ok: true, url: REMOTE_ENGINE };
  }
  return { ok: true, url: `http://127.0.0.1:${port}` };
}

export function validateSubpath(segments: string[]): boolean {
  return !segments.some((seg) => /^(\.|%2e){1,2}$/i.test(seg) || seg.includes("/") || seg.includes("\\"));
}

async function probePythonEngine(port = "3030"): Promise<{ alive: boolean; url: string | null; health?: Record<string, unknown> }> {
  if (FORCE_EMBEDDED) return { alive: false, url: null };
  const resolved = resolvePythonBaseUrl(port);
  if (!resolved.ok) return { alive: false, url: null };

  const now = Date.now();
  if (now - cachedProbe.ts < 2500 && cachedProbe.url === resolved.url && !cachedProbe.alive) {
    return { alive: false, url: null };
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (TOKEN) headers["x-edge-token"] = TOKEN;
    const res = await fetch(`${resolved.url}/api/edge/health`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REMOTE_ENGINE ? 4000 : 800),
    });
    if (res.ok) {
      const health = (await res.json()) as Record<string, unknown>;
      cachedProbe = { ts: now, alive: true, url: resolved.url };
      return { alive: true, url: resolved.url, health };
    }
  } catch {
    /* engine offline -> fall back cleanly */
  }
  cachedProbe = { ts: now, alive: false, url: resolved.url };
  return { alive: false, url: null };
}

export async function dispatchProtocol(
  method: "GET" | "POST" | "PUT",
  subpath: string,
  opts?: {
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    port?: string;
  },
): Promise<{ status: number; data: unknown; engineMode: EngineMode }> {
  const port = opts?.port || "3030";
  const resolved = resolvePythonBaseUrl(port);
  if (!resolved.ok) {
    return { status: resolved.status, data: { error: resolved.error }, engineMode: "embedded-ts-mesh" };
  }

  const probe = await probePythonEngine(port);
  if (probe.alive && probe.url) {
    // Translate Clauset / 13th-protocol snapshot format if importing into Python edge-engine
    let forwardBody = opts?.body;
    if (subpath === "snapshot/import" && forwardBody && typeof forwardBody.snapshot === "object" && forwardBody.snapshot) {
      const snap = { ...(forwardBody.snapshot as Record<string, unknown>) };
      if (snap.format === "clauset-snapshot" || snap.format === "13th-protocol-snapshot") {
        snap.format = "edge-mem-snapshot";
      }
      forwardBody = { ...forwardBody, snapshot: snap };
    }

    const q = new URLSearchParams(opts?.query);
    q.delete("XTransformPort");
    q.delete("nodePort");
    const qs = q.toString() ? `?${q.toString()}` : "";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (TOKEN) headers["x-edge-token"] = TOKEN;
    if (method !== "GET") headers["Content-Type"] = "application/json";

    try {
      const res = await fetch(`${probe.url}/api/edge/${subpath}${qs}`, {
        method,
        headers,
        body: method !== "GET" ? JSON.stringify(forwardBody ?? {}) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(REMOTE_ENGINE ? 25000 : 10000),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (subpath === "health" && res.ok) {
        const enriched: ProtocolHealth = {
          ok: Boolean(json.ok ?? true),
          service: "clauset-gateway",
          protocol_version: "1.3.0",
          engine_mode: "python-edge-shard",
          engine_label: "Python EdgeShard (Qdrant + FastEmbed)",
          port: Number(json.port ?? port),
          uptime_s: Number(json.uptime_s ?? 0),
          dense_model: String(json.dense_model ?? "BAAI/bge-small-en-v1.5"),
          dense_dim: Number(json.dense_dim ?? 384),
          cloud_reachable: Boolean(json.cloud_reachable ?? true),
          python_engine_url: probe.url,
        };
        return { status: res.status, data: enriched, engineMode: "python-edge-shard" };
      }
      if (subpath === "state" && res.ok) {
        return { status: res.status, data: { ...json, engine_mode: "python-edge-shard" }, engineMode: "python-edge-shard" };
      }
      if (subpath === "search" && res.ok) {
        return { status: res.status, data: { ...json, engine_mode: "python-edge-shard" }, engineMode: "python-edge-shard" };
      }
      return { status: res.status, data: json, engineMode: "python-edge-shard" };
    } catch {
      /* fall through to embedded runtime if upstream dropped mid-call */
    }
  }

  return dispatchEmbedded(method, subpath, opts?.query, opts?.body);
}

function dispatchEmbedded(
  method: "GET" | "POST" | "PUT",
  subpath: string,
  query?: URLSearchParams,
  body: Record<string, unknown> = {},
): { status: number; data: unknown; engineMode: EngineMode } {
  const rt = getProtocolRuntime();
  const q = (k: string, fallback = "") => query?.get(k) ?? fallback;
  const devId = (body.device as string | undefined) || q("device") || undefined;

  if (method === "GET") {
    switch (subpath) {
      case "health": {
        const health: ProtocolHealth = {
          ok: true,
          service: "clauset-gateway",
          protocol_version: "1.3.0",
          engine_mode: "embedded-ts-mesh",
          engine_label: "Embedded TypeScript Mesh (BM25 + Dense Cosine)",
          port: Number(process.env.PORT ?? 3000),
          uptime_s: Number(process.uptime().toFixed(1)),
          dense_model: "Clauset-Mesh-128d + BM25",
          dense_dim: 128,
          cloud_reachable: true,
          python_engine_url: null,
        };
        return { status: 200, data: health, engineMode: "embedded-ts-mesh" };
      }
      case "state":
        return { status: 200, data: rt.getState(), engineMode: "embedded-ts-mesh" };
      case "fleet":
        return { status: 200, data: rt.getFleet(), engineMode: "embedded-ts-mesh" };
      case "memory":
        return { status: 200, data: rt.getMemory(devId), engineMode: "embedded-ts-mesh" };
      case "points":
        return {
          status: 200,
          data: rt.getPoints(q("shard", "incidents"), devId, Number(q("limit", "50")) || 50),
          engineMode: "embedded-ts-mesh",
        };
      case "point": {
        const shard = q("shard");
        const id = q("id");
        if (!shard || !id) return { status: 400, data: { error: "shard and id required" }, engineMode: "embedded-ts-mesh" };
        const p = rt.getPoint(shard, id, devId);
        return p
          ? { status: 200, data: p, engineMode: "embedded-ts-mesh" }
          : { status: 404, data: { error: "point not found" }, engineMode: "embedded-ts-mesh" };
      }
      case "sync-status":
        return { status: 200, data: rt.getSyncStatus(devId), engineMode: "embedded-ts-mesh" };
      case "activity":
        return {
          status: 200,
          data: {
            entries: rt.getActivity(q("device") || null, Number(q("limit", "60")) || 60, Number(q("since", "0")) || 0),
          },
          engineMode: "embedded-ts-mesh",
        };
      case "policy":
        return { status: 200, data: rt.getPolicy(), engineMode: "embedded-ts-mesh" };
      case "cloud/collections":
        return { status: 200, data: rt.cloudCollections(), engineMode: "embedded-ts-mesh" };
      case "cloud/points":
        return {
          status: 200,
          data: rt.cloudPoints(
            q("collection", "edge-incidents"),
            q("q"),
            (q("mode", "hybrid") as SearchMode) || "hybrid",
            Number(q("limit", "50")) || 50,
          ),
          engineMode: "embedded-ts-mesh",
        };
      case "retention/status":
        return { status: 200, data: rt.retentionStatus(), engineMode: "embedded-ts-mesh" };
      default:
        return { status: 404, data: { error: `Unknown GET route: ${subpath}` }, engineMode: "embedded-ts-mesh" };
    }
  }

  if (method === "PUT" && subpath === "policy") {
    const res = rt.putPolicy(body as unknown as PolicyConfig);
    return res.ok
      ? { status: 200, data: res.policy, engineMode: "embedded-ts-mesh" }
      : { status: 400, data: { error: res.error }, engineMode: "embedded-ts-mesh" };
  }

  if (method === "POST") {
    switch (subpath) {
      case "search":
        try {
          return {
            status: 200,
            data: rt.search({
              device: devId,
              shard: String(body.shard || "incidents"),
              query: String(body.query || ""),
              mode: (body.mode as SearchMode) || "hybrid",
              limit: Number(body.limit || 5),
              filters: body.filters as Record<string, string> | undefined,
              explain: Boolean(body.explain),
            }),
            engineMode: "embedded-ts-mesh",
          };
        } catch (err) {
          return {
            status: 400,
            data: { error: err instanceof Error ? err.message : "invalid search" },
            engineMode: "embedded-ts-mesh",
          };
        }
      case "write":
        return {
          status: 200,
          data: rt.writePoint({
            device: devId,
            shard: String(body.shard || "incidents"),
            text: String(body.text || ""),
            slug: body.slug as string | undefined,
            domain: body.domain as string | undefined,
            criticality: body.criticality as string | undefined,
            sensitivity: body.sensitivity as string | undefined,
            asset_id: body.asset_id as string | undefined,
            title: body.title as string | undefined,
            sensor_type: body.sensor_type as string | undefined,
            value: typeof body.value === "number" ? body.value : undefined,
            unit: body.unit as string | undefined,
            severity: body.severity as string | undefined,
          }),
          engineMode: "embedded-ts-mesh",
        };
      case "point/delete":
        return {
          status: 200,
          data: rt.deletePoint(String(body.shard || ""), String(body.id || ""), devId),
          engineMode: "embedded-ts-mesh",
        };
      case "connectivity":
        return {
          status: 200,
          data: rt.setConnectivity(devId, Boolean(body.online)),
          engineMode: "embedded-ts-mesh",
        };
      case "sync":
        return { status: 200, data: rt.sync(devId), engineMode: "embedded-ts-mesh" };
      case "bootstrap":
        return { status: 200, data: rt.bootstrap(devId), engineMode: "embedded-ts-mesh" };
      case "demo/conflict":
        return { status: 200, data: rt.triggerDemoConflict(devId), engineMode: "embedded-ts-mesh" };
      case "conflict/resolve": {
        const res = rt.resolveConflict(
          devId,
          String(body.conflict_id || ""),
          (body.resolution as "local" | "remote" | "merge") || "local",
          body.merged_text as string | undefined,
        );
        return { status: res.ok ? 200 : 400, data: res, engineMode: "embedded-ts-mesh" };
      }
      case "policy/simulate":
        return {
          status: 200,
          data: rt.simulatePolicy({
            text: String(body.text || ""),
            criticality: String(body.criticality || "medium"),
            sensitivity: String(body.sensitivity || "internal"),
            domain: String(body.domain || "incident"),
          }),
          engineMode: "embedded-ts-mesh",
        };
      case "active": {
        const res = rt.setActive(String(body.device || ""));
        return { status: res.ok ? 200 : 400, data: res, engineMode: "embedded-ts-mesh" };
      }
      case "cloud/search":
        return {
          status: 200,
          data: rt.cloudSearch(
            String(body.collection || "edge-incidents"),
            String(body.query || ""),
            (body.mode as SearchMode) || "hybrid",
            Number(body.limit || 10),
          ),
          engineMode: "embedded-ts-mesh",
        };
      case "cloud/delete":
        return {
          status: 200,
          data: rt.cloudDelete(String(body.collection || ""), String(body.id || "")),
          engineMode: "embedded-ts-mesh",
        };
      case "snapshot/export":
        return { status: 200, data: rt.exportSnapshot(devId), engineMode: "embedded-ts-mesh" };
      case "snapshot/import": {
        let snap = body.snapshot;
        if (typeof snap === "string") {
          try {
            snap = JSON.parse(snap);
          } catch {
            return { status: 400, data: { ok: false, reason: "snapshot is not valid JSON" }, engineMode: "embedded-ts-mesh" };
          }
        }
        const res = rt.importSnapshot(devId, snap as SnapshotExport);
        return { status: res.ok ? 200 : 400, data: res, engineMode: "embedded-ts-mesh" };
      }
      case "retention/run":
        return { status: 200, data: rt.runRetention(devId), engineMode: "embedded-ts-mesh" };
      default:
        return { status: 404, data: { error: `Unknown POST route: ${subpath}` }, engineMode: "embedded-ts-mesh" };
    }
  }

  return { status: 405, data: { error: `Method ${method} not allowed` }, engineMode: "embedded-ts-mesh" };
}
