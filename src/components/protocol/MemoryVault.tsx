"use client";

import { useEffect, useState } from "react";
import { Cloud, Database, Loader2, Plus, Search, Shield, Sparkles, Trash2 } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { clausetClient } from "@/sdk/client";
import {
  SHARD_IDS,
  presentShard,
  type CloudCollectionsResponse,
  type CloudPoint,
  type MemoryPoint,
  type PolicySimResponse,
  type ShardId,
} from "@/lib/protocol-types";
import {
  CriticalityTag,
  PrimaryButton,
  SensitivityTag,
  StatusBadge,
  SyncStateTag,
  WorkbenchCard,
  cn,
  formatRelative,
} from "./WorkbenchUI";

const PRESET_TEMPLATES = [
  {
    label: "Tool Timeout Trace",
    shard: "incidents" as ShardId,
    title: "RPC Tool Circuit Breaker Triggered",
    asset_id: "AGENT-ALPHA",
    criticality: "high",
    sensitivity: "internal",
    text: "Autonomous task stalled >3000ms calling external tool webhook. Local fallback switched to cached playbook WAL and preserved state offline.",
  },
  {
    label: "Restricted Secret Canary",
    shard: "manuals" as ShardId,
    title: "Enclave Key Material (Restricted)",
    asset_id: "SEC-ENCLAVE",
    criticality: "critical",
    sensitivity: "restricted",
    text: "RESTRICTED CREDENTIAL: Local hardware enclave attestation key 0x9F1A... must stay strictly on-device across syncs and snapshots.",
  },
  {
    label: "Telemetry Burst",
    shard: "sensors" as ShardId,
    title: "NPU Thermal Warning",
    asset_id: "NODE-ALPHA",
    criticality: "medium",
    sensitivity: "internal",
    text: "Edge inference NPU package reached 81C during concurrent embedding indexing; throttled batch size to 2 threads.",
  },
];

