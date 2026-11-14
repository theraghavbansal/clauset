"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useProtocol } from "@/hooks/use-protocol";
import { useTheme } from "@/hooks/use-theme";
import ProtocolShell from "@/components/protocol/ProtocolShell";
import MeshOverview from "@/components/protocol/MeshOverview";
import AgentRagWorkbench from "@/components/protocol/AgentRagWorkbench";
import MemoryVault from "@/components/protocol/MemoryVault";
import SyncConflictsConsole from "@/components/protocol/SyncConflictsConsole";
import GovernanceSdkPanel from "@/components/protocol/GovernanceSdkPanel";
import PointInspectorDrawer from "@/components/protocol/PointInspectorDrawer";
import CommandPalette from "@/components/protocol/CommandPalette";
import WalkthroughDrawer from "@/components/protocol/WalkthroughDrawer";
import { cn, type WorkbenchView } from "@/components/protocol/WorkbenchUI";

export default function HomePage() {
  const ctrl = useProtocol();
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<WorkbenchView>("overview");
  const [ragSeed, setRagSeed] = useState<{ key: number; query: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <ProtocolShell
        ctrl={ctrl}
        view={view}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelectView={setView}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenGuide={() => setGuideOpen(true)}
      >
        {view === "overview" && (
          <MeshOverview
            ctrl={ctrl}
            onNavigate={setView}
            onLaunchRag={(query) => {
              setRagSeed((s) => ({ key: (s?.key ?? 0) + 1, query }));
              setView("rag");
            }}
          />
        )}
        {view === "rag" && (
          <AgentRagWorkbench key={ragSeed?.key ?? 0} ctrl={ctrl} initialQuery={ragSeed?.query} />
        )}
        {view === "vault" && <MemoryVault ctrl={ctrl} />}
        {view === "sync" && <SyncConflictsConsole ctrl={ctrl} />}
        {view === "governance" && <GovernanceSdkPanel ctrl={ctrl} />}
      </ProtocolShell>

      <PointInspectorDrawer ctrl={ctrl} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ctrl={ctrl}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelectView={setView}
        onOpenGuide={() => setGuideOpen(true)}
      />
      <WalkthroughDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        ctrl={ctrl}
        onSelectView={setView}
      />

      {/* Non-intrusive bottom-right notice stack */}
      {ctrl.notices.length > 0 && (
        <div className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {ctrl.notices.map((n) => (
            <div
              key={n.id}
              role="status"
              className={cn(
                "flex items-start justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-xs shadow-lg dark:bg-[#141a26]",
                n.tone === "ok"
                  ? "border-teal-300 dark:border-teal-700"
                  : n.tone === "warn"
                    ? "border-amber-300 dark:border-amber-700"
                    : n.tone === "error"
                      ? "border-rose-300 dark:border-rose-700"
                      : "border-stone-300 dark:border-slate-700",
              )}
            >
              <div className="min-w-0">
                <div className="font-display font-semibold text-zinc-900 dark:text-slate-100">{n.title}</div>
                {n.detail && <div className="mt-0.5 text-zinc-600 dark:text-slate-300">{n.detail}</div>}
              </div>
              <button
                type="button"
                onClick={() => ctrl.dismissNotice(n.id)}
                className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-slate-500 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
