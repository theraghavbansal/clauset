"use client";

import { useState } from "react";
import {
  BookOpen,
  Command,
  Database,
  GitMerge,
  Menu,
  Moon,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import type { ThemeMode } from "@/hooks/use-theme";
import { cn, StatusBadge, type WorkbenchView } from "./WorkbenchUI";

const NAV_ITEMS: Array<{ id: WorkbenchView; label: string; hint: string; icon: typeof Network }> = [
  { id: "overview", label: "Mesh Overview", hint: "Topology & telemetry", icon: Network },
  { id: "rag", label: "Agent RAG & Search", hint: "Hybrid recall + chat", icon: Sparkles },
  { id: "vault", label: "Memory Vault", hint: "Shards, notes & cloud", icon: Database },
  { id: "sync", label: "Sync & Conflicts", hint: "Queue, diff & snapshot", icon: GitMerge },
  { id: "governance", label: "Governance & SDK", hint: "Policy firewall & CLI", icon: ShieldCheck },
];

export default function ProtocolShell({
  ctrl,
  view,
  theme,
  onToggleTheme,
  onSelectView,
  onOpenPalette,
  onOpenGuide,
  children,
}: {
  ctrl: ProtocolController;
  view: WorkbenchView;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSelectView: (v: WorkbenchView) => void;
  onOpenPalette: () => void;
  onOpenGuide: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const online = ctrl.syncStatus?.online ?? true;
  const queued = ctrl.syncStatus?.queue_depth ?? 0;
  const conflicts = ctrl.syncStatus?.open_conflicts.length ?? 0;
  const activeNav = NAV_ITEMS.find((n) => n.id === view) ?? NAV_ITEMS[0];

  const railContent = (
    <div className="flex h-full flex-col justify-between bg-[#EAEAE3] text-zinc-900 transition-colors dark:bg-[#101520] dark:text-slate-100">
      <div className="space-y-5 p-4">
        {/* Brand Block */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <img src="/clauset-mark.svg" alt="" width={34} height={34} className="h-8.5 w-8.5 shrink-0 rounded-lg" />
            <div>
              <div className="font-display text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                Clauset
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-slate-400">
                EDGE MEMORY MESH · v1.3
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded p-1 text-zinc-600 hover:bg-stone-300/60 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Node Status & Air-Gap Control Box */}
        <div className="rounded-xl border border-stone-300 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#141a26]">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-slate-400">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  online ? "bg-teal-500 animate-pulse" : "bg-amber-500",
                )}
              />
              Active Node
            </span>
            <StatusBadge tone={online ? "ok" : "warn"}>
              {online ? "Online" : "Air-Gapped"}
            </StatusBadge>
          </div>
          <div className="mt-1.5 font-display text-sm font-semibold text-zinc-900 dark:text-slate-100">
            Alpha · Field Agent 01
          </div>
          <div className="font-mono text-[11px] text-zinc-500 dark:text-slate-400">
            {ctrl.state?.active_device ?? "device-alpha"}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!!ctrl.busy}
              onClick={() => void ctrl.setOnline(!online)}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer disabled:opacity-50",
                online
                  ? "border-stone-300 bg-stone-50 text-zinc-700 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600/40 dark:bg-amber-950/50 dark:text-amber-200",
              )}
            >
              {online ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              {online ? "Cut Link" : "Reconnect"}
            </button>
            <button
              type="button"
              disabled={!!ctrl.busy || !online}
              onClick={() => void ctrl.sync()}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-blue-800 bg-blue-700 text-xs font-medium text-white transition-colors hover:bg-blue-800 cursor-pointer disabled:opacity-45 dark:border-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", ctrl.busy === "sync" && "animate-spin")} />
              Sync {queued > 0 ? `(${queued})` : ""}
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Workbench Views" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  setMobileOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border-l-[3px] px-3 py-2 text-left transition-all cursor-pointer",
                  active
                    ? "border-l-blue-700 bg-white text-zinc-950 shadow-sm dark:border-l-blue-400 dark:bg-[#161e2e] dark:text-white"
                    : "border-l-transparent text-zinc-600 hover:bg-stone-300/45 hover:text-zinc-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-blue-700 dark:text-blue-400" : "text-zinc-500 dark:text-slate-500",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{item.label}</span>
                    <span className="block truncate text-[10px] text-zinc-500 dark:text-slate-400">
                      {item.hint}
                    </span>
                  </span>
                </span>
                {item.id === "sync" && (conflicts > 0 || queued > 0) && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      conflicts > 0
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                    )}
                  >
                    {conflicts > 0 ? `${conflicts}!` : queued}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Engine & Walkthrough Footer */}
      <div className="space-y-2 border-t border-stone-300/90 p-4 dark:border-slate-800">
        <div className="rounded-lg border border-stone-300 bg-white/90 px-2.5 py-2 dark:border-slate-800 dark:bg-[#141a26]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-slate-400">
            Engine Backend
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] font-medium text-zinc-800 dark:text-slate-200">
              {ctrl.health?.engine_mode === "python-edge-shard" ? "Python EdgeShard" : "Embedded TS Mesh"}
            </span>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                ctrl.health?.ok ? "bg-teal-500" : "bg-amber-500",
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenPalette}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white text-xs font-medium text-zinc-700 hover:bg-stone-50 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Command className="h-3.5 w-3.5" /> ⌘K
          </button>
          <button
            type="button"
            onClick={onOpenGuide}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white text-xs font-medium text-zinc-700 hover:bg-stone-50 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <BookOpen className="h-3.5 w-3.5" /> Demo
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop Fixed Rail */}
      <aside className="hidden w-64 shrink-0 border-r border-stone-300 dark:border-slate-800 lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{railContent}</div>
      </aside>

      {/* Mobile Slide-Over Rail */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-72 border-r border-stone-300 shadow-xl dark:border-slate-800">{railContent}</div>
          <div className="flex-1 bg-black/40 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-stone-300 bg-[#F4F4F0]/90 px-4 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-[#0B0E14]/90 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-stone-300 bg-white p-1.5 text-zinc-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="hidden font-mono text-zinc-500 dark:text-slate-400 sm:inline">CLAUSET /</span>
              <h1 className="truncate font-display text-sm font-bold text-zinc-900 dark:text-slate-100">
                {activeNav.label}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-[11px] text-zinc-500 dark:text-slate-400 md:inline">
              {ctrl.memory?.total_points ?? 0} local · {ctrl.state?.cloud.total_points ?? 0} cloud
            </span>
            <StatusBadge tone={online ? "ok" : "warn"}>
              {online ? "Mesh Online" : "Offline Autonomy"}
            </StatusBadge>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-stone-100 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-blue-700" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {ctrl.error && (
            <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              <strong>Gateway connectivity warning:</strong> {ctrl.error}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