export default function MemoryVault({ ctrl }: { ctrl: ProtocolController }) {
  const [shard, setShard] = useState<ShardId>("incidents");
  const [points, setPoints] = useState<MemoryPoint[]>([]);
  const [loadedShard, setLoadedShard] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [rightTab, setRightTab] = useState<"compose" | "cloud">("compose");
  const loadingPts = loadedShard !== shard;

  // Composer state
  const [title, setTitle] = useState("");
  const [assetId, setAssetId] = useState("");
  const [criticality, setCriticality] = useState("high");
  const [sensitivity, setSensitivity] = useState("internal");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [preview, setPreview] = useState<PolicySimResponse | null>(null);

  // Cloud catalog state
  const [cloudCols, setCloudCols] = useState<CloudCollectionsResponse | null>(null);
  const [cloudCol, setCloudCol] = useState("edge-incidents");
  const [cloudPoints, setCloudPoints] = useState<CloudPoint[]>([]);
  const [cloudQuery, setCloudQuery] = useState("");

  useEffect(() => {
    let cancel = false;
    clausetClient
      .points(shard, ctrl.state?.active_device, 60)
      .then((res) => {
        if (!cancel) {
          setPoints(res.points);
          setLoadedShard(shard);
        }
      })
      .catch(() => {
        if (!cancel) {
          setPoints([]);
          setLoadedShard(shard);
        }
      });
    return () => {
      cancel = true;
    };
  }, [shard, ctrl.memory, ctrl.state?.active_device]);

  useEffect(() => {
    const domain = shard === "manuals" ? "manual" : shard === "sensors" ? "sensor" : "incident";
    clausetClient
      .simulatePolicy({ text: text || "sample", criticality, sensitivity, domain })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [shard, criticality, sensitivity, text]);

  async function refreshCloud(col = cloudCol, q = cloudQuery) {
    try {
      const [cols, pts] = await Promise.all([
        clausetClient.cloudCollections(),
        clausetClient.cloudPoints({ collection: col, q, limit: 30 }),
      ]);
      setCloudCols(cols);
      setCloudPoints(pts.points);
    } catch {
      /* cloud may be unreachable */
    }
  }

  useEffect(() => {
    if (rightTab !== "cloud") return;
    let cancel = false;
    Promise.all([
      clausetClient.cloudCollections(),
      clausetClient.cloudPoints({ collection: cloudCol, q: cloudQuery, limit: 30 }),
    ])
      .then(([cols, pts]) => {
        if (!cancel) {
          setCloudCols(cols);
          setCloudPoints(pts.points);
        }
      })
      .catch(() => null);
    return () => {
      cancel = true;
    };
  }, [rightTab, cloudCol, cloudQuery]);

  async function autoClassify() {
    if (!text.trim()) return;
    setClassifying(true);
    try {
      const r = await clausetClient.intelligence({ action: "auto_tag", text, sensitivity });
      if (r.criticality) setCriticality(r.criticality);
      if (r.sensitivity) setSensitivity(r.sensitivity);
      ctrl.pushNotice("Auto-classified", r.reason, "info");
    } finally {
      setClassifying(false);
    }
  }

  async function submitWrite(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await ctrl.write({
        shard,
        title: title.trim() || undefined,
        asset_id: assetId.trim() || undefined,
        criticality,
        sensitivity,
        text: text.trim(),
      });
      setTitle("");
      setText("");
      setAssetId("");
    } finally {
      setSaving(false);
    }
  }

  const q = filterText.trim().toLowerCase();
  const filtered = points.filter(
    (p) =>
      !q ||
      `${p.title ?? ""} ${p.slug ?? ""} ${p.text} ${p.asset_id ?? ""} ${p.origin_device ?? ""}`
        .toLowerCase()
        .includes(q),
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* LEFT PANE: Local Shard Browser */}
      <WorkbenchCard
        title="Local Shard Vault"
        subtitle={`${ctrl.memory?.total_points ?? 0} total points stored on active edge node`}
        className="xl:col-span-7"
        noPadding
        actions={
          <div className="flex rounded-lg border border-stone-300 bg-stone-100 p-0.5 dark:border-slate-700 dark:bg-slate-900">
            {SHARD_IDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShard(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  shard === s
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-slate-400 dark:hover:text-slate-100",
                )}
              >
                {presentShard(s).shortLabel} ({ctrl.memory?.shards[s]?.points ?? 0})
              </button>
            ))}
          </div>
        }
      >
        <div className="border-b border-stone-200 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-slate-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={`Filter ${presentShard(shard).label.toLowerCase()} by title, slug, asset, or body...`}
              className="h-8 w-full rounded-lg border border-stone-300 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="clauset-scroll max-h-[560px] divide-y divide-stone-200 overflow-y-auto dark:divide-slate-800">
          {loadingPts ? (
            <div className="p-8 text-center text-xs text-zinc-500 dark:text-slate-400">
              Loading shard records...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 dark:text-slate-400">
              No records match filter.
            </div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => ctrl.openPoint({ ...p, shard })}
                className="cursor-pointer px-4 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-slate-900/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Database className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-slate-500" />
                    <span className="truncate font-display text-xs font-semibold text-zinc-900 dark:text-slate-100">
                      {p.title || p.slug || p.id.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <CriticalityTag value={p.criticality} />
                    <SensitivityTag value={p.sensitivity} />
                    <SyncStateTag value={p.sync_state} />
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-zinc-600 dark:text-slate-300">{p.text}</p>
                <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-zinc-400 dark:text-slate-500">
                  <span>
                    {p.origin_device ?? "local"}
                    {p.asset_id ? ` · ${p.asset_id}` : ""}
                  </span>
                  <span>{formatRelative(p.updated_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </WorkbenchCard>

      {/* RIGHT PANE: Write Memory Composer OR Cloud Hub Catalog */}
      <WorkbenchCard
        title={rightTab === "compose" ? "Index New Memory" : "Cloud Qdrant Catalog"}
        subtitle={
          rightTab === "compose"
            ? "Residency policy evaluates every write before touching the sync queue"
            : `${cloudCols?.total_points ?? 0} total points across shared fleet collections`
        }
        className="xl:col-span-5"
        actions={
          <div className="flex rounded-lg border border-stone-300 bg-stone-100 p-0.5 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setRightTab("compose")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer",
                rightTab === "compose"
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-zinc-600 dark:text-slate-400",
              )}
            >
              Composer
            </button>
            <button
              type="button"
              onClick={() => setRightTab("cloud")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer",
                rightTab === "cloud"
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-zinc-600 dark:text-slate-400",
              )}
            >
              Cloud Hub
            </button>
          </div>
        }
      >
        {rightTab === "compose" ? (
          <form onSubmit={submitWrite} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setShard(tpl.shard);
                    setTitle(tpl.title);
                    setAssetId(tpl.asset_id);
                    setCriticality(tpl.criticality);
                    setSensitivity(tpl.sensitivity);
                    setText(tpl.text);
                  }}
                  className="rounded-md border border-stone-300 bg-stone-50 px-2 py-1 text-[11px] text-zinc-700 hover:border-blue-600 hover:bg-white cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400"
                >
                  + {tpl.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short memory headline"
                  className="h-8 w-full rounded-lg border border-stone-300 bg-stone-50 px-2.5 text-xs outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Agent / Asset ID
                </label>
                <input
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  placeholder="e.g. AGENT-ALPHA"
                  className="h-8 w-full rounded-lg border border-stone-300 bg-stone-50 px-2.5 font-mono text-xs outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Criticality
                </label>
                <select
                  value={criticality}
                  onChange={(e) => setCriticality(e.target.value)}
                  className="h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Sensitivity
                </label>
                <select
                  value={sensitivity}
                  onChange={(e) => setSensitivity(e.target.value)}
                  className="h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="internal">internal</option>
                  <option value="public">public</option>
                  <option value="restricted">restricted (never leaves node)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Memory Payload
                </label>
                <button
                  type="button"
                  disabled={!text.trim() || classifying}
                  onClick={() => void autoClassify()}
                  className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-blue-700 hover:underline disabled:opacity-45 cursor-pointer dark:text-blue-400"
                >
                  {classifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Auto-Classify
                </button>
              </div>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a playbook rule, incident resolution, or telemetry observation..."
                className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-xs outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {preview && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-zinc-600 dark:text-slate-300">
                    <Shield className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                    Policy Preview ({preview.decision.matched_rule ?? "default"})
                  </span>
                  <SyncStateTag value={preview.decision.sync_state} />
                </div>
                <p className="mt-1 text-[11px] text-zinc-600 dark:text-slate-400">{preview.decision.reason}</p>
              </div>
            )}

            <PrimaryButton type="submit" disabled={saving || !text.trim()} className="w-full">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Commit to {presentShard(shard).shortLabel} Shard
            </PrimaryButton>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={cloudCol}
                onChange={(e) => setCloudCol(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-stone-300 bg-white px-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="edge-incidents">edge-incidents</option>
                <option value="edge-manuals">edge-manuals</option>
                <option value="edge-sensors">edge-sensors</option>
              </select>
              <PrimaryButton variant="outline" onClick={() => void refreshCloud()}>
                <Cloud className="h-3.5 w-3.5" /> Refresh
              </PrimaryButton>
            </div>

            <div className="flex gap-2">
              <input
                value={cloudQuery}
                onChange={(e) => setCloudQuery(e.target.value)}
                placeholder="Search cloud collection..."
                className="h-8 flex-1 rounded-lg border border-stone-300 bg-stone-50 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <PrimaryButton variant="outline" onClick={() => void refreshCloud(cloudCol, cloudQuery)}>
                Search
              </PrimaryButton>
            </div>

            <div className="clauset-scroll max-h-[420px] space-y-2 overflow-y-auto">
              {cloudPoints.map((cp) => (
                <div
                  key={cp.id}
                  className="rounded-lg border border-stone-200 bg-stone-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-semibold text-zinc-900 dark:text-slate-100">
                      {cp.title || cp.slug || cp.id.slice(0, 10)}
                    </span>
                    <button
                      type="button"
                      title="Delete from Cloud Hub"
                      onClick={async () => {
                        await clausetClient.cloudDelete({ collection: cloudCol, id: cp.id });
                        await refreshCloud();
                        await ctrl.refresh();
                      }}
                      className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-zinc-600 dark:text-slate-300">{cp.text}</p>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-400 dark:text-slate-500">
                    <span>origin: {cp.origin_device ?? "fleet"}</span>
                    <StatusBadge tone="ok">{cp.sensitivity ?? "internal"}</StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </WorkbenchCard>
    </div>
  );
}
