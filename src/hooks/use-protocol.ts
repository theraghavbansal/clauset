"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { protocolClient } from "@/sdk/client";
import type {
  ActivityEntry,
  FleetOverview,
  HybridSearchResponse,
  MemoryPoint,
  MemoryStats,
  MeshMetricsTick,
  ProtocolHealth,
  ProtocolState,
  SearchFilters,
  SearchMode,
  SyncStatus,
} from "@/lib/protocol-types";

export interface ProtocolNotice {
  id: string;
  title: string;
  detail?: string;
  tone: "info" | "ok" | "warn" | "error";
}

export interface PointInspectorRef extends MemoryPoint {
  shard: string;
}

export interface ProtocolController {
  health: ProtocolHealth | null;
  state: ProtocolState | null;
  syncStatus: SyncStatus | null;
  memory: MemoryStats | null;
  fleet: FleetOverview | null;
  activity: ActivityEntry[];
  telemetry: MeshMetricsTick[];
  loading: boolean;
  error: string | null;
  busy: string | null;
  notices: ProtocolNotice[];
  dismissNotice: (id: string) => void;
  pushNotice: (title: string, detail?: string, tone?: ProtocolNotice["tone"]) => void;
  activePoint: PointInspectorRef | null;
  openPoint: (p: PointInspectorRef) => void;
  closePoint: () => void;
  setOnline: (online: boolean) => Promise<void>;
  sync: () => Promise<boolean>;
  bootstrap: () => Promise<void>;
  write: (p: Parameters<typeof protocolClient.remember>[0]) => Promise<void>;
  search: (
    q: string,
    shard: string,
    mode: SearchMode,
    limit?: number,
    opts?: { filters?: SearchFilters; explain?: boolean },
  ) => Promise<HybridSearchResponse>;
  resolveConflict: (conflictId: string, resolution: "local" | "remote" | "merge", mergedText?: string) => Promise<boolean>;
  demoConflict: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useProtocol(): ProtocolController {
  const [health, setHealth] = useState<ProtocolHealth | null>(null);
  const [state, setState] = useState<ProtocolState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [memory, setMemory] = useState<MemoryStats | null>(null);
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [telemetry, setTelemetry] = useState<MeshMetricsTick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<ProtocolNotice[]>([]);
  const [activePoint, setActivePoint] = useState<PointInspectorRef | null>(null);

  const activeNodeRef = useRef("device-alpha");
  const sinceRef = useRef(0);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const pushNotice = useCallback(
    (title: string, detail?: string, tone: ProtocolNotice["tone"] = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setNotices((prev) => [...prev.slice(-3), { id, title, detail, tone }]);
      setTimeout(() => {
        setNotices((prev) => prev.filter((n) => n.id !== id));
      }, 4500);
    },
    [],
  );

  const refreshSnapshot = useCallback(async () => {
    try {
      const [h, st, ss, mem, fl] = await Promise.all([
        protocolClient.health(),
        protocolClient.state(),
        protocolClient.syncStatus(),
        protocolClient.memory(),
        protocolClient.fleet(),
      ]);
      activeNodeRef.current = st.active_device;
      setHealth(h);
      setState(st);
      setSyncStatus(ss);
      setMemory(mem);
      setFleet(fl);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActivity = useCallback(async () => {
    try {
      const res = await protocolClient.activity(activeNodeRef.current, 80, sinceRef.current);
      if (res.entries.length) {
        sinceRef.current = Math.max(...res.entries.map((e) => e.ts)) + 1;
        setActivity((prev) => {
          const map = new Map(prev.map((e) => [`${e.ts}-${e.message}`, e]));
          for (const e of res.entries) map.set(`${e.ts}-${e.message}`, e);
          return Array.from(map.values())
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 100);
        });
      }
    } catch {
      /* best effort polling */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void refreshSnapshot();
    }, 0);
    const id = setInterval(refreshSnapshot, 5000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    const t = setTimeout(() => {
      void refreshActivity();
    }, 0);
    const id = setInterval(refreshActivity, 4000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [refreshActivity]);

  // Live SSE telemetry stream for the Topology & Activity feed
  useEffect(() => {
    const es = new EventSource("/api/protocol/stream");
    const onMetrics = (evt: MessageEvent) => {
      try {
        const tick = JSON.parse(evt.data) as MeshMetricsTick;
        setTelemetry((prev) => [...prev.slice(-39), tick]);
      } catch {
        /* ignore malformed tick */
      }
    };
    es.addEventListener("metrics", onMetrics);
    return () => {
      es.removeEventListener("metrics", onMetrics);
      es.close();
    };
  }, []);

  const runAction = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      setBusy(label);
      try {
        const out = await fn();
        await Promise.all([refreshSnapshot(), refreshActivity()]);
        return out;
      } finally {
        setBusy(null);
      }
    },
    [refreshSnapshot, refreshActivity],
  );

  const setOnline = useCallback(
    (online: boolean) =>
      runAction("connectivity", async () => {
        await protocolClient.setConnectivity(activeNodeRef.current, online);
        pushNotice(
          online ? "Uplink restored" : "Node air-gapped",
          online
            ? "Mesh replication is active again. Pending queue can now flush."
            : "Local hybrid recall and policy writes remain fully operational offline.",
          online ? "ok" : "warn",
        );
      }),
    [runAction, pushNotice],
  );

  const sync = useCallback(
    () =>
      runAction("sync", async () => {
        const r = await protocolClient.sync(activeNodeRef.current);
        if (r.ok === false) {
          pushNotice("Sync deferred", r.reason ?? "Cloud hub unreachable", "error");
          return false;
        }
        const conflicts = r.new_conflicts ?? 0;
        pushNotice(
          conflicts > 0 ? "Sync surfaced conflict(s)" : "Mesh synchronized",
          `${r.pushed ?? 0} pushed, ${r.pulled ?? 0} pulled${conflicts ? `, ${conflicts} conflict(s) flagged` : ""}`,
          conflicts > 0 ? "warn" : "ok",
        );
        return true;
      }),
    [runAction, pushNotice],
  );

  const bootstrap = useCallback(
    () =>
      runAction("bootstrap", async () => {
        const r = await protocolClient.bootstrap(activeNodeRef.current);
        if (!r.ok) {
          pushNotice("Bootstrap blocked", r.reason ?? "Node offline", "error");
          return;
        }
        pushNotice("Fleet snapshot bootstrapped", `Pulled ${r.pulled} shared records to local shards`, "ok");
      }),
    [runAction, pushNotice],
  );

  const write = useCallback(
    (p: Parameters<typeof protocolClient.remember>[0]) =>
      runAction("write", async () => {
        const r = await protocolClient.remember({ device: activeNodeRef.current, ...p });
        pushNotice(
          `Stored -> ${r.sync_state.replace("_", " ")}`,
          r.decision.reason,
          r.sync_state === "local_only" ? "warn" : "ok",
        );
      }),
    [runAction, pushNotice],
  );

  const search = useCallback(
    async (
      query: string,
      shard: string,
      mode: SearchMode,
      limit = 5,
      opts?: { filters?: SearchFilters; explain?: boolean },
    ) => {
      const res = await protocolClient.search({
        device: activeNodeRef.current,
        shard,
        query,
        mode,
        limit,
        filters: opts?.filters,
        explain: opts?.explain ?? true,
      });
      void refreshActivity();
      return res;
    },
    [refreshActivity],
  );

  const resolveConflict = useCallback(
    (conflictId: string, resolution: "local" | "remote" | "merge", mergedText?: string) =>
      runAction("resolve", async () => {
        try {
          const r = await protocolClient.resolveConflict(activeNodeRef.current, conflictId, resolution, mergedText);
          if (!r.ok) {
            pushNotice("Resolution deferred", r.reason ?? "Could not resolve", "error");
            return false;
          }
          pushNotice(
            "Divergence resolved",
            r.synced ? `Committed (${resolution}) & replicated to Cloud Hub` : `Committed (${resolution}) locally`,
            "ok",
          );
          return true;
        } catch (err) {
          pushNotice("Resolution failed", err instanceof Error ? err.message : String(err), "error");
          return false;
        }
      }),
    [runAction, pushNotice],
  );

  const demoConflict = useCallback(
    () =>
      runAction("demo-conflict", async () => {
        const r = await protocolClient.demoConflict(activeNodeRef.current);
        pushNotice("Divergence staged", `Conflicting edits created on '${r.slug}'. Run Sync to inspect diff.`, "warn");
      }),
    [runAction, pushNotice],
  );

  return {
    health,
    state,
    syncStatus,
    memory,
    fleet,
    activity,
    telemetry,
    loading,
    error,
    busy,
    notices,
    dismissNotice,
    pushNotice,
    activePoint,
    openPoint: setActivePoint,
    closePoint: () => setActivePoint(null),
    setOnline,
    sync,
    bootstrap,
    write,
    search,
    resolveConflict,
    demoConflict,
    refresh: refreshSnapshot,
  };
}
