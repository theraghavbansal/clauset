"use client";

import { useState } from "react";
import { Cloud, Cpu, Radio, RefreshCw, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { presentNodeName, presentShard } from "@/lib/protocol-types";
import { PrimaryButton, StatusBadge, cn, formatBytes, formatRelative } from "./WorkbenchUI";

type SelectedTarget = "cloud" | "device-alpha" | "device-beta" | "device-gamma";

export default function TopologyCanvas({
  ctrl,
  onNavigate,
}: {
  ctrl: ProtocolController;
  onNavigate: (view: "overview" | "rag" | "vault" | "sync" | "governance") => void;
}) {
  const [selected, setSelected] = useState<SelectedTarget>("device-alpha");

  const devices = ctrl.fleet?.devices ?? [];
  const alpha = devices.find((d) => d.id === "device-alpha") ?? devices[0];
  const beta = devices.find((d) => d.id === "device-beta");
  const gamma = devices.find((d) => d.id === "device-gamma");

  const online = ctrl.syncStatus?.online ?? true;
  const queued = ctrl.syncStatus?.queue_depth ?? 0;
  const conflicts = ctrl.syncStatus?.open_conflicts.length ?? 0;
  const cloudPoints = ctrl.state?.cloud.total_points ?? 0;
  const cloudReachable = ctrl.state?.cloud.reachable !== false;
  const isSyncing = ctrl.busy === "sync" || ctrl.busy === "bootstrap";

  const selectedDevice = devices.find((d) => d.id === selected);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* Interactive SVG Topology Map */}
      <div className="overflow-hidden rounded-xl border border-stone-300/90 bg-white shadow-[0_1px_2px_rgba(17,19,24,0.04)] dark:border-slate-800 dark:bg-[#141a26] xl:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-slate-100">
              Live Mesh Topology &amp; Sync Fabric
            </h2>
            <p className="text-xs text-zinc-500 dark:text-slate-400">
              Click any node or Cloud Hub to inspect shard counts, sync queues, and link integrity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={online ? "ok" : "warn"}>
              {online ? "Uplink Active" : "Air-Gapped"}
            </StatusBadge>
            {conflicts > 0 && <StatusBadge tone="crit">{conflicts} Divergence</StatusBadge>}
          </div>
        </div>

        <div className="clauset-grid-bg relative p-4">
          <svg
            viewBox="0 0 720 340"
            className="h-auto w-full select-none"
            role="img"
            aria-label="Clauset Autonomous Edge Mesh Topology"
          >
            {/* Link: Alpha <-> Cloud Hub */}
            <line
              x1="150"
              y1="235"
              x2="360"
              y2="82"
              stroke={!online ? "#D97706" : conflicts > 0 ? "#E11D48" : isSyncing ? "#3B82F6" : "#0D9488"}
              strokeWidth={isSyncing ? 3 : 2}
              strokeDasharray={!online ? "5 6" : isSyncing ? "8 6" : "0"}
              className={cn(online && isSyncing && "animate-packet-flow")}
            />
            <g transform="translate(212, 146)">
              <rect
                x="-46"
                y="-12"
                width="92"
                height="22"
                rx="5"
                className="fill-white stroke-stone-300 dark:fill-slate-900 dark:stroke-slate-700"
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                className="fill-zinc-700 font-mono text-[10px] font-medium dark:fill-slate-200"
              >
                {!online
                  ? "AIR-GAPPED"
                  : isSyncing
                    ? "SYNCING..."
                    : queued > 0
                      ? `${queued} QUEUED`
                      : "LINK SYNCED"}
              </text>
            </g>

            {/* Link: Beta <-> Cloud Hub */}
            <line
              x1="360"
              y1="240"
              x2="360"
              y2="92"
              stroke={beta?.reachable !== false ? "#0D9488" : "#64748B"}
              strokeWidth="2"
              strokeDasharray="4 4"
            />

            {/* Link: Gamma <-> Cloud Hub (Partitioned) */}
            <line
              x1="570"
              y1="235"
              x2="360"
              y2="82"
              stroke="#D97706"
              strokeWidth="1.75"
              strokeDasharray="4 6"
              opacity="0.75"
            />
            <g transform="translate(495, 148)">
              <rect
                x="-42"
                y="-11"
                width="84"
                height="20"
                rx="5"
                className="fill-amber-50 stroke-amber-300 dark:fill-amber-950 dark:stroke-amber-700"
              />
              <text x="0" y="2.5" textAnchor="middle" className="fill-amber-800 font-mono text-[9.5px] dark:fill-amber-300">
                PARTITIONED
              </text>
            </g>

            {/* Peer-to-peer horizontal bus Alpha <-> Beta */}
            <line
              x1="210"
              y1="255"
              x2="300"
              y2="255"
              stroke={online ? "#3B82F6" : "#64748B"}
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />

            {/* CLOUD HUB NODE */}
            <g
              onClick={() => setSelected("cloud")}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Inspect Cloud Qdrant Hub"
            >
              <rect
                x="255"
                y="22"
                width="210"
                height="68"
                rx="10"
                className="fill-white dark:fill-[#141a26]"
                stroke={selected === "cloud" ? "#3B82F6" : cloudReachable ? "#0D9488" : "#E11D48"}
                strokeWidth={selected === "cloud" ? 2.5 : 1.5}
              />
              <circle cx="281" cy="46" r="11" className={cloudReachable ? "fill-teal-100 dark:fill-teal-950" : "fill-rose-100 dark:fill-rose-950"} />
              <circle cx="281" cy="46" r="4.5" fill={cloudReachable ? "#14B8A6" : "#F43F5E"} />
              <text x="300" y="44" className="fill-zinc-900 font-display text-[13px] font-bold dark:fill-slate-100">
                Cloud Qdrant Hub
              </text>
              <text x="300" y="61" className="fill-zinc-500 font-mono text-[10.5px] dark:fill-slate-400">
                {cloudPoints} shared pts · 3 shards
              </text>
              <text x="300" y="76" className="fill-zinc-400 font-mono text-[9.5px] dark:fill-slate-500">
                {ctrl.health?.engine_mode === "python-edge-shard" ? "Qdrant Server" : "Mesh Cloud Store"}
              </text>
            </g>

            {/* NODE ALPHA (Primary Active Local Node) */}
            <g
              onClick={() => setSelected("device-alpha")}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Inspect Alpha Field Agent Node"
            >
              <rect
                x="42"
                y="214"
                width="196"
                height="96"
                rx="10"
                className="fill-white dark:fill-[#141a26]"
                stroke={
                  selected === "device-alpha"
                    ? "#3B82F6"
                    : !online
                      ? "#D97706"
                      : conflicts > 0
                        ? "#E11D48"
                        : "#0D9488"
                }
                strokeWidth={selected === "device-alpha" ? 2.5 : 1.5}
              />
              <rect x="42" y="214" width="196" height="22" rx="10" className="fill-slate-900 dark:fill-slate-800" />
              <rect x="42" y="228" width="196" height="8" className="fill-slate-900 dark:fill-slate-800" />
              <circle cx="57" cy="225" r="3.5" fill={online ? "#2DD4BF" : "#F59E0B"} />
              <text x="68" y="229" className="fill-white font-mono text-[10px] font-semibold">
                ACTIVE NODE · ALPHA
              </text>
              <text x="54" y="255" className="fill-zinc-900 font-display text-[13px] font-bold dark:fill-slate-100">
                Field Agent 01
              </text>
              <text x="54" y="273" className="fill-zinc-500 font-mono text-[10.5px] dark:fill-slate-400">
                Local: {alpha?.total_points ?? ctrl.memory?.total_points ?? 0} pts · Queue: {queued}
              </text>
              <text x="54" y="292" className="fill-zinc-400 font-mono text-[9.5px] dark:fill-slate-500">
                {online ? "Hybrid RRF Ready" : "Offline Autonomy Mode"}
              </text>
            </g>

            {/* NODE BETA (Federated Scout Peer) */}
            <g
              onClick={() => setSelected("device-beta")}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Inspect Beta Autonomous Scout Node"
            >
              <rect
                x="262"
                y="224"
                width="196"
                height="86"
                rx="10"
                className="fill-white dark:fill-[#141a26]"
                stroke={selected === "device-beta" ? "#3B82F6" : "#475569"}
                strokeWidth={selected === "device-beta" ? 2.5 : 1.3}
              />
              <circle cx="280" cy="245" r="4" fill={beta?.reachable !== false ? "#14B8A6" : "#94A3B8"} />
              <text x="292" y="249" className="fill-zinc-900 font-display text-[13px] font-bold dark:fill-slate-100">
                Beta · Scout Peer
              </text>
              <text x="276" y="269" className="fill-zinc-500 font-mono text-[10.5px] dark:fill-slate-400">
                Points: {beta?.total_points ?? 0} · Cloud +{beta?.cloud_contributed ?? 0}
              </text>
              <text x="276" y="288" className="fill-teal-700 font-mono text-[9.5px] dark:fill-teal-400">
                {beta?.reachable !== false ? "FEDERATED PEER ONLINE" : "PEER STANDBY"}
              </text>
            </g>

            {/* NODE GAMMA (Partitioned Watchtower) */}
            <g
              onClick={() => setSelected("device-gamma")}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Inspect Gamma Watchtower Node"
            >
              <rect
                x="482"
                y="224"
                width="196"
                height="86"
                rx="10"
                className="fill-amber-50/50 dark:fill-amber-950/20"
                stroke={selected === "device-gamma" ? "#3B82F6" : "#D97706"}
                strokeWidth={selected === "device-gamma" ? 2.5 : 1.5}
                strokeDasharray={selected === "device-gamma" ? "0" : "4 3"}
              />
              <circle cx="500" cy="245" r="4" fill="#F59E0B" />
              <text x="512" y="249" className="fill-zinc-900 font-display text-[13px] font-bold dark:fill-slate-100">
                Gamma · Watchtower
              </text>
              <text x="496" y="269" className="fill-zinc-500 font-mono text-[10.5px] dark:fill-slate-400">
                Last seen: {formatRelative(gamma?.last_sync_at)}
              </text>
              <text x="496" y="288" className="fill-amber-700 font-mono text-[9.5px] dark:fill-amber-400">
                DEGRADED / AIR-GAPPED PEER
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Selected Node / Cloud Hub Side Inspector */}
      <div className="flex flex-col justify-between rounded-xl border border-stone-300/90 bg-white p-4 shadow-[0_1px_2px_rgba(17,19,24,0.04)] dark:border-slate-800 dark:bg-[#141a26] xl:col-span-4">
        {selected === "cloud" ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                  <Cloud className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-slate-100">
                    Cloud Qdrant Hub
                  </h3>
                  <p className="font-mono text-[11px] text-zinc-500 dark:text-slate-400">
                    Shared Mesh Vector Store
                  </p>
                </div>
              </div>
              <StatusBadge tone={cloudReachable ? "ok" : "crit"}>
                {cloudReachable ? "Reachable" : "Offline"}
              </StatusBadge>
            </div>

            <div className="space-y-2 border-t border-stone-200 pt-3 dark:border-slate-800">
              {Object.entries(ctrl.state?.cloud.shards ?? {}).map(([shardId, info]) => (
                <div
                  key={shardId}
                  className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div>
                    <div className="text-xs font-medium text-zinc-800 dark:text-slate-200">
                      {presentShard(shardId).label}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500 dark:text-slate-400">
                      edge-{shardId} · #{info.manifest_hash}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs font-semibold text-zinc-900 dark:text-slate-100">
                    {info.points} pts
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-stone-100 text-zinc-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {selected === "device-alpha" ? (
                    <Cpu className="h-4 w-4" />
                  ) : (
                    <Radio className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-slate-100">
                    {presentNodeName(selected, selectedDevice?.name)}
                  </h3>
                  <p className="font-mono text-[11px] text-zinc-500 dark:text-slate-400">
                    {selectedDevice?.location ?? "Edge Sector"}
                  </p>
                </div>
              </div>
              <StatusBadge
                tone={
                  selected === "device-gamma"
                    ? "warn"
                    : selected === "device-alpha" && !online
                      ? "warn"
                      : "ok"
                }
              >
                {selected === "device-alpha"
                  ? online
                    ? "Online"
                    : "Air-Gapped"
                  : selectedDevice?.reachable !== false
                    ? "Federated"
                    : "Down"}
              </StatusBadge>
            </div>

            <dl className="grid grid-cols-2 gap-2 border-t border-stone-200 pt-3 text-xs dark:border-slate-800">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                <dt className="font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">Local Points</dt>
                <dd className="mt-0.5 font-mono text-base font-semibold text-zinc-900 dark:text-slate-100">
                  {selectedDevice?.total_points ?? 0}
                </dd>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                <dt className="font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">Queue Depth</dt>
                <dd className="mt-0.5 font-mono text-base font-semibold text-zinc-900 dark:text-slate-100">
                  {selectedDevice?.queue_depth ?? 0}
                </dd>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                <dt className="font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">Bytes Pushed</dt>
                <dd className="mt-0.5 font-mono text-sm font-medium text-zinc-800 dark:text-slate-200">
                  {formatBytes(selectedDevice?.bytes_pushed ?? 0)}
                </dd>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                <dt className="font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">Last Sync</dt>
                <dd className="mt-0.5 font-mono text-sm font-medium text-zinc-800 dark:text-slate-200">
                  {formatRelative(selectedDevice?.last_sync_at)}
                </dd>
              </div>
            </dl>

            {selected === "device-alpha" && conflicts > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{conflicts} open conflict(s) require resolution.</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-200 pt-3 dark:border-slate-800">
          <PrimaryButton
            variant="outline"
            onClick={() => ctrl.setOnline(!online)}
            disabled={!!ctrl.busy}
          >
            {online ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
            {online ? "Cut Uplink" : "Restore Uplink"}
          </PrimaryButton>
          <PrimaryButton
            onClick={() => void ctrl.sync()}
            disabled={!!ctrl.busy || !online}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", ctrl.busy === "sync" && "animate-spin")} />
            Sync Now
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={() => onNavigate("rag")}>
            Open RAG Chat
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
