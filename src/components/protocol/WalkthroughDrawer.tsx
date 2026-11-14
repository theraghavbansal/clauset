"use client";

import { useState } from "react";
import { Check, Loader2, Play, X } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { cn, type WorkbenchView } from "./WorkbenchUI";

export default function WalkthroughDrawer({
  open,
  onClose,
  ctrl,
  onSelectView,
}: {
  open: boolean;
  onClose: () => void;
  ctrl: ProtocolController;
  onSelectView: (v: WorkbenchView) => void;
}) {
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());

  if (!open) return null;

  const steps = [
    {
      title: "1. Cut Node Uplink (Air-Gap)",
      desc: "Sever cloud connectivity. All local recall & policy writes continue working.",
      run: async () => {
        await ctrl.setOnline(false);
      },
    },
    {
      title: "2. Ask Grounded RAG Offline",
      desc: "Run hybrid RRF retrieval and extractive synthesis with zero internet.",
      run: async () => {
        onSelectView("rag");
      },
    },
    {
      title: "3. Log Critical & Restricted Memories",
      desc: "Critical trace queues for sync; restricted enclave key stays quarantined local_only.",
      run: async () => {
        await ctrl.write({
          shard: "incidents",
          title: "Air-Gapped Tool Recovery",
          asset_id: "AGENT-ALPHA",
          criticality: "critical",
          sensitivity: "internal",
          text: "Recovered failed downstream API call while air-gapped using cached local playbook.",
        });
        await ctrl.write({
          shard: "manuals",
          title: "Restricted Local Enclave Key",
          asset_id: "ENCLAVE-01",
          criticality: "high",
          sensitivity: "restricted",
          text: "RESTRICTED: Private signing token 0xAA41 must never leave Alpha.",
        });
      },
    },
    {
      title: "4. Reconnect & Synchronize Mesh",
      desc: "Restore link and sync. Critical trace uploads; restricted key never leaves Alpha.",
      run: async () => {
        await ctrl.setOnline(true);
        await ctrl.sync();
      },
    },
    {
      title: "5. Stage & Resolve Split-Brain Conflict",
      desc: "Simulate divergent peer edits and arbitrate with 3-way merge.",
      run: async () => {
        await ctrl.demoConflict();
        await ctrl.sync();
        onSelectView("sync");
        onClose();
      },
    },
  ];

  async function execute(idx: number) {
    setBusyIdx(idx);
    try {
      await steps[idx].run();
      setDone((prev) => new Set([...prev, idx]));
    } finally {
      setBusyIdx(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside
        aria-label="Clauset Demo Walkthrough"
        className="flex h-full w-full max-w-md flex-col border-l border-stone-300 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#141a26]"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="font-display text-base font-bold text-zinc-900 dark:text-slate-100">
              Clauset Demo Walkthrough
            </h3>
            <p className="text-xs text-zinc-500 dark:text-slate-400">
              Interactive 5-step proof of offline autonomy, residency firewall &amp; conflict sync.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="clauset-scroll flex-1 divide-y divide-stone-200 overflow-y-auto dark:divide-slate-800">
          {steps.map((s, idx) => {
            const isDone = done.has(idx);
            const running = busyIdx === idx;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  disabled={busyIdx !== null}
                  onClick={() => void execute(idx)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-stone-50 dark:hover:bg-slate-900/60 cursor-pointer disabled:opacity-50"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
                      isDone
                        ? "border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-300"
                        : "border-stone-300 bg-stone-50 text-zinc-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
                    )}
                  >
                    {running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isDone ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </span>
                  <span>
                    <span className="block font-display text-xs font-semibold text-zinc-900 dark:text-slate-100">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-600 dark:text-slate-400">
                      {s.desc}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
