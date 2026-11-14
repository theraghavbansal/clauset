export type EngineMode = "python-edge-shard" | "embedded-ts-mesh";
export type ShardId = "manuals" | "incidents" | "sensors";
export type SearchMode = "hybrid" | "dense" | "sparse";
export type SyncAction = "local_only" | "queued" | "sync_now";
export type SyncState = SyncAction | "synced";
export type Sensitivity = "public" | "internal" | "restricted";
export type Criticality = "low" | "medium" | "high" | "critical";

export interface ShardPresentation {
  id: ShardId;
  label: string;
  shortLabel: string;
  domain: string;
  desc: string;
  defaultSync: string;
}

export const SHARD_PRESENTATION: Record<ShardId, ShardPresentation> = {
  manuals: {
    id: "manuals",
    label: "Agent Playbooks",
    shortLabel: "Playbooks",
    domain: "manual",
    desc: "Executable runbooks, tool-use protocols & safety specs",
    defaultSync: "synced",
  },
  incidents: {
    id: "incidents",
    label: "Episodic Traces",
    shortLabel: "Traces",
    domain: "incident",
    desc: "Agent execution post-mortems, anomalies & verified fixes",
    defaultSync: "synced",
  },
  sensors: {
    id: "sensors",
    label: "Telemetry Stream",
    shortLabel: "Telemetry",
    domain: "sensor",
    desc: "Ephemeral node metrics & TTL-governed heartbeat logs",
    defaultSync: "local_only",
  },
};

export const SHARD_IDS: ShardId[] = ["manuals", "incidents", "sensors"];

export function presentShard(id: string): ShardPresentation {
  if (id in SHARD_PRESENTATION) {
    return SHARD_PRESENTATION[id as ShardId];
  }
  return {
    id: "incidents",
    label: id,
    shortLabel: id,
    domain: id,
    desc: "Edge memory shard",
    defaultSync: "queued",
  };
}

export function presentNodeName(id: string, rawName?: string): string {
  const aliases: Record<string, string> = {
    "device-alpha": "Alpha · Field Agent 01",
    "device-beta": "Beta · Autonomous Scout",
    "device-gamma": "Gamma · Relay Watchtower",
  };
  return aliases[id] ?? rawName ?? id;
}

export interface ProtocolHealth {
  ok: boolean;
  service: string;
  protocol_version: string;
  engine_mode: EngineMode;
  engine_label: string;
  port: number;
  uptime_s: number;
  dense_model: string;
  dense_dim: number;
  cloud_reachable: boolean;
  python_engine_url: string | null;
}

export interface NodeSummary {
  id: string;
  name: string;
  location: string;
  technician: string;
  online: boolean;
  live: boolean;
  kind?: string;
  total_points: number;
  cloud_contributed?: number;
}

export interface CloudShardStat {
  name: string;
  points: number;
  segments: number;
  disk_bytes: number;
  manifest_hash: string;
}

export interface CloudStats {
  total_points: number;
  reachable?: boolean;
  shards: Record<string, CloudShardStat>;
}

export interface PolicyRule {
  id: string;
  field: string;
  op: "in" | "eq";
  values?: string[];
  value?: string;
  action: SyncAction;
  reason: string;
}

export interface PolicyConfig {
  rules: PolicyRule[];
  ttl_raw_sensor_seconds: number;
}

export interface PolicyEvalDecision {
  sync_state: SyncAction;
  matched_rule: string | null;
  reason: string;
}

export interface PolicyTraceStep {
  id: string;
  field: string;
  op: string;
  value?: string;
  values?: string[];
  point_value: string;
  matched: boolean;
  action: SyncAction;
  reason: string;
  is_match: boolean;
}

export interface PolicySimResponse {
  decision: PolicyEvalDecision;
  trace: PolicyTraceStep[];
  point_meta: Record<string, string>;
}

export interface ProtocolState {
  active_device: string;
  devices: NodeSummary[];
  cloud: CloudStats;
  policy: PolicyConfig;
  shard_defs: Record<string, { desc: string; default_sync: string }>;
  engine_mode?: EngineMode;
}

export interface MemoryShardStat {
  name: string;
  desc: string;
  points: number;
  segments: number;
  disk_bytes: number;
  embedding: string;
  manifest_hash: string;
  default_sync: string;
}

export interface MemoryStats {
  device: string;
  total_points: number;
  shards: Record<string, MemoryShardStat>;
}

export interface MemoryPoint {
  id: string;
  slug?: string;
  title?: string;
  text: string;
  domain?: string;
  criticality?: string;
  sensitivity?: string;
  origin_device?: string;
  sync_state?: string;
  updated_at?: number;
  asset_id?: string;
  sensor_type?: string;
  value?: number;
  unit?: string;
  severity?: string;
}

export type SearchFilterKey = "domain" | "criticality" | "sensitivity" | "origin_device";
export type SearchFilters = Partial<Record<SearchFilterKey, string>>;

