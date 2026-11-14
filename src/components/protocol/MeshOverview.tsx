"use client";

import { useState } from "react";
import { Activity, ArrowRight, Cloud, Cpu, Download, GitMerge, Layers, Search, Sparkles } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { SHARD_IDS, presentShard } from "@/lib/protocol-types";
import TopologyCanvas from "./TopologyCanvas";
import {
  KpiBlock,
  PrimaryButton,
  StatusBadge,
  WorkbenchCard,
  type WorkbenchView,
  formatBytes,
  formatTime,
} from "./WorkbenchUI";

export default function MeshOverview({
  ctrl,
  onNavigate,
  onLaunchRag,
}: {
  ctrl: ProtocolController;
  onNavigate: (view: WorkbenchView) => void;
  onLaunchRag: (query: string) => void;
}) {
  const [quickQuery, setQuickQuery] = useState("");
  const ss = ctrl.syncStatus;
  const queued = ss?.queue_depth ?? 0;
  const conflicts = ss?.open_conflicts.length ?? 0;
  const online = ss?.online ?? true;
  const localPoints = ctrl.memory?.total_points ?? 0;
  const cloudPoints = ctrl.state?.cloud.total_points ?? 0;

  function exportEvents() {
    const blob = new Blob([JSON.stringify(ctrl.activity, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clauset-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Quick Recall Strip */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (quickQuery.trim()) onLaunchRag(quickQuery.trim());
        }}
        className="flex flex-col gap-2 rounded-xl border border-stone-300/90 bg-white p-3 shadow-[0_1px_2px_rgba(17,19,24,0.04)] dark:border-slate-800 dark:bg-[#141a26] sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-slate-500" />
          <input
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder="Ask Clauset or query local node memory (e.g. 'split brain partition recovery' or 'timeout circuit breaker')..."
            className="h-9 w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton type="submit" disabled={!quickQuery.trim()}>
            <Sparkles className="h-3.5 w-3.5" /> Ask Clauset RAG
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            onClick={() => onLaunchRag("Zero-Trust Prompt Injection Containment")}
          >
            Sample Query <ArrowRight className="h-3.5 w-3.5" />
          </PrimaryButton>
        </div>
      </form>

      {/* Top KPI Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBlock
          label="Active Node Recall"
          value={localPoints}
          hint="points indexed on device-alpha"
          icon={<Cpu className="h-4 w-4" />}
          tone="ok"
        />
        <KpiBlock
          label="Cloud Hub Knowledge"
          value={cloudPoints}
          hint="shared across federated peers"
          icon={<Cloud className="h-4 w-4" />}
          tone="signal"
        />
        <KpiBlock
          label="Replication Queue"
          value={queued}
          hint={online ? "ready to sync" : "held locally while air-gapped"}
          icon={<Layers className="h-4 w-4" />}
          tone={queued > 0 ? "warn" : "neutral"}
        />
        <KpiBlock
          label="Open Conflicts"
          value={conflicts}
          hint={conflicts > 0 ? "requires human/agent arbitration" : "consensus clean"}
          icon={<GitMerge className="h-4 w-4" />}
          tone={conflicts > 0 ? "crit" : "ok"}
        />
      </div>

      {/* Live Interactive Topology Map */}
      <TopologyCanvas ctrl={ctrl} onNavigate={onNavigate} />

      {/* Bottom Split: Local Shard Breakdown + Live Mesh Telemetry & Event Log */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <WorkbenchCard
          title="Local Shard Matrix"
          subtitle="Independent vector & BM25 indexes per memory domain"
          className="lg:col-span-5"
          actions={
            <PrimaryButton variant="ghost" onClick={() => onNavigate("vault")}>
              Browse Vault <ArrowRight className="h-3.5 w-3.5" />
            </PrimaryButton>
          }
        >
          <div className="space-y-3">
            {SHARD_IDS.map((sid) => {
              const shard = ctrl.memory?.shards[sid];
              const pres = presentShard(sid);
              const pct = localPoints > 0 ? Math.round(((shard?.points ?? 0) / localPoints) * 100) : 0;
              return (
                <div
                  key={sid}
                  className="rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-zinc-900 dark:text-slate-100">
                          {pres.label}
                        </span>
                        <StatusBadge tone={pres.defaultSync === "local_only" ? "neutral" : "ok"}>
                          {pres.defaultSync.replace("_", " ")}
                        </StatusBadge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-slate-400">{pres.desc}</p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-400 dark:text-slate-500">
                        hash #{shard?.manifest_hash ?? "—"} · {formatBytes(shard?.disk_bytes ?? 0)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display text-xl font-bold tabular-nums text-zinc-900 dark:text-slate-100">
                        {shard?.points ?? 0}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500 dark:text-slate-400">{pct}% share</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                    <div
                      className={
                        sid === "manuals"
                          ? "h-full bg-blue-600 dark:bg-blue-500"
                          : sid === "incidents"
                            ? "h-full bg-teal-600 dark:bg-teal-400"
                            : "h-full bg-amber-500 dark:bg-amber-400"
                      }
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </WorkbenchCard>

        <WorkbenchCard
          title="Live Mesh Audit Stream"
          subtitle={`SSE stream active (${ctrl.telemetry.length} samples) · append-only protocol log`}
          className="lg:col-span-7"
          noPadding
          actions={
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1 font-mono text-[10px] text-teal-700 dark:text-teal-400 sm:inline-flex">
                <Activity className="h-3 w-3" /> LIVE
              </span>
              <PrimaryButton variant="outline" onClick={exportEvents}>
                <Download className="h-3.5 w-3.5" /> Export JSON
              </PrimaryButton>
            </div>
          }
        >
          <div className="clauset-scroll max-h-80 divide-y divide-stone-200 overflow-y-auto dark:divide-slate-800">
            {ctrl.activity.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-500 dark:text-slate-400">
                Waiting for mesh telemetry...
              </p>
            ) : (
              ctrl.activity.slice(0, 20).map((entry, idx) => (
                <div
                  key={`${entry.ts}-${idx}`}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        tone={
                          entry.kind === "conflict"
                            ? "crit"
                            : entry.kind === "sync" || entry.kind === "bootstrap"
                              ? "ok"
                              : entry.kind === "connectivity"
                                ? "warn"
                                : "neutral"
                        }
                      >
                        {entry.kind}
                      </StatusBadge>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-slate-400">
                        {entry.device}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-800 dark:text-slate-200">{entry.message}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400 dark:text-slate-500">
                    {formatTime(entry.ts)}
                  </span>
                </div>
              ))
            )}
          </div>
        </WorkbenchCard>
      </div>
    </div>
  );
}
