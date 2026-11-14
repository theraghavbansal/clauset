import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  ActivityEntry,
  CloudCollectionsResponse,
  CloudPoint,
  CloudPointsResponse,
  CloudSearchResponse,
  CloudStats,
  ConflictRecord,
  FleetDevice,
  FleetOverview,
  HybridSearchResponse,
  MemoryPoint,
  MemoryShardStat,
  MemoryStats,
  PolicyConfig,
  PolicyEvalDecision,
  PolicySimResponse,
  ProtocolState,
  RetentionStatus,
  SearchFilters,
  SearchHit,
  SearchMode,
  ShardId,
  SnapshotExport,
  SnapshotImportResult,
  SyncAction,
  SyncStatus,
  WriteResult,
} from "./protocol-types";
import { SHARD_IDS, SHARD_PRESENTATION } from "./protocol-types";

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
    ? path.join(process.env.TMPDIR || "/tmp", ".protocol-data")
    : (process.env.CLAUSET_DATA_DIR || path.join(process.cwd(), ".protocol-data"));
const STATE_FILE = path.join(DATA_DIR, "mesh-state.json");
const DENSE_DIM = 128;

interface StoredPoint {
  id: string;
  slug: string;
  title?: string;
  text: string;
  domain: string;
  criticality: string;
  sensitivity: string;
  origin_device: string;
  sync_state: string;
  updated_at: number;
  asset_id?: string;
  sensor_type?: string;
  value?: number;
  unit?: string;
  severity?: string;
}

interface QueueItem {
  shard: ShardId;
  point_id: string;
  priority: number;
  queued_at: number;
}

interface DeviceRuntime {
  id: string;
  name: string;
  location: string;
  technician: string;
  kind: string;
  online: boolean;
  shards: Record<ShardId, Record<string, StoredPoint>>;
  queue: QueueItem[];
  last_sync_at: number | null;
  last_sync_summary: SyncStatus["last_sync_summary"];
  bytes_pushed: number;
  bytes_pulled: number;
  last_manifests: Record<string, string>;
  synced_updated_at: Record<string, number>;
  conflicts: ConflictRecord[];
}

interface MeshStore {
  active_device: string;
  policy: PolicyConfig;
  cloud: Record<ShardId, Record<string, StoredPoint>>;
  devices: Record<string, DeviceRuntime>;
  activity: ActivityEntry[];
  retention: { expired_total: number; last_run: number | null };
}

const DEFAULT_POLICY: PolicyConfig = {
  rules: [
    {
      id: "r1",
      field: "sensitivity",
      op: "in",
      values: ["restricted"],
      action: "local_only",
      reason: "Restricted keys, PII, and private agent memory never leave the local node",
    },
    {
      id: "r2",
      field: "domain",
      op: "eq",
      value: "sensor",
      action: "local_only",
      reason: "High-frequency node telemetry stays local under TTL eviction",
    },
    {
      id: "r3",
      field: "criticality",
      op: "eq",
      value: "critical",
      action: "sync_now",
      reason: "Critical safety/security anomalies jump the replication queue",
    },
    {
      id: "r4",
      field: "criticality",
      op: "in",
      values: ["high"],
      action: "queued",
      reason: "High-priority agent traces queue for priority sync on reconnect",
    },
    {
      id: "r5",
      field: "domain",
      op: "in",
      values: ["manual", "incident"],
      action: "queued",
      reason: "Playbooks and episodic traces replicate opportunistically",
    },
  ],
  ttl_raw_sensor_seconds: 600,
};