export interface SearchHit {
  id: string;
  score: number;
  slug?: string;
  text: string;
  title?: string;
  domain?: string;
  criticality?: string;
  sensitivity?: string;
  origin_device?: string;
  asset_id?: string;
  sync_state?: string;
  updated_at?: number;
  scores?: { dense: number | null; sparse: number | null; fused: number };
}

export interface HybridSearchResponse {
  results: SearchHit[];
  latency_ms: number;
  offline: boolean;
  mode: string;
  shard: string;
  filters?: Record<string, string>;
  explained?: boolean;
  engine_mode?: EngineMode;
}

export interface WriteResult {
  point_id: string;
  slug: string;
  sync_state: string;
  decision: PolicyEvalDecision;
}

export interface ConflictSide {
  text: string;
  updated_at: number;
  origin_device: string;
  criticality?: string;
  sensitivity?: string;
}

export interface ConflictRecord {
  id: string;
  point_id: string;
  slug: string;
  shard: string;
  local: ConflictSide;
  remote: ConflictSide;
  status: "open" | "resolved";
  resolution?: string;
  created_at: number;
}

export interface SyncStatus {
  device: string;
  online: boolean;
  queue_depth: number;
  queue_critical: number;
  last_sync_at: number | null;
  last_sync_summary: {
    pushed: number;
    pulled: number;
    bytes_pushed: number;
    bytes_pulled: number;
    new_conflicts: number;
    manifest_diffs: Record<string, { changed: boolean; cloud_hash: string; last_hash: string }>;
    at: number;
  } | null;
  bytes_pushed: number;
  bytes_pulled: number;
  open_conflicts: ConflictRecord[];
  resolved_conflicts: ConflictRecord[];
}

export interface FleetDevice {
  id: string;
  name: string;
  location: string;
  technician: string;
  online: boolean;
  active: boolean;
  live: boolean;
  kind?: string;
  total_points: number;
  queue_depth: number;
  open_conflicts: number;
  last_sync_at: number | null;
  bytes_pushed: number;
  bytes_pulled: number;
  cloud_contributed: number;
  shards: MemoryShardStat[];
  reachable?: boolean;
  federated?: boolean;
}

export interface FleetOverview {
  devices: FleetDevice[];
  cloud: CloudStats;
  active_device: string;
}

export interface ActivityEntry {
  ts: number;
  device: string;
  kind: string;
  message: string;
  meta: Record<string, unknown>;
}

export interface CloudCollection {
  collection: string;
  shard: string;
  name: string;
  points: number;
  segments: number;
  disk_bytes: number;
  manifest_hash: string;
}

export interface CloudCollectionsResponse {
  backend: "qdrant-server" | "embedded-edge" | "embedded-ts-mesh";
  url: string | null;
  total_points: number;
  reachable?: boolean;
  collections: CloudCollection[];
}

export interface CloudPoint {
  id: string;
  slug?: string | null;
  text?: string | null;
  domain?: string | null;
  criticality?: string | null;
  sensitivity?: string | null;
  origin_device?: string | null;
  sync_state?: string | null;
  asset_id?: string | null;
  title?: string | null;
  updated_at?: number | null;
  score?: number | null;
}

export interface CloudPointsResponse {
  collection: string;
  shard: string;
  query: string;
  total: number;
  points: CloudPoint[];
}

export interface CloudSearchResponse {
  collection: string;
  shard: string;
  mode: string;
  points: CloudPoint[];
}

export interface SnapshotExport {
  format: string;
  version: number;
  device: string;
  exported_at: number;
  point_count: number;
  excluded_local_only: number;
  shards: Record<string, Record<string, unknown>[]>;
}

export interface SnapshotImportResult {
  ok: boolean;
  reason?: string;
  imported?: number;
  unchanged?: number;
  conflicts?: number;
  skipped?: number;
  source_device?: string;
  shards?: Record<string, number>;
}

export interface RetentionStatus {
  ok?: boolean;
  device?: string;
  shard?: string;
  expired?: number;
  checked?: number;
  ttl_seconds: number;
  expired_total: number;
  last_run: number | null;
}

export interface ChatCitation {
  index: number;
  id: string;
  shard: ShardId;
  title: string;
  slug?: string;
  score: number;
  sensitivity: string;
  origin_device?: string;
  quarantined: boolean;
  excerpt: string;
}

export interface ProtocolChatResponse {
  ok: boolean;
  answer: string;
  synthesis_mode: "cloud-llm" | "local-extractive";
  offline: boolean;
  latency_ms: number;
  quarantined_count: number;
  citations: ChatCitation[];
  model?: string;
}

export interface MeshMetricsTick {
  ts: number;
  engine_mode: EngineMode;
  local_points: number;
  cloud_points: number;
  devices: number;
  federated_reachable: number;
  queue_depth: number;
  open_conflicts: number;
  online: boolean;
}
