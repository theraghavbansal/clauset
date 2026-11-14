"use client";

import { useState } from "react";
import { Lock, Sparkles, Trash2, X } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { clausetClient } from "@/sdk/client";
import {
  CriticalityTag,
  PrimaryButton,
  SensitivityTag,
  SyncStateTag,
  formatTime,
} from "./WorkbenchUI";

export default function PointInspectorDrawer({ ctrl }: { ctrl: ProtocolController }) {
  const p = ctrl.activePoint;
  const [sopEntry, setSopEntry] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!p) return null;

  const sop = sopEntry?.id === p.id ? sopEntry.text : null;
  const restricted = String(p.sensitivity ?? "").toLowerCase() === "restricted";

  async function distill() {
    if (!p || restricted) return;
    setBusy(true);
    try {
      const r = await clausetClient.intelligence({
        action: "distill_sop",
        text: p.text,
        asset_id: p.asset_id,
        sensitivity: p.sensitivity,
      });
      if (r.sop) setSopEntry({ id: p.id, text: r.sop });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!p) return;
    setBusy(true);
    try {
      await clausetClient.deletePoint(p.shard, p.id, ctrl.state?.active_device);
      ctrl.pushNotice("Point deleted", `${p.slug || p.id.slice(0, 8)} removed from ${p.shard}`, "info");
      ctrl.closePoint();
      await ctrl.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="flex-1 bg-black/40 backdrop-blur-[1px]"
        onClick={() => {
          setSopEntry(null);
          ctrl.closePoint();
        }}
      />
      <aside
        aria-label="Memory Record Inspector"
        className="flex h-full w-full max-w-md flex-col border-l border-stone-300 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#141a26]"
      >
        <div className="flex items-start justify-between gap-2 border-b border-stone-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-slate-400">
              {p.shard} · {p.origin_device ?? "local"}
            </div>
            <h3 className="mt-0.5 truncate font-display text-base font-bold text-zinc-900 dark:text-slate-100">
              {p.title || p.slug || p.id}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setSopEntry(null);
              ctrl.closePoint();
            }}
            className="rounded p-1 text-zinc-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="clauset-scroll flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <CriticalityTag value={p.criticality} />
            <SensitivityTag value={p.sensitivity} />
            <SyncStateTag value={p.sync_state} />
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 leading-relaxed text-zinc-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
            {p.text}
          </div>

          <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded-lg border border-stone-200 p-2 dark:border-slate-800">
              <dt className="text-zinc-400 dark:text-slate-500">ID</dt>
              <dd className="mt-0.5 truncate text-zinc-800 dark:text-slate-200">{p.id}</dd>
            </div>
            <div className="rounded-lg border border-stone-200 p-2 dark:border-slate-800">
              <dt className="text-zinc-400 dark:text-slate-500">Updated</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-slate-200">{formatTime(p.updated_at)}</dd>
            </div>
            <div className="rounded-lg border border-stone-200 p-2 dark:border-slate-800">
              <dt className="text-zinc-400 dark:text-slate-500">Asset / Agent</dt>
              <dd className="mt-0.5 text-zinc-800 dark:text-slate-200">{p.asset_id || "—"}</dd>
            </div>
            <div className="rounded-lg border border-stone-200 p-2 dark:border-slate-800">
              <dt className="text-zinc-400 dark:text-slate-500">Slug</dt>
              <dd className="mt-0.5 truncate text-zinc-800 dark:text-slate-200">{p.slug || "—"}</dd>
            </div>
          </dl>

          {sop && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/40">
              <div className="mb-1 font-mono text-[10px] font-semibold uppercase text-blue-800 dark:text-blue-300">
                Distilled Playbook
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-slate-200">
                {sop}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <PrimaryButton variant="danger" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Local
          </PrimaryButton>
          <PrimaryButton variant="outline" disabled={busy || restricted} onClick={() => void distill()}>
            {restricted ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {restricted ? "Restricted Guard" : "Distill Playbook"}
          </PrimaryButton>
        </div>
      </aside>
    </div>
  );
}
