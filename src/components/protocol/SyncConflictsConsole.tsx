"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  Download,
  DownloadCloud,
  GitMerge,
  RefreshCw,
  Upload,
} from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { clausetClient } from "@/sdk/client";
import type { ConflictRecord, SnapshotExport } from "@/lib/protocol-types";
import {
  KpiBlock,
  PrimaryButton,
  StatusBadge,
  WorkbenchCard,
  cn,
  formatBytes,
  formatRelative,
} from "./WorkbenchUI";

export default function SyncConflictsConsole({ ctrl }: { ctrl: ProtocolController }) {
  const ss = ctrl.syncStatus;
  const online = ss?.online ?? true;
  const queued = ss?.queue_depth ?? 0;
  const open = ss?.open_conflicts ?? [];
  const resolved = ss?.resolved_conflicts ?? [];
  const summary = ss?.last_sync_summary;

  const [autoSync, setAutoSync] = useState(false);
  const [intervalSec, setIntervalSec] = useState(30);
  const lastSyncRef = useRef(0);
  const ctrlRef = useRef(ctrl);
  useEffect(() => {
    ctrlRef.current = ctrl;
  }, [ctrl]);

  // Conflict merge drafts
  const [mergeDrafts, setMergeDrafts] = useState<Record<string, string>>({});

  // Snapshot handoff state
  const [exportedSnap, setExportedSnap] = useState<SnapshotExport | null>(null);
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!autoSync) return;
    const id = setInterval(async () => {
      const c = ctrlRef.current;
      const isOnline = c.syncStatus?.online ?? true;
      const qDepth = c.syncStatus?.queue_depth ?? 0;
      const now = Date.now();
      if (isOnline && !c.busy && (qDepth > 0 || now - lastSyncRef.current >= intervalSec * 1000)) {
        lastSyncRef.current = now;
        await c.sync();
      }
    }, 2500);
    return () => clearInterval(id);
  }, [autoSync, intervalSec]);

  async function handleExport() {
    const snap = await clausetClient.exportSnapshot(ctrl.state?.active_device);
    setExportedSnap(snap);
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clauset-${snap.device}.snapshot.json`;
    a.click();
    URL.revokeObjectURL(url);
    ctrl.pushNotice(
      "Snapshot exported",
      `${snap.point_count} points exported (${snap.excluded_local_only} restricted points excluded)`,
      "ok",
    );
  }

  async function handleImport() {
    if (!importJson.trim()) return;
    setImporting(true);
    try {
      const res = await clausetClient.importSnapshot({
        device: ctrl.state?.active_device,
        snapshot: importJson.trim(),
      });
      if (!res.ok) {
        ctrl.pushNotice("Snapshot import failed", res.reason ?? "Invalid format", "error");
        return;
      }
      ctrl.pushNotice(
        "Snapshot imported",
        `${res.imported ?? 0} imported, ${res.unchanged ?? 0} unchanged, ${res.conflicts ?? 0} conflicts`,
        res.conflicts ? "warn" : "ok",
      );
      setImportJson("");
      await ctrl.refresh();
    } catch (e) {
      ctrl.pushNotice("Snapshot import error", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setImporting(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImportJson(reader.result);
    };
    reader.readAsText(file);
  }

  function startMerge(c: ConflictRecord) {
    setMergeDrafts((prev) => ({
      ...prev,
      [c.id]: `${c.local.text}\n\n[Merged with ${c.remote.origin_device}]: ${c.remote.text}`,
    }));
  }

  return (
    <div className="space-y-5">
      {/* Action Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-300/90 bg-white p-4 shadow-[0_1px_2px_rgba(17,19,24,0.04)] dark:border-slate-800 dark:bg-[#141a26]">
        <div>
          <h2 className="font-display text-sm font-bold text-zinc-900 dark:text-slate-100">
            Replication, Divergence &amp; Air-Gapped Handoff
          </h2>
          <p className="text-xs text-zinc-500 dark:text-slate-400">
            Last sync {formatRelative(ss?.last_sync_at)} · Sync never silently overwrites divergent edits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-stone-300 bg-stone-50 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="accent-blue-700"
            />
            <span>Auto-sync</span>
            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              disabled={!autoSync}
              className="bg-transparent font-mono text-[11px] outline-none disabled:opacity-45"
            >
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </label>
          <PrimaryButton variant="outline" onClick={() => void ctrl.demoConflict()} disabled={!!ctrl.busy}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Stage Conflict
          </PrimaryButton>
          <PrimaryButton variant="outline" onClick={() => void ctrl.bootstrap()} disabled={!!ctrl.busy || !online}>
            <DownloadCloud className="h-3.5 w-3.5" /> Bootstrap
          </PrimaryButton>
          <PrimaryButton onClick={() => void ctrl.sync()} disabled={!!ctrl.busy || !online}>
            <RefreshCw className={cn("h-3.5 w-3.5", ctrl.busy === "sync" && "animate-spin")} /> Sync Now
          </PrimaryButton>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiBlock
          label="Queued Ops"
          value={queued}
          hint="waiting for uplink"
          icon={<Clock className="h-4 w-4" />}
          tone={queued > 0 ? "warn" : "neutral"}
        />
        <KpiBlock
          label="Open Conflicts"
          value={open.length}
          hint="awaiting decision"
          icon={<GitMerge className="h-4 w-4" />}
          tone={open.length > 0 ? "crit" : "ok"}
        />
        <KpiBlock
          label="Pushed (Last)"
          value={summary?.pushed ?? 0}
          hint={summary ? formatBytes(summary.bytes_pushed) : "no sync yet"}
          icon={<ArrowUp className="h-4 w-4" />}
          tone="signal"
        />
        <KpiBlock
          label="Pulled (Last)"
          value={summary?.pulled ?? 0}
          hint={summary ? formatBytes(summary.bytes_pulled) : "no sync yet"}
          icon={<ArrowDown className="h-4 w-4" />}
          tone="ok"
        />
      </div>

      {/* 3-Way Divergence Resolver */}
      <WorkbenchCard
        title="Divergence & Conflict Arbitration"
        subtitle="Compare local node vs remote peer edits side-by-side"
        actions={<StatusBadge tone={open.length > 0 ? "crit" : "ok"}>{open.length} open</StatusBadge>}
      >
        {open.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            No open conflicts. Click <strong>Stage Conflict</strong> then <strong>Sync Now</strong> to demonstrate 3-way conflict arbitration.
          </div>
        ) : (
          <div className="space-y-4">
            {open.map((c) => {
              const mergeText = mergeDrafts[c.id];
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-rose-300 bg-rose-50/40 p-4 dark:border-rose-800/70 dark:bg-rose-950/20"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GitMerge className="h-4 w-4 text-rose-700 dark:text-rose-400" />
                      <span className="font-display text-sm font-bold text-zinc-900 dark:text-slate-100">
                        {c.slug}
                      </span>
                      <StatusBadge tone="crit">{c.shard}</StatusBadge>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-slate-400">{c.id}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-stone-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase text-blue-700 dark:text-blue-400">
                        <span>Local ({c.local.origin_device})</span>
                        <span>{formatRelative(c.local.updated_at)}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-800 dark:text-slate-200">{c.local.text}</p>
                    </div>

                    <div className="rounded-lg border border-stone-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase text-teal-700 dark:text-teal-400">
                        <span>Remote ({c.remote.origin_device})</span>
                        <span>{formatRelative(c.remote.updated_at)}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-zinc-800 dark:text-slate-200">{c.remote.text}</p>
                    </div>
                  </div>

                  {mergeText !== undefined && (
                    <div className="mt-3 space-y-2 rounded-lg border border-stone-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <label className="block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                        Merged Resolution Text
                      </label>
                      <textarea
                        rows={3}
                        value={mergeText}
                        onChange={(e) => setMergeDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <div className="flex gap-2">
                        <PrimaryButton
                          disabled={!!ctrl.busy}
                          onClick={() => void ctrl.resolveConflict(c.id, "merge", mergeText)}
                        >
                          Commit Merged Text
                        </PrimaryButton>
                        <PrimaryButton
                          variant="ghost"
                          onClick={() =>
                            setMergeDrafts((p) => {
                              const copy = { ...p };
                              delete copy[c.id];
                              return copy;
                            })
                          }
                        >
                          Cancel
                        </PrimaryButton>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <PrimaryButton
                      variant="outline"
                      disabled={!!ctrl.busy}
                      onClick={() => void ctrl.resolveConflict(c.id, "local")}
                    >
                      Keep Local Version
                    </PrimaryButton>
                    <PrimaryButton
                      variant="outline"
                      disabled={!!ctrl.busy}
                      onClick={() => void ctrl.resolveConflict(c.id, "remote")}
                    >
                      Accept Remote Version
                    </PrimaryButton>
                    {mergeText === undefined && (
                      <PrimaryButton onClick={() => startMerge(c)}>3-Way Merge Editor</PrimaryButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="mt-4 border-t border-stone-200 pt-3 dark:border-slate-800">
            <div className="mb-2 font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
              Recent Resolved Conflicts ({resolved.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {resolved.slice(0, 6).map((r) => (
                <StatusBadge key={r.id} tone="ok">
                  {r.slug} · {r.resolution}
                </StatusBadge>
              ))}
            </div>
          </div>
        )}
      </WorkbenchCard>

      {/* Portable Snapshot Handoff + Manifest History */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <WorkbenchCard
          title="Air-Gapped Snapshot Handoff"
          subtitle="Portable v1 snapshot — automatically strips restricted / local-only records"
          className="lg:col-span-7"
          actions={
            <div className="flex items-center gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <Upload className="h-3.5 w-3.5" /> Load File
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
              <PrimaryButton variant="outline" onClick={() => void handleExport()}>
                <Download className="h-3.5 w-3.5" /> Export Snapshot
              </PrimaryButton>
            </div>
          }
        >
          <div className="space-y-3">
            {exportedSnap && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 font-mono text-[11px] text-teal-900 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                Exported {exportedSnap.point_count} points · {exportedSnap.excluded_local_only} restricted excluded ({exportedSnap.format})
              </div>
            )}
            <textarea
              rows={4}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='Paste or load a clauset-snapshot / edge-mem-snapshot JSON payload to import into this node...'
              className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 font-mono text-[11px] outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <PrimaryButton disabled={importing || !importJson.trim()} onClick={() => void handleImport()}>
              <Upload className="h-3.5 w-3.5" /> Import Snapshot Into Active Node
            </PrimaryButton>
          </div>
        </WorkbenchCard>

        <WorkbenchCard
          title="Shard Manifest Diffs"
          subtitle="Hashes compared on last sync pass"
          className="lg:col-span-5"
        >
          {!summary?.manifest_diffs ? (
            <p className="text-xs text-zinc-500 dark:text-slate-400">
              Run a sync pass to inspect per-shard manifest hash diffs.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(summary.manifest_diffs).map(([shard, info]) => (
                <div
                  key={shard}
                  className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div>
                    <div className="font-mono font-semibold text-zinc-800 dark:text-slate-200">{shard}</div>
                    <div className="font-mono text-[10px] text-zinc-500 dark:text-slate-400">
                      {info.last_hash || "init"} -&gt; {info.cloud_hash}
                    </div>
                  </div>
                  <StatusBadge tone={info.changed ? "signal" : "neutral"}>
                    {info.changed ? "updated" : "identical"}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </WorkbenchCard>
      </div>
    </div>
  );
}