function stableUuid(slug: string): string {
  const hash = crypto.createHash("sha1").update(`clauset:${slug}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function normSensitivity(v: unknown): string {
  return String(v ?? "").trim().toLowerCase() || "internal";
}

function isLocalOnly(meta: { sensitivity?: unknown }): boolean {
  return normSensitivity(meta.sensitivity) === "restricted";
}

export function evaluatePolicy(
  meta: { sensitivity?: string; criticality?: string; domain?: string },
  policy: PolicyConfig,
): PolicyEvalDecision {
  let decision: PolicyEvalDecision = {
    sync_state: "queued",
    matched_rule: null,
    reason: "Default: queue for opportunistic mesh sync",
  };
  for (const rule of policy.rules) {
    const val = meta[rule.field as keyof typeof meta];
    const matched =
      rule.op === "eq" ? val === rule.value : Array.isArray(rule.values) && rule.values.includes(String(val ?? ""));
    if (matched) {
      decision = { sync_state: rule.action, matched_rule: rule.id, reason: rule.reason };
      break;
    }
  }
  if (decision.sync_state !== "local_only" && isLocalOnly(meta)) {
    return {
      sync_state: "local_only",
      matched_rule: "floor",
      reason: "Restricted data never leaves the local node (immutable residency floor)",
    };
  }
  return decision;
}

export function validatePolicy(p: unknown): string | null {
  if (!p || typeof p !== "object") return "policy must be an object";
  const obj = p as Partial<PolicyConfig>;
  if (!Array.isArray(obj.rules)) return "policy.rules must be a list";
  if (typeof obj.ttl_raw_sensor_seconds !== "number" || obj.ttl_raw_sensor_seconds < 0 || !Number.isInteger(obj.ttl_raw_sensor_seconds)) {
    return "ttl_raw_sensor_seconds must be a non-negative integer";
  }
  const fields = new Set(["sensitivity", "criticality", "domain"]);
  const actions = new Set(["local_only", "queued", "sync_now"]);
  for (const r of obj.rules) {
    if (!r || typeof r !== "object" || typeof r.id !== "string") return "every rule needs a string id";
    if (!fields.has(r.field)) return `rule ${r.id}: invalid field`;
    if (!actions.has(r.action)) return `rule ${r.id}: invalid action`;
    if (r.op === "eq") {
      if (typeof r.value !== "string") return `rule ${r.id}: eq needs string value`;
    } else if (r.op === "in") {
      if (!Array.isArray(r.values) || !r.values.every((v) => typeof v === "string")) {
        return `rule ${r.id}: in needs string[] values`;
      }
    } else {
      return `rule ${r.id}: op must be eq or in`;
    }
  }
  const matchesRestricted = (r: PolicyConfig["rules"][number]) =>
    r.field === "sensitivity" && (r.op === "eq" ? r.value === "restricted" : (r.values ?? []).includes("restricted"));
  const first = obj.rules.find((r) => r.field !== "sensitivity" || matchesRestricted(r));
  if (!first || !matchesRestricted(first) || first.action !== "local_only") {
    return "Residency floor violation: the first rule a restricted note can match must keep sensitivity=restricted as local_only";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hybrid Retrieval Engine (BM25 + Dense Semantic Hash Projection + RRF)
// ---------------------------------------------------------------------------

const SYNONYM_BUCKETS: Record<string, string[]> = {
  disconnect: ["offline", "airgap", "partition", "split", "link", "network", "unreachable", "drop"],
  timeout: ["hang", "stall", "latency", "slow", "backoff", "retry", "circuit", "breaker"],
  security: ["injection", "poison", "restricted", "secret", "credential", "token", "quarantine", "sandbox"],
  memory: ["vector", "shard", "cache", "eviction", "compaction", "bm25", "rrf", "index", "qdrant"],
  conflict: ["diverge", "merge", "overwrite", "resolution", "quorum", "consensus", "handoff"],
  hardware: ["cpu", "vram", "thermal", "throttle", "battery", "ups", "fan", "temperature"],
};

function tokenize(text: string): string[] {
  const clean = text.toLowerCase();
  const base = clean.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const expanded = [...base];
  for (const tok of base) {
    for (const [root, words] of Object.entries(SYNONYM_BUCKETS)) {
      if (tok === root || words.includes(tok)) {
        expanded.push(`syn_${root}`);
      }
    }
  }
  return expanded;
}

function denseEmbed(text: string): Float32Array {
  const vec = new Float32Array(DENSE_DIM);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h1 = hashIdx(tok, 1);
    const h2 = hashIdx(tok, 2);
    vec[h1 % DENSE_DIM] += 1.0;
    vec[h2 % DENSE_DIM] += 0.65;
    if (tok.length >= 4 && !tok.startsWith("syn_")) {
      for (let i = 0; i <= tok.length - 3; i++) {
        const tri = tok.slice(i, i + 3);
        vec[hashIdx(tri, 3) % DENSE_DIM] += 0.35;
      }
    }
  }
  let norm = 0;
  for (let i = 0; i < DENSE_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DENSE_DIM; i++) vec[i] /= norm;
  return vec;
}

function hashIdx(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < DENSE_DIM; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

function bm25Scores(queryTokens: string[], docs: StoredPoint[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (!docs.length || !queryTokens.length) return scores;
  const docTokens = docs.map((d) => {
    const t = tokenize(`${d.title ?? ""} ${d.slug ?? ""} ${d.asset_id ?? ""} ${d.text}`);
    const freq = new Map<string, number>();
    for (const w of t) freq.set(w, (freq.get(w) ?? 0) + 1);
    return { id: d.id, len: t.length || 1, freq };
  });
  const avgdl = docTokens.reduce((a, d) => a + d.len, 0) / docTokens.length || 1;
  const uniqQ = Array.from(new Set(queryTokens));
  const df = new Map<string, number>();
  for (const q of uniqQ) {
    df.set(q, docTokens.filter((d) => d.freq.has(q)).length);
  }
  const k1 = 1.2;
  const b = 0.75;
  const N = docs.length;
  for (const d of docTokens) {
    let s = 0;
    for (const q of uniqQ) {
      const f = d.freq.get(q) ?? 0;
      if (!f) continue;
      const n = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avgdl))));
    }
    scores.set(d.id, s);
  }
  return scores;
}

function runHybridQuery(
  points: StoredPoint[],
  query: string,
  mode: SearchMode,
  limit: number,
  filters?: SearchFilters,
  explain?: boolean,
): SearchHit[] {
  const filtered = points.filter((p) => {
    if (!filters) return true;
    for (const [k, v] of Object.entries(filters)) {
      if (v && String(p[k as keyof StoredPoint] ?? "") !== v) return false;
    }
    return true;
  });
  if (!filtered.length) return [];

  const qVec = denseEmbed(query);
  const qToks = tokenize(query);
  const sparseMap = bm25Scores(qToks, filtered);
  const denseMap = new Map<string, number>();
  for (const p of filtered) {
    const docText = `${p.title ?? ""} ${p.asset_id ?? ""} ${p.text}`;
    denseMap.set(p.id, cosine(qVec, denseEmbed(docText)));
  }

  const denseRanked = [...filtered].sort((a, b) => (denseMap.get(b.id) ?? 0) - (denseMap.get(a.id) ?? 0));
  const sparseRanked = [...filtered].sort((a, b) => (sparseMap.get(b.id) ?? 0) - (sparseMap.get(a.id) ?? 0));

  const denseRank = new Map<string, number>();
  const sparseRank = new Map<string, number>();
  denseRanked.forEach((p, idx) => denseRank.set(p.id, idx));
  sparseRanked.forEach((p, idx) => sparseRank.set(p.id, idx));

  const k = 2;
  const scored = filtered.map((p) => {
    const dScore = denseMap.get(p.id) ?? 0;
    const sScore = sparseMap.get(p.id) ?? 0;
    const rrf =
      1 / (k + (denseRank.get(p.id) ?? 99) + 1) +
      ((sScore > 0 ? 1 : 0.05) / (k + (sparseRank.get(p.id) ?? 99) + 1));
    const finalScore = mode === "dense" ? dScore : mode === "sparse" ? sScore : rrf;
    return { p, dScore, sScore, rrf, finalScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored.slice(0, limit).map(({ p, dScore, sScore, finalScore }) => ({
    id: p.id,
    score: Number(finalScore.toFixed(4)),
    slug: p.slug,
    title: p.title,
    text: p.text,
    domain: p.domain,
    criticality: p.criticality,
    sensitivity: p.sensitivity,
    origin_device: p.origin_device,
    sync_state: p.sync_state,
    asset_id: p.asset_id,
    updated_at: p.updated_at,
    ...(explain
      ? {
          scores: {
            dense: Number(dScore.toFixed(4)),
            sparse: Number(sScore.toFixed(4)),
            fused: Number(finalScore.toFixed(4)),
          },
        }
      : {}),
  }));
}

function manifestHash(shard: Record<string, StoredPoint>): string {
  const entries = Object.values(shard)
    .map((p) => `${p.id}:${p.updated_at}`)
    .sort()
    .join("|");
  return crypto.createHash("md5").update(entries).digest("hex").slice(0, 12);
}

function shardDiskBytes(shard: Record<string, StoredPoint>): number {
  return Object.values(shard).reduce((acc, p) => acc + Buffer.byteLength(JSON.stringify(p)) + 1600, 4096);
}

// ---------------------------------------------------------------------------
// Initial Autonomous AI Agent Edge Memory Mesh Seed
// ---------------------------------------------------------------------------

function createSeedState(): MeshStore {
  const now = Date.now();
  const cloudManuals: Record<string, StoredPoint> = {};
  const cloudIncidents: Record<string, StoredPoint> = {};

  const playbookSeeds = [
    {
      slug: "playbook-tool-sandbox-fallback",
      title: "Tool Sandbox Fallback Protocol",
      asset_id: "RUNTIME-01",
      criticality: "high",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "PROTOCOL-01: When an external tool endpoint times out (>3000ms) or returns 5xx during offline operation, fail over to local deterministic cache and queue side-effect mutations in WAL with idempotency key. Verify replay checksum before cloud flush.",
    },
    {
      slug: "playbook-prompt-injection-quarantine",
      title: "Zero-Trust Prompt Injection Containment",
      asset_id: "GUARD-04",
      criticality: "critical",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "PROTOCOL-04: Untrusted retrieval chunks containing tool-override directives must be quarantined in local-only memory and tagged restricted. Strip imperative instruction headers before feeding excerpts to synthesis LLMs.",
    },
    {
      slug: "playbook-split-brain-quorum",
      title: "Offline Split-Brain Partition Recovery",
      asset_id: "MESH-13",
      criticality: "high",
      sensitivity: "internal",
      origin_device: "device-gamma",
      text: "PROTOCOL-13: After a network partition heals, never silently last-write-wins overwrite shared playbooks. Compare manifest hashes per shard, surface divergent point IDs as explicit 3-way conflict cards, and preserve unsynced local edits across bootstrap.",
    },
    {
      slug: "playbook-rrf-hybrid-tuning",
      title: "Hybrid RRF Recall Calibration",
      asset_id: "VEC-02",
      criticality: "medium",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "Standard hybrid recall fuses 384d dense embeddings with BM25 sparse vectors via RRF (k=2). For exact agent error codes, slug IDs, or port numbers, ensure BM25 sparse prefetch window >= 4x limit so lexical anchors are never pruned.",
    },
    {
      slug: "playbook-credential-rotation",
      title: "Ephemeral Edge Token Rotation",
      asset_id: "AUTH-09",
      criticality: "high",
      sensitivity: "internal",
      origin_device: "device-gamma",
      text: "Rotate node gateway X-Edge-Token secrets every 24h while online. Never embed secrets inside NEXT_PUBLIC client bundles or exported snapshot artifacts. Constant-time compare on all non-health endpoints.",
    },
    {
      slug: "playbook-ttl-telemetry-pruning",
      title: "Telemetry Firehose TTL Pruning",
      asset_id: "TTL-06",
      criticality: "medium",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "Raw telemetry streams stay local-only and expire after ttl_raw_sensor_seconds (default 600s). Distill recurring threshold breaches into episodic traces before TTL sweep removes raw telemetry segments.",
    },
    {
      slug: "playbook-snapshot-airgap-handoff",
      title: "Air-Gapped Snapshot Handoff SOP",
      asset_id: "HANDOFF-07",
      criticality: "medium",
      sensitivity: "internal",
      origin_device: "device-gamma",
      text: "Export portable v1 snapshots between air-gapped field nodes via physical media. Export automatically strips local_only and restricted points so sensitive operator credentials never traverse handoff files.",
    },
  ];

  const traceSeeds = [
    {
      slug: "trace-beta-tool-timeout-cascade",
      title: "Agent-Beta: Tool Timeout Cascade Mitigated",
      asset_id: "AGENT-BETA",
      criticality: "high",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "RESOLVED by device-beta: Autonomous scout stalled on unreachable RPC tool during tunnel inspection. Circuit breaker tripped after 2s, routed synthesis to local hybrid shard, queued 4 task checkpoints, and replayed cleanly on link restore.",
    },
    {
      slug: "trace-gamma-rag-hallucination-loop",
      title: "Agent-Gamma: RAG Citation Drift Fixed",
      asset_id: "AGENT-GAMMA",
      criticality: "medium",
      sensitivity: "internal",
      origin_device: "device-gamma",
      text: "RESOLVED by device-gamma: Dense-only retrieval returned stale context on error code E-412. Switching query mode to RRF hybrid with BM25 lexical matching restored exact playbook rank-1 hit in 3.4ms.",
    },
    {
      slug: "trace-beta-memory-poison-blocked",
      title: "Agent-Beta: Residency Guard Blocked Exfiltration",
      asset_id: "GUARD-04",
      criticality: "critical",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "RESOLVED by device-beta: Policy floor intercepted an attempt to re-order rules above restricted quarantine. Sensitivity=restricted record stayed local_only across 3 full sync cycles and snapshot export.",
    },
    {
      slug: "trace-gamma-thermal-throttle",
      title: "Node-Gamma: Kiosk Thermal Throttle Recovery",
      asset_id: "NODE-GAMMA",
      criticality: "medium",
      sensitivity: "internal",
      origin_device: "device-gamma",
      text: "RESOLVED by device-gamma: Edge relay CPU reached 84C causing embedding latency spikes from 4ms to 48ms. Throttled batch ingestion threads=2 and cleared intake mesh filter; p95 latency returned to 3.8ms.",
    },
    {
      slug: "trace-beta-split-brain-resolved",
      title: "Agent-Beta: Concurrent SOP Edit Merged",
      asset_id: "MESH-13",
      criticality: "high",
      sensitivity: "internal",
      origin_device: "device-beta",
      text: "RESOLVED by device-beta: Divergent timeout threshold edits between Alpha (2000ms) and Beta (3000ms) detected via manifest hash diff on reconnect. Resolved via 3-way merge without dropping either field constraint.",
    },
  ];

  playbookSeeds.forEach((s, idx) => {
    const id = stableUuid(s.slug);
    cloudManuals[id] = {
      id,
      ...s,
      domain: "manual",
      sync_state: "synced",
      updated_at: now - (3 * 86400_000) + idx * 60_000,
    };
  });

  traceSeeds.forEach((s, idx) => {
    const id = stableUuid(s.slug);
    cloudIncidents[id] = {
      id,
      ...s,
      domain: "incident",
      sync_state: "synced",
      updated_at: now - (2 * 86400_000) + idx * 90_000,
    };
  });

  // Pre-seed Alpha with a starter subset so search & RAG work immediately,
  // while leaving extra cloud records for Bootstrap to pull down.
  const alphaManuals: Record<string, StoredPoint> = {};
  const alphaIncidents: Record<string, StoredPoint> = {};
  for (const p of Object.values(cloudManuals).slice(0, 4)) alphaManuals[p.id] = { ...p };
  for (const p of Object.values(cloudIncidents).slice(0, 3)) alphaIncidents[p.id] = { ...p };

  // Local restricted secret canary on Alpha (demonstrates residency floor!)
  const secretId = stableUuid("local-alpha-private-signing-key");
  alphaManuals[secretId] = {
    id: secretId,
    slug: "local-alpha-private-signing-key",
    title: "Local Node Signing Identity (Restricted)",
    asset_id: "ALPHA-KEY",
    criticality: "high",
    sensitivity: "restricted",
    domain: "manual",
    origin_device: "device-alpha",
    sync_state: "local_only",
    updated_at: now - 300_000,
    text: "RESTRICTED LOCAL SECRET: Ed25519 enclave attestation seed for node-alpha local enclave verification. Policy floor guarantees this entry never leaves node-alpha or reaches cloud LLMs.",
  };

  const sensorSeeds = [
    { slug: "tel-alpha-embed-p95", text: "Local vector search p95 latency 3.2 ms (hybrid RRF)", sensor_type: "latency", value: 3.2, unit: "ms", severity: "info", ageS: 25 },
    { slug: "tel-alpha-heap-rss", text: "Edge process memory footprint 94 MB RSS steady", sensor_type: "memory", value: 94, unit: "MB", severity: "info", ageS: 60 },
    { slug: "tel-alpha-queue-lag", text: "Replication queue backpressure 0 pending frames", sensor_type: "queue", value: 0, unit: "ops", severity: "info", ageS: 110 },
    { slug: "tel-alpha-link-rssi", text: "Uplink mesh signal -62 dBm nominal bandwidth", sensor_type: "network", value: -62, unit: "dBm", severity: "info", ageS: 180 },
    { slug: "tel-alpha-embed-spike-old", text: "Embedding batch latency spike 44.1 ms during cold load (superseded)", sensor_type: "latency", value: 44.1, unit: "ms", severity: "warning", ageS: 1400 },
    { slug: "tel-alpha-temp-old", text: "NPU package temperature 79 C thermal warning (superseded)", sensor_type: "temperature", value: 79, unit: "C", severity: "critical", ageS: 1900 },
    { slug: "tel-alpha-retry-old", text: "Cloud manifest poll retry backoff 30s (superseded)", sensor_type: "network", value: 30, unit: "s", severity: "warning", ageS: 2600 },
    { slug: "tel-alpha-wal-old", text: "WAL segment flush 128 KB dirty pages (superseded)", sensor_type: "storage", value: 128, unit: "KB", severity: "info", ageS: 3400 },
  ];

  const alphaSensors: Record<string, StoredPoint> = {};
  for (const s of sensorSeeds) {
    const id = stableUuid(s.slug);
    alphaSensors[id] = {
      id,
      slug: s.slug,
      title: s.slug,
      text: s.text,
      domain: "sensor",
      criticality: s.severity === "critical" ? "high" : "low",
      sensitivity: "internal",
      origin_device: "device-alpha",
      sync_state: "local_only",
      sensor_type: s.sensor_type,
      value: s.value,
      unit: s.unit,
      severity: s.severity,
      updated_at: now - s.ageS * 1000,
    };
  }

  return {
    active_device: "device-alpha",
    policy: structuredClone(DEFAULT_POLICY),
    cloud: {
      manuals: cloudManuals,
      incidents: cloudIncidents,
      sensors: {},
    },
    devices: {
      "device-alpha": {
        id: "device-alpha",
        name: "Alpha · Field Agent 01",
        location: "Edge Sector A — Relay Hub",
        technician: "Agent-Alpha (Autonomous)",
        kind: "unit",
        online: true,
        shards: {
          manuals: alphaManuals,
          incidents: alphaIncidents,
          sensors: alphaSensors,
        },
        queue: [],
        last_sync_at: now - 420_000,
        last_sync_summary: null,
        bytes_pushed: 0,
        bytes_pulled: 4820,
        last_manifests: {},
        synced_updated_at: Object.fromEntries(
          [...Object.values(alphaManuals), ...Object.values(alphaIncidents)]
            .filter((p) => p.sync_state === "synced")
            .map((p) => [p.id, p.updated_at]),
        ),
        conflicts: [],
      },
    },
    activity: [
      {
        ts: now - 120_000,
        device: "system",
        kind: "seed",
        message: "Clauset mesh initialized — 12 fleet records in Cloud Hub, 1 restricted canary quarantined on Alpha",
        meta: { cloud: 12 },
      },
      {
        ts: now - 60_000,
        device: "device-alpha",
        kind: "sync",
        message: "Starter memory synced — ready for offline hybrid recall & RAG",
        meta: { pulled: 7 },
      },
    ],
    retention: { expired_total: 0, last_run: null },
  };
}

class ProtocolRuntime {
  private store: MeshStore;

  constructor() {
    this.store = this.load();
  }

  private load(): MeshStore {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, "utf-8");
        const parsed = JSON.parse(raw) as MeshStore;
        if (parsed && parsed.devices && parsed.cloud && parsed.policy) {
          return parsed;
        }
      }
    } catch {
      /* fall back to fresh seed */
    }
    const fresh = createSeedState();
    this.save(fresh);
    return fresh;
  }

  private save(target: MeshStore = this.store) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(target, null, 2), "utf-8");
      fs.renameSync(tmp, STATE_FILE);
    } catch {
      /* In read-only serverless sandboxes, runtime keeps in-memory state cleanly */
    }
  }

  private log(device: string, kind: string, message: string, meta: Record<string, unknown> = {}) {
    this.store.activity.push({ ts: Date.now(), device, kind, message, meta });
    if (this.store.activity.length > 400) {
      this.store.activity = this.store.activity.slice(-400);
    }
  }

  private dev(deviceId?: string): DeviceRuntime {
    const id = deviceId || this.store.active_device;
    return this.store.devices[id] ?? this.store.devices[this.store.active_device];
  }

  private cloudStats(): CloudStats {
    const shards: CloudStats["shards"] = {};
    let total = 0;
    for (const s of SHARD_IDS) {
      const col = this.store.cloud[s];
      const count = Object.keys(col).length;
      total += count;
      shards[s] = {
        name: s,
        points: count,
        segments: Math.max(1, Math.ceil(count / 4)),
        disk_bytes: shardDiskBytes(col),
        manifest_hash: manifestHash(col),
      };
    }
    return { total_points: total, reachable: true, shards };
  }

  private remoteMembers() {
    const now = Date.now();
    const contrib: Record<string, number> = {};
    for (const s of SHARD_IDS) {
      for (const p of Object.values(this.store.cloud[s])) {
        const o = p.origin_device || "unknown";
        contrib[o] = (contrib[o] ?? 0) + 1;
      }
    }
    return [
      {
        id: "device-beta",
        name: "Beta · Autonomous Scout",
        location: "Edge Sector B — Recon Cell",
        technician: "Agent-Beta (Autonomous)",
        kind: "robot",
        online: true,
        active: false,
        live: false,
        federated: true,
        reachable: true,
        total_points: 11,
        queue_depth: 0,
        open_conflicts: 0,
        bytes_pushed: 3940,
        bytes_pulled: 2150,
        last_sync_at: now - 14 * 60_000,
        cloud_contributed: contrib["device-beta"] ?? 0,
        shards: [] as MemoryShardStat[],
      },
      {
        id: "device-gamma",
        name: "Gamma · Relay Watchtower",
        location: "Edge Sector C — Perimeter Air-Gap",
        technician: "Agent-Gamma (Watchtower)",
        kind: "kiosk",
        online: false,
        active: false,
        live: false,
        federated: true,
        reachable: false,
        total_points: 8,
        queue_depth: 2,
        open_conflicts: 0,
        bytes_pushed: 2180,
        bytes_pulled: 1890,
        last_sync_at: now - 51 * 60_000,
        cloud_contributed: contrib["device-gamma"] ?? 0,
        shards: [] as MemoryShardStat[],
      },
    ];
  }

  getState(): ProtocolState {
    const live = Object.values(this.store.devices).map((d) => ({
      id: d.id,
      name: d.name,
      location: d.location,
      technician: d.technician,
      online: d.online,
      live: true,
      kind: d.kind,
      total_points: SHARD_IDS.reduce((acc, s) => acc + Object.keys(d.shards[s]).length, 0),
    }));
    const remote = this.remoteMembers().map((m) => ({
      id: m.id,
      name: m.name,
      location: m.location,
      technician: m.technician,
      online: m.online,
      live: false,
      kind: m.kind,
      total_points: m.total_points,
      cloud_contributed: m.cloud_contributed,
    }));
    const shard_defs: Record<string, { desc: string; default_sync: string }> = {};
    for (const s of SHARD_IDS) {
      shard_defs[s] = { desc: SHARD_PRESENTATION[s].desc, default_sync: SHARD_PRESENTATION[s].defaultSync };
    }
    return {
      active_device: this.store.active_device,
      devices: [...live, ...remote],
      cloud: this.cloudStats(),
      policy: this.store.policy,
      shard_defs,
      engine_mode: "embedded-ts-mesh",
    };
  }

  getMemory(deviceId?: string): MemoryStats {
    const d = this.dev(deviceId);
    const shards: Record<string, MemoryShardStat> = {};
    let total = 0;
    for (const s of SHARD_IDS) {
      const col = d.shards[s];
      const count = Object.keys(col).length;
      total += count;
      shards[s] = {
        name: s,
        desc: SHARD_PRESENTATION[s].desc,
        points: count,
        segments: Math.max(1, Math.ceil(count / 4)),
        disk_bytes: shardDiskBytes(col),
        embedding: "Clauset-Mesh TF-IDF Cosine (128d) + BM25",
        manifest_hash: manifestHash(col),
        default_sync: SHARD_PRESENTATION[s].defaultSync,
      };
    }
    return { device: d.id, total_points: total, shards };
  }

  getFleet(): FleetOverview {
    const contrib: Record<string, number> = {};
    for (const s of SHARD_IDS) {
      for (const p of Object.values(this.store.cloud[s])) {
        const o = p.origin_device || "unknown";
        contrib[o] = (contrib[o] ?? 0) + 1;
      }
    }
    const devices: FleetDevice[] = Object.values(this.store.devices).map((d) => {
      const ms = this.getMemory(d.id);
      const ss = this.getSyncStatus(d.id);
      return {
        id: d.id,
        name: d.name,
        location: d.location,
        technician: d.technician,
        online: d.online,
        active: d.id === this.store.active_device,
        live: true,
        reachable: true,
        kind: d.kind,
        total_points: ms.total_points,
        queue_depth: ss.queue_depth,
        open_conflicts: ss.open_conflicts.length,
        last_sync_at: d.last_sync_at,
        bytes_pushed: d.bytes_pushed,
        bytes_pulled: d.bytes_pulled,
        cloud_contributed: contrib[d.id] ?? 0,
        shards: Object.values(ms.shards),
      };
    });
    return {
      devices: [...devices, ...this.remoteMembers()],
      cloud: this.cloudStats(),
      active_device: this.store.active_device,
    };
  }

  getPoints(shard: string, deviceId?: string, limit = 50): { shard: string; device: string; points: MemoryPoint[] } {
    const d = this.dev(deviceId);
    const s = (SHARD_IDS.includes(shard as ShardId) ? shard : "incidents") as ShardId;
    const pts = Object.values(d.shards[s])
      .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
      .slice(0, limit);
    return { shard: s, device: d.id, points: pts };
  }

  getPoint(shard: string, id: string, deviceId?: string): Record<string, unknown> | null {
    const d = this.dev(deviceId);
    const s = shard as ShardId;
    if (!SHARD_IDS.includes(s)) return null;
    const found = d.shards[s][id];
    return found ? { ...found, _id: found.id } : null;
  }

  deletePoint(shard: string, id: string, deviceId?: string): { ok: boolean; reason?: string } {
    const d = this.dev(deviceId);
    const s = shard as ShardId;
    if (!SHARD_IDS.includes(s)) return { ok: false, reason: "unknown shard" };
    const existed = Boolean(d.shards[s][id]);
    if (!existed) return { ok: false };
    delete d.shards[s][id];
    d.queue = d.queue.filter((q) => q.point_id !== id);
    this.log(d.id, "write", `Deleted point ${id.slice(0, 12)}… from ${s}`, { shard: s, point_id: id, action: "delete" });
    this.save();
    return { ok: true };
  }

  search(params: {
    device?: string;
    shard: string;
    query: string;
    mode?: SearchMode;
    limit?: number;
    filters?: SearchFilters;
    explain?: boolean;
  }): HybridSearchResponse {
    const d = this.dev(params.device);
    const s = params.shard as ShardId;
    if (!SHARD_IDS.includes(s)) throw new Error("unknown shard");
    const mode: SearchMode = params.mode ?? "hybrid";
    const limit = Math.max(1, Math.min(50, params.limit ?? 5));
    const t0 = performance.now();
    const results = runHybridQuery(
      Object.values(d.shards[s]),
      params.query,
      mode,
      limit,
      params.filters,
      params.explain,
    );
    const ms = Number(Math.max(0.4, performance.now() - t0).toFixed(2));
    this.log(
      d.id,
      "search",
      `${d.online ? "online" : "OFFLINE"} ${mode} recall on ${s}: "${params.query.slice(0, 42)}" -> ${results.length} hits in ${ms}ms`,
      { shard: s, mode, latency_ms: ms, hits: results.length, offline: !d.online },
    );
    this.save();
    return {
      results,
      latency_ms: ms,
      offline: !d.online,
      mode,
      shard: s,
      filters: params.filters as Record<string, string> | undefined,
      explained: Boolean(params.explain),
      engine_mode: "embedded-ts-mesh",
    };
  }

  writePoint(body: {
    device?: string;
    shard: string;
    text: string;
    slug?: string;
    domain?: string;
    criticality?: string;
    sensitivity?: string;
    asset_id?: string;
    title?: string;
    sensor_type?: string;
    value?: number;
    unit?: string;
    severity?: string;
    point_id?: string;
    origin_device?: string;
  }): WriteResult {
    const d = this.dev(body.device);
    const s = (SHARD_IDS.includes(body.shard as ShardId) ? body.shard : "incidents") as ShardId;
    const now = Date.now();
    const slug = (body.slug || `${s}-${now.toString(36)}`).trim();
    const pointId = body.point_id || stableUuid(slug);
    const domain = body.domain || (s === "manuals" ? "manual" : s === "sensors" ? "sensor" : "incident");
    const criticality = body.criticality || "medium";
    const sensitivity = normSensitivity(body.sensitivity);
    const decision = evaluatePolicy({ domain, criticality, sensitivity }, this.store.policy);

    const point: StoredPoint = {
      id: pointId,
      slug,
      title: body.title || slug,
      text: body.text.trim(),
      domain,
      criticality,
      sensitivity,
      origin_device: body.origin_device || d.id,
      sync_state: decision.sync_state,
      updated_at: now,
      asset_id: body.asset_id,
      sensor_type: body.sensor_type,
      value: body.value,
      unit: body.unit,
      severity: body.severity,
    };

    d.shards[s][pointId] = point;
    d.queue = d.queue.filter((q) => q.point_id !== pointId);

    let finalState: string = decision.sync_state;
    if (decision.sync_state === "sync_now" && d.online) {
      this.store.cloud[s][pointId] = { ...point, sync_state: "synced" };
      d.shards[s][pointId].sync_state = "synced";
      d.synced_updated_at[pointId] = now;
      d.bytes_pushed += Buffer.byteLength(JSON.stringify(point));
      finalState = "synced";
      this.log(d.id, "write", `Synced critical memory '${slug}' immediately (${decision.reason})`, {
        shard: s,
        point_id: pointId,
        sync_state: "synced",
      });
    } else if (decision.sync_state !== "local_only") {
      d.queue.push({
        shard: s,
        point_id: pointId,
        priority: decision.sync_state === "sync_now" ? 2 : criticality === "high" ? 1 : 0,
        queued_at: now,
      });
      this.log(d.id, "write", `Stored '${slug}' -> ${decision.sync_state} (${decision.reason})`, {
        shard: s,
        point_id: pointId,
        sync_state: decision.sync_state,
      });
    } else {
      this.log(d.id, "write", `Quarantined '${slug}' locally -> local_only (${decision.reason})`, {
        shard: s,
        point_id: pointId,
        sync_state: "local_only",
      });
    }

    this.save();
    return { point_id: pointId, slug, sync_state: finalState, decision };
  }

  setConnectivity(deviceId: string | undefined, online: boolean): { online: boolean } {
    const d = this.dev(deviceId);
    d.online = Boolean(online);
    this.log(d.id, "connectivity", `${d.id} link ${d.online ? "restored (ONLINE)" : "severed (AIR-GAPPED)"}`, {
      online: d.online,
    });
    this.save();
    return { online: d.online };
  }

  bootstrap(deviceId?: string) {
    const d = this.dev(deviceId);
    if (!d.online) {
      return { ok: false, pulled: 0, bytes_pulled: 0, reason: "node is offline — reconnect to bootstrap" };
    }
    let pulled = 0;
    let bytes = 0;
    let conflicts = 0;
    for (const s of SHARD_IDS) {
      for (const cp of Object.values(this.store.cloud[s])) {
        const local = d.shards[s][cp.id];
        if (!local) {
          d.shards[s][cp.id] = { ...cp, sync_state: "synced" };
          d.synced_updated_at[cp.id] = cp.updated_at;
          pulled++;
          bytes += Buffer.byteLength(JSON.stringify(cp));
        } else if (local.text !== cp.text && !d.queue.some((q) => q.point_id === cp.id)) {
          const alreadyOpen = d.conflicts.some((c) => c.point_id === cp.id && c.status === "open");
          if (!alreadyOpen && (d.synced_updated_at[cp.id] ?? 0) < cp.updated_at) {
            if (local.sync_state === "synced") {
              d.shards[s][cp.id] = { ...cp, sync_state: "synced" };
              d.synced_updated_at[cp.id] = cp.updated_at;
              pulled++;
              bytes += Buffer.byteLength(JSON.stringify(cp));
            } else {
              conflicts++;
            }
          }
        }
      }
      d.last_manifests[s] = manifestHash(this.store.cloud[s]);
    }
    d.bytes_pulled += bytes;
    d.last_sync_at = Date.now();
    this.log(d.id, "bootstrap", `Bootstrapped ${pulled} fleet points from Cloud Hub (${bytes} bytes)`, {
      pulled,
      bytes_pulled: bytes,
      conflicts,
    });
    this.save();
    return { ok: true, pulled, bytes_pulled: bytes, conflicts };
  }

  sync(deviceId?: string) {
    const d = this.dev(deviceId);
    if (!d.online) {
      return { ok: false, reason: "node is offline — queued writes preserved locally" };
    }
    const now = Date.now();
    let pushed = 0;
    let pulled = 0;
    let bytesPushed = 0;
    let bytesPulled = 0;
    let newConflicts = 0;

    // 1. Push queue ordered by priority desc
    const ordered = [...d.queue].sort((a, b) => b.priority - a.priority || a.queued_at - b.queued_at);
    d.queue = [];
    for (const q of ordered) {
      const local = d.shards[q.shard][q.point_id];
      if (!local) continue;
      const decision = evaluatePolicy(local, this.store.policy);
      if (decision.sync_state === "local_only") {
        local.sync_state = "local_only";
        this.log(d.id, "policy", `Held '${local.slug}' locally during sync (${decision.reason})`, {
          point_id: local.id,
        });
        continue;
      }
      const remote = this.store.cloud[q.shard][q.point_id];
      const lastSyncedAt = d.synced_updated_at[q.point_id] ?? 0;
      if (remote && remote.text !== local.text && remote.updated_at > lastSyncedAt) {
        this.raiseConflict(d, q.shard, local, remote);
        newConflicts++;
        continue;
      }
      const syncedPoint: StoredPoint = { ...local, sync_state: "synced" };
      this.store.cloud[q.shard][q.point_id] = syncedPoint;
      d.shards[q.shard][q.point_id] = { ...syncedPoint };
      d.synced_updated_at[q.point_id] = local.updated_at;
      pushed++;
      bytesPushed += Buffer.byteLength(JSON.stringify(syncedPoint));
    }

    // 2. Pull cloud updates via manifest diff
    const manifestDiffs: Record<string, { changed: boolean; cloud_hash: string; last_hash: string }> = {};
    for (const s of SHARD_IDS) {
      const cloudHash = manifestHash(this.store.cloud[s]);
      const lastHash = d.last_manifests[s] ?? "";
      const changed = cloudHash !== lastHash;
      manifestDiffs[s] = { changed, cloud_hash: cloudHash, last_hash: lastHash };
      if (changed) {
        for (const cp of Object.values(this.store.cloud[s])) {
          const local = d.shards[s][cp.id];
          const lastSynced = d.synced_updated_at[cp.id] ?? 0;
          if (!local) {
            d.shards[s][cp.id] = { ...cp, sync_state: "synced" };
            d.synced_updated_at[cp.id] = cp.updated_at;
            pulled++;
            bytesPulled += Buffer.byteLength(JSON.stringify(cp));
          } else if (local.text !== cp.text && cp.updated_at > lastSynced) {
            if (local.updated_at > lastSynced) {
              if (this.raiseConflict(d, s, local, cp)) newConflicts++;
            } else {
              d.shards[s][cp.id] = { ...cp, sync_state: "synced" };
              d.synced_updated_at[cp.id] = cp.updated_at;
              pulled++;
              bytesPulled += Buffer.byteLength(JSON.stringify(cp));
            }
          }
        }
        d.last_manifests[s] = cloudHash;
      }
    }

    d.bytes_pushed += bytesPushed;
    d.bytes_pulled += bytesPulled;
    d.last_sync_at = now;
    d.last_sync_summary = {
      pushed,
      pulled,
      bytes_pushed: bytesPushed,
      bytes_pulled: bytesPulled,
      new_conflicts: newConflicts,
      manifest_diffs: manifestDiffs,
      at: now,
    };

    this.log(
      d.id,
      "sync",
      `Sync complete — ${pushed} pushed, ${pulled} pulled${newConflicts ? `, ${newConflicts} conflict(s) surfaced` : ""}`,
      { pushed, pulled, new_conflicts: newConflicts },
    );
    this.save();
    return { ok: true, pushed, pulled, new_conflicts: newConflicts };
  }

  private raiseConflict(d: DeviceRuntime, shard: ShardId, local: StoredPoint, remote: StoredPoint): boolean {
    const existing = d.conflicts.find((c) => c.point_id === local.id && c.status === "open");
    if (existing) return false;
    const conflict: ConflictRecord = {
      id: `cnf-${crypto.randomUUID().slice(0, 8)}`,
      point_id: local.id,
      slug: local.slug,
      shard,
      local: {
        text: local.text,
        updated_at: local.updated_at,
        origin_device: local.origin_device,
        criticality: local.criticality,
        sensitivity: local.sensitivity,
      },
      remote: {
        text: remote.text,
        updated_at: remote.updated_at,
        origin_device: remote.origin_device,
        criticality: remote.criticality,
        sensitivity: remote.sensitivity,
      },
      status: "open",
      created_at: Date.now(),
    };
    d.conflicts.push(conflict);
    this.log(d.id, "conflict", `Divergence detected on '${local.slug}' (${local.origin_device} vs ${remote.origin_device})`, {
      conflict_id: conflict.id,
      shard,
    });
    return true;
  }

  getSyncStatus(deviceId?: string): SyncStatus {
    const d = this.dev(deviceId);
    return {
      device: d.id,
      online: d.online,
      queue_depth: d.queue.length,
      queue_critical: d.queue.filter((q) => q.priority > 0).length,
      last_sync_at: d.last_sync_at,
      last_sync_summary: d.last_sync_summary,
      bytes_pushed: d.bytes_pushed,
      bytes_pulled: d.bytes_pulled,
      open_conflicts: d.conflicts.filter((c) => c.status === "open"),
      resolved_conflicts: d.conflicts.filter((c) => c.status === "resolved"),
    };
  }

  triggerDemoConflict(deviceId?: string): { ok: boolean; slug: string; shard: string } {
    const d = this.dev(deviceId);
    const slug = "playbook-tool-sandbox-fallback";
    const shard: ShardId = "manuals";
    const pid = stableUuid(slug);
    const now = Date.now();

    const base = d.shards[shard][pid] ?? this.store.cloud[shard][pid];
    const remotePoint: StoredPoint = {
      id: pid,
      slug,
      title: base?.title ?? "Tool Sandbox Fallback Protocol",
      asset_id: base?.asset_id ?? "RUNTIME-01",
      domain: "manual",
      criticality: "high",
      sensitivity: "internal",
      origin_device: "device-beta",
      sync_state: "synced",
      updated_at: now - 1000,
      text: "PROTOCOL-01 (Beta Scout edit): Fail over after 3000ms RPC timeout, use local cache + WAL idempotency key, and throttle peer probe to 15s.",
    };
    const localPoint: StoredPoint = {
      ...remotePoint,
      origin_device: d.id,
      updated_at: now,
      sync_state: "queued",
      text: "PROTOCOL-01 (Alpha Field edit): Fail over immediately at 1500ms timeout under degraded link, retain WAL checksums, and emit local alert.",
    };

    this.store.cloud[shard][pid] = remotePoint;
    d.shards[shard][pid] = localPoint;
    d.synced_updated_at[pid] = now - 5000;
    d.last_manifests[shard] = "staged-diff";
    this.log(d.id, "demo", `Staged divergent edits on '${slug}' (Alpha vs Beta) — run sync to surface conflict`, {});
    this.save();
    return { ok: true, slug, shard };
  }

  resolveConflict(
    deviceId: string | undefined,
    conflictId: string,
    resolution: "local" | "remote" | "merge",
    mergedText?: string,
  ): { ok: boolean; synced?: boolean; reason?: string } {
    const d = this.dev(deviceId);
    const c = d.conflicts.find((x) => x.id === conflictId && x.status === "open");
    if (!c) return { ok: false, reason: "conflict not found" };
    const shard = c.shard as ShardId;
    const text =
      resolution === "merge"
        ? (mergedText || `${c.local.text}\n\n[Merged with ${c.remote.origin_device}]: ${c.remote.text}`).trim()
        : resolution === "local"
          ? c.local.text
          : c.remote.text;

    const current = d.shards[shard][c.point_id];
    const sensitivity = normSensitivity(current?.sensitivity ?? c.local.sensitivity);
    const criticality = current?.criticality ?? c.local.criticality ?? "medium";
    const domain = current?.domain ?? (shard === "manuals" ? "manual" : "incident");
    const decision = evaluatePolicy({ sensitivity, criticality, domain }, this.store.policy);
    const localOnly = decision.sync_state === "local_only";

    if (!localOnly && !d.online) {
      return { ok: false, reason: "node is offline — reconnect to resolve and sync" };
    }

    const now = Date.now();
    const resolvedPoint: StoredPoint = {
      id: c.point_id,
      slug: c.slug,
      title: current?.title ?? c.slug,
      asset_id: current?.asset_id,
      domain,
      criticality,
      sensitivity,
      origin_device: d.id,
      sync_state: localOnly ? "local_only" : "synced",
      updated_at: now,
      text,
    };

    if (!localOnly) {
      this.store.cloud[shard][c.point_id] = { ...resolvedPoint };
      d.synced_updated_at[c.point_id] = now;
    } else {
      d.synced_updated_at[c.point_id] = Math.max(d.synced_updated_at[c.point_id] ?? 0, c.remote.updated_at);
    }

    d.shards[shard][c.point_id] = resolvedPoint;
    d.queue = d.queue.filter((q) => q.point_id !== c.point_id);
    c.status = "resolved";
    c.resolution = resolution;
    this.log(
      d.id,
      "conflict",
      `Conflict '${c.slug}' resolved (${resolution})${localOnly ? " on-device only" : " & synced to Cloud Hub"}`,
      { conflict_id: conflictId, resolution },
    );
    this.save();
    return { ok: true, synced: !localOnly };
  }

  getActivity(device: string | null, limit = 60, since = 0): ActivityEntry[] {
    return this.store.activity
      .filter((e) => e.ts >= since && (!device || e.device === device || e.device === "system"))
      .slice(-limit)
      .reverse();
  }

  getPolicy(): PolicyConfig {
    return this.store.policy;
  }

  putPolicy(policy: PolicyConfig): { ok: true; policy: PolicyConfig } | { ok: false; error: string } {
    const err = validatePolicy(policy);
    if (err) return { ok: false, error: err };
    this.store.policy = policy;
    this.log("system", "policy", "Residency policy rules updated", {});
    this.save();
    return { ok: true, policy };
  }

  simulatePolicy(meta: { text?: string; criticality: string; sensitivity: string; domain: string }): PolicySimResponse {
    const normalized = {
      criticality: meta.criticality || "medium",
      sensitivity: normSensitivity(meta.sensitivity),
      domain: meta.domain || "incident",
    };
    const decision = evaluatePolicy(normalized, this.store.policy);
    const trace = this.store.policy.rules.map((rule) => {
      const pointValue = String(normalized[rule.field as keyof typeof normalized] ?? "");
      const matched =
        rule.op === "eq" ? pointValue === rule.value : (rule.values ?? []).includes(pointValue);
      return {
        id: rule.id,
        field: rule.field,
        op: rule.op,
        value: rule.value,
        values: rule.values,
        point_value: pointValue,
        matched,
        action: rule.action as SyncAction,
        reason: rule.reason,
        is_match: rule.id === decision.matched_rule,
      };
    });
    return { decision, trace, point_meta: normalized };
  }

  setActive(deviceId: string): { ok: boolean; active_device?: string; error?: string } {
    if (!this.store.devices[deviceId]) {
      return { ok: false, error: `${deviceId} is a remote federated peer — only live local nodes can be activated` };
    }
    this.store.active_device = deviceId;
    this.save();
    return { ok: true, active_device: deviceId };
  }

  cloudCollections(): CloudCollectionsResponse {
    const st = this.cloudStats();
    return {
      backend: "embedded-ts-mesh",
      url: null,
      total_points: st.total_points,
      reachable: true,
      collections: SHARD_IDS.map((s) => ({
        collection: `edge-${s}`,
        shard: s,
        ...st.shards[s],
      })),
    };
  }

  cloudPoints(collection: string, q = "", mode: SearchMode = "hybrid", limit = 50): CloudPointsResponse {
    const shard = (collection.replace(/^edge-/, "") || "incidents") as ShardId;
    const pts = Object.values(this.store.cloud[shard] ?? {});
    if (q.trim()) {
      const hits = runHybridQuery(pts, q.trim(), mode, limit);
      return {
        collection: `edge-${shard}`,
        shard,
        query: q,
        total: hits.length,
        points: hits as CloudPoint[],
      };
    }
    return {
      collection: `edge-${shard}`,
      shard,
      query: "",
      total: pts.length,
      points: pts.slice(0, limit) as CloudPoint[],
    };
  }

  cloudSearch(collection: string, query: string, mode: SearchMode = "hybrid", limit = 10): CloudSearchResponse {
    const shard = (collection.replace(/^edge-/, "") || "incidents") as ShardId;
    const pts = Object.values(this.store.cloud[shard] ?? {});
    const hits = runHybridQuery(pts, query, mode, limit);
    return { collection: `edge-${shard}`, shard, mode, points: hits as CloudPoint[] };
  }

  cloudDelete(collection: string, id: string): { ok: boolean; point_id: string } {
    const shard = (collection.replace(/^edge-/, "") || "incidents") as ShardId;
    const ok = Boolean(this.store.cloud[shard]?.[id]);
    if (ok) {
      delete this.store.cloud[shard][id];
      this.log(this.store.active_device, "delete", `Deleted point ${id.slice(0, 12)}… from Cloud Hub edge-${shard}`, {
        shard,
        point_id: id,
        scope: "cloud",
      });
      this.save();
    }
    return { ok, point_id: id };
  }

  exportSnapshot(deviceId?: string): SnapshotExport {
    const d = this.dev(deviceId);
    const shards: Record<string, Record<string, unknown>[]> = {};
    let excluded = 0;
    let total = 0;
    for (const s of SHARD_IDS) {
      const rows: Record<string, unknown>[] = [];
      for (const p of Object.values(d.shards[s])) {
        const dec = evaluatePolicy(p, this.store.policy);
        if (p.sync_state === "local_only" || dec.sync_state === "local_only") {
          excluded++;
          continue;
        }
        rows.push({ ...p, _id: p.id });
        total++;
      }
      shards[s] = rows;
    }
    this.log(d.id, "snapshot", `Exported snapshot — ${total} points (${excluded} restricted held back)`, {
      points: total,
    });
    this.save();
    return {
      format: "clauset-snapshot",
      version: 1,
      device: d.id,
      exported_at: Date.now(),
      point_count: total,
      excluded_local_only: excluded,
      shards,
    };
  }

  importSnapshot(deviceId: string | undefined, snap: SnapshotExport): SnapshotImportResult {
    const d = this.dev(deviceId);
    if (
      !snap ||
      (snap.format !== "clauset-snapshot" &&
        snap.format !== "13th-protocol-snapshot" &&
        snap.format !== "edge-mem-snapshot")
    ) {
      return { ok: false, reason: "snapshot format must be clauset-snapshot or edge-mem-snapshot" };
    }
    let imported = 0;
    let unchanged = 0;
    let conflicts = 0;
    let skipped = 0;
    const seen: Record<string, number> = {};
    for (const [shard, rows] of Object.entries(snap.shards ?? {})) {
      if (!SHARD_IDS.includes(shard as ShardId) || !Array.isArray(rows)) {
        skipped += Array.isArray(rows) ? rows.length : 1;
        continue;
      }
      const s = shard as ShardId;
      for (const raw of rows) {
        const pid = String(raw._id || raw.point_id || raw.id || "");
        const text = typeof raw.text === "string" ? raw.text : "";
        if (!pid || !text) {
          skipped++;
          continue;
        }
        const existing = d.shards[s][pid];
        if (existing) {
          if (existing.text === text) {
            unchanged++;
          } else {
            const remoteMock: StoredPoint = {
              id: pid,
              slug: String(raw.slug || existing.slug),
              text,
              domain: String(raw.domain || existing.domain),
              criticality: String(raw.criticality || existing.criticality),
              sensitivity: normSensitivity(raw.sensitivity || existing.sensitivity),
              origin_device: String(raw.origin_device || snap.device || "snapshot"),
              sync_state: "queued",
              updated_at: Number(raw.updated_at || Date.now()),
            };
            if (this.raiseConflict(d, s, existing, remoteMock)) conflicts++;
          }
        } else {
          this.writePoint({
            device: d.id,
            shard: s,
            point_id: pid,
            slug: typeof raw.slug === "string" ? raw.slug : undefined,
            title: typeof raw.title === "string" ? raw.title : undefined,
            domain: typeof raw.domain === "string" ? raw.domain : undefined,
            criticality: typeof raw.criticality === "string" ? raw.criticality : undefined,
            sensitivity: typeof raw.sensitivity === "string" ? raw.sensitivity : undefined,
            asset_id: typeof raw.asset_id === "string" ? raw.asset_id : undefined,
            origin_device: typeof raw.origin_device === "string" ? raw.origin_device : snap.device,
            text,
          });
          imported++;
          seen[s] = (seen[s] ?? 0) + 1;
        }
      }
    }
    this.save();
    return {
      ok: true,
      imported,
      unchanged,
      conflicts,
      skipped,
      source_device: snap.device,
      shards: seen,
    };
  }

  retentionStatus(): RetentionStatus {
    return {
      ttl_seconds: this.store.policy.ttl_raw_sensor_seconds,
      expired_total: this.store.retention.expired_total,
      last_run: this.store.retention.last_run,
    };
  }

  runRetention(deviceId?: string): RetentionStatus {
    const d = this.dev(deviceId);
    const ttlSeconds = this.store.policy.ttl_raw_sensor_seconds;
    const ttlMs = ttlSeconds * 1000;
    const now = Date.now();
    const sensors = d.shards.sensors;
    const ids = Object.keys(sensors);
    let expired = 0;
    for (const id of ids) {
      if (now - sensors[id].updated_at > ttlMs) {
        delete sensors[id];
        d.queue = d.queue.filter((q) => q.point_id !== id);
        expired++;
      }
    }
    this.store.retention.expired_total += expired;
    this.store.retention.last_run = now;
    if (expired > 0) {
      this.log(d.id, "retention", `TTL sweep expired ${expired} raw telemetry point(s) older than ${ttlSeconds}s`, {
        expired,
        checked: ids.length,
      });
      this.save();
    }
    return {
      ok: true,
      device: d.id,
      shard: "sensors",
      expired,
      checked: ids.length,
      ttl_seconds: ttlSeconds,
      expired_total: this.store.retention.expired_total,
      last_run: now,
    };
  }
}

const g = globalThis as unknown as { __protocolRuntime?: ProtocolRuntime };

export function getProtocolRuntime(): ProtocolRuntime {
  if (!g.__protocolRuntime) {
    g.__protocolRuntime = new ProtocolRuntime();
  }
  return g.__protocolRuntime;
}
