import type {
  ActivityEntry,
  CloudCollectionsResponse,
  CloudPointsResponse,
  CloudSearchResponse,
  FleetOverview,
  HybridSearchResponse,
  MemoryPoint,
  MemoryStats,
  PolicyConfig,
  PolicySimResponse,
  ProtocolChatResponse,
  ProtocolHealth,
  ProtocolState,
  RetentionStatus,
  SearchFilters,
  SearchMode,
  ShardId,
  SnapshotExport,
  SnapshotImportResult,
  SyncStatus,
  WriteResult,
} from "@/lib/protocol-types";

export interface ClientOptions {
  baseUrl?: string;
  nodePort?: number;
}

/**
 * ClausetClient — typed SDK wrapper around the Clauset Edge Memory Mesh Gateway.
 * Works identically whether backed by the Python Qdrant Edge engine or the Embedded TS Mesh Runtime.
 */
export class ClausetClient {
  private readonly baseUrl: string;
  private readonly nodePort: number;

  constructor(opts: ClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "").replace(/\/+$/, "");
    this.nodePort = opts.nodePort ?? 3030;
  }

  private url(subpath: string, query?: Record<string, string | number | boolean | undefined>): string {
    const sp = new URLSearchParams();
    sp.set("nodePort", String(this.nodePort));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
    }
    return `${this.baseUrl}/api/protocol/${subpath}?${sp.toString()}`;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    subpath: string,
    opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown; directPath?: string },
  ): Promise<T> {
    const target = opts?.directPath ? `${this.baseUrl}${opts.directPath}` : this.url(subpath, opts?.query);
    const res = await fetch(target, {
      method,
      headers: {
        Accept: "application/json",
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      body: method !== "GET" ? JSON.stringify(opts?.body ?? {}) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { error: text };
    }
    if (!res.ok) {
      const msg = (parsed as { error?: string })?.error || text.slice(0, 200) || `HTTP ${res.status}`;
      throw new Error(`Clauset ${method} ${subpath} failed (${res.status}): ${msg}`);
    }
    return parsed as T;
  }

  health(): Promise<ProtocolHealth> {
    return this.request("GET", "health");
  }

  state(): Promise<ProtocolState> {
    return this.request("GET", "state");
  }

  fleet(): Promise<FleetOverview> {
    return this.request("GET", "fleet");
  }

  memory(device?: string): Promise<MemoryStats> {
    return this.request("GET", "memory", { query: { device } });
  }

  points(shard: string, device?: string, limit = 50): Promise<{ shard: string; device: string; points: MemoryPoint[] }> {
    return this.request("GET", "points", { query: { shard, device, limit } });
  }

  getPoint(shard: string, id: string, device?: string): Promise<Record<string, unknown>> {
    return this.request("GET", "point", { query: { shard, id, device } });
  }

  deletePoint(shard: string, id: string, device?: string): Promise<{ ok: boolean; reason?: string }> {
    return this.request("POST", "point/delete", { body: { shard, id, device } });
  }

  search(params: {
    device?: string;
    shard: string;
    query: string;
    mode?: SearchMode;
    limit?: number;
    filters?: SearchFilters;
    explain?: boolean;
  }): Promise<HybridSearchResponse> {
    return this.request("POST", "search", { body: params });
  }

  ask(params: {
    query: string;
    shard?: ShardId | "all";
    mode?: SearchMode;
    device?: string;
  }): Promise<ProtocolChatResponse> {
    return this.request("POST", "chat", { directPath: "/api/protocol/chat", body: params });
  }

  remember(params: {
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
  }): Promise<WriteResult> {
    return this.request("POST", "write", { body: params });
  }

  setConnectivity(device: string, online: boolean): Promise<{ online: boolean }> {
    return this.request("POST", "connectivity", { body: { device, online } });
  }

  sync(device: string): Promise<{ ok?: boolean; pushed?: number; pulled?: number; new_conflicts?: number; reason?: string }> {
    return this.request("POST", "sync", { body: { device } });
  }

  bootstrap(device: string): Promise<{ ok: boolean; pulled: number; bytes_pulled: number; conflicts?: number; reason?: string }> {
    return this.request("POST", "bootstrap", { body: { device } });
  }

  syncStatus(device?: string): Promise<SyncStatus> {
    return this.request("GET", "sync-status", { query: { device } });
  }

  resolveConflict(
    device: string,
    conflict_id: string,
    resolution: "local" | "remote" | "merge",
    merged_text?: string,
  ): Promise<{ ok: boolean; synced?: boolean; reason?: string }> {
    return this.request("POST", "conflict/resolve", {
      body: { device, conflict_id, resolution, merged_text },
    });
  }

  demoConflict(device: string): Promise<{ ok: boolean; slug: string; shard: string }> {
    return this.request("POST", "demo/conflict", { body: { device } });
  }

  activity(device: string | null, limit = 60, since = 0): Promise<{ entries: ActivityEntry[] }> {
    return this.request("GET", "activity", { query: { device: device ?? "", limit, since } });
  }

  getPolicy(): Promise<PolicyConfig> {
    return this.request("GET", "policy");
  }

  putPolicy(policy: PolicyConfig): Promise<PolicyConfig> {
    return this.request("PUT", "policy", { body: policy });
  }

  simulatePolicy(params: {
    text: string;
    criticality: string;
    sensitivity: string;
    domain: string;
  }): Promise<PolicySimResponse> {
    return this.request("POST", "policy/simulate", { body: params });
  }

  setActiveNode(device: string): Promise<{ active_device: string }> {
    return this.request("POST", "active", { body: { device } });
  }

  cloudCollections(): Promise<CloudCollectionsResponse> {
    return this.request("GET", "cloud/collections");
  }

  cloudPoints(params: { collection: string; q?: string; mode?: SearchMode; limit?: number }): Promise<CloudPointsResponse> {
    return this.request("GET", "cloud/points", { query: params });
  }

  cloudSearch(params: { collection: string; query: string; mode?: SearchMode; limit?: number }): Promise<CloudSearchResponse> {
    return this.request("POST", "cloud/search", { body: params });
  }

  cloudDelete(params: { collection: string; id: string }): Promise<{ ok: boolean; point_id: string }> {
    return this.request("POST", "cloud/delete", { body: params });
  }

  exportSnapshot(device?: string): Promise<SnapshotExport> {
    return this.request("POST", "snapshot/export", { body: { device } });
  }

  importSnapshot(params: { device?: string; snapshot: SnapshotExport | string }): Promise<SnapshotImportResult> {
    return this.request("POST", "snapshot/import", { body: params });
  }

  retentionStatus(): Promise<RetentionStatus> {
    return this.request("GET", "retention/status");
  }

  runRetention(device?: string): Promise<RetentionStatus> {
    return this.request("POST", "retention/run", { body: { device } });
  }

  intelligence(body: { action: "distill_sop" | "auto_tag"; text: string; asset_id?: string; sensitivity?: string }) {
    return this.request<{
      ok: boolean;
      action: string;
      sop?: string;
      criticality?: string;
      sensitivity?: string;
      reason?: string;
      mode?: string;
    }>("POST", "intelligence", { directPath: "/api/protocol/intelligence", body });
  }
}

export const clausetClient = new ClausetClient();
export const protocolClient = clausetClient;
export { ClausetClient as ThirteenthProtocolClient };
