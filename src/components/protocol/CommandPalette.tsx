"use client";

import { useEffect, useMemo, useState } from "react";
import { Command, Search } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import type { ThemeMode } from "@/hooks/use-theme";
import type { WorkbenchView } from "./WorkbenchUI";

export default function CommandPalette({
  open,
  onClose,
  ctrl,
  theme,
  onToggleTheme,
  onSelectView,
  onOpenGuide,
}: {
  open: boolean;
  onClose: () => void;
  ctrl: ProtocolController;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSelectView: (v: WorkbenchView) => void;
  onOpenGuide: () => void;
}) {
  const [query, setQuery] = useState("");
  const online = ctrl.syncStatus?.online ?? true;

  const commands = useMemo(
    () => [
      { id: "v-overview", label: "Go to Mesh Overview", hint: "Topology & telemetry", run: () => onSelectView("overview") },
      { id: "v-rag", label: "Go to Agent RAG & Search", hint: "Grounded chat & RRF scores", run: () => onSelectView("rag") },
      { id: "v-vault", label: "Go to Memory Vault", hint: "Shards, notes & cloud catalog", run: () => onSelectView("vault") },
      { id: "v-sync", label: "Go to Sync & Conflicts", hint: "3-way diff & snapshots", run: () => onSelectView("sync") },
      { id: "v-gov", label: "Go to Governance & SDK", hint: "Policy simulator & CLI", run: () => onSelectView("governance") },
      { id: "a-theme", label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", hint: "Toggle workbench theme", run: () => onToggleTheme() },
      { id: "a-link", label: online ? "Cut Node Uplink (Air-Gap)" : "Restore Node Uplink", hint: "Toggle offline autonomy", run: () => void ctrl.setOnline(!online) },
      { id: "a-sync", label: "Sync Mesh Now", hint: "Push queue & diff manifests", run: () => void ctrl.sync() },
      { id: "a-boot", label: "Bootstrap Fleet Snapshot", hint: "Pull cloud shared memory", run: () => void ctrl.bootstrap() },
      { id: "a-conf", label: "Stage Split-Brain Conflict", hint: "Create divergent edit for demo", run: () => void ctrl.demoConflict() },
      { id: "a-guide", label: "Open Demo Walkthrough", hint: "5-step interactive guide", run: () => onOpenGuide() },
    ],
    [ctrl, online, theme, onToggleTheme, onSelectView, onOpenGuide],
  );

  const filtered = commands.filter((c) =>
    `${c.label} ${c.hint}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[16vh] backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-stone-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#141a26]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-200 px-3.5 py-2.5 dark:border-slate-800">
          <Search className="h-4 w-4 text-zinc-400 dark:text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to Clauset view or trigger command..."
            className="flex-1 bg-transparent text-xs text-zinc-900 outline-none dark:text-slate-100"
          />
          <kbd className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 divide-y divide-stone-100 overflow-y-auto dark:divide-slate-800/80">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => {
                cmd.run();
                onClose();
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs hover:bg-stone-50 dark:hover:bg-slate-800/70 cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium text-zinc-900 dark:text-slate-100">
                <Command className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                {cmd.label}
              </span>
              <span className="font-mono text-[10px] text-zinc-500 dark:text-slate-400">{cmd.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
