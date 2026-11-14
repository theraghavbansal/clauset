"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Columns3,
  Copy,
  Loader2,
  Lock,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Timer,
} from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { clausetClient } from "@/sdk/client";
import {
  SHARD_IDS,
  presentShard,
  type ChatCitation,
  type HybridSearchResponse,
  type ProtocolChatResponse,
  type SearchFilters,
  type SearchHit,
  type SearchMode,
  type ShardId,
} from "@/lib/protocol-types";
import {
  CriticalityTag,
  PrimaryButton,
  SensitivityTag,
  StatusBadge,
  WorkbenchCard,
  cn,
} from "./WorkbenchUI";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: ProtocolChatResponse;
}

const STARTER_PROMPTS = [
  "How do we recover from a split-brain partition?",
  "What happened when an agent hit RPC tool timeouts?",
  "Which memories are quarantined as restricted?",
  "How should hybrid RRF handle exact error codes?",
];

export default function AgentRagWorkbench({
  ctrl,
  initialQuery,
}: {
  ctrl: ProtocolController;
  initialQuery?: string;
}) {
  // Left pane: Grounded RAG Chat
  const [chatInput, setChatInput] = useState("");
  const [chatShard, setChatShard] = useState<ShardId | "all">("all");
  const [chatBusy, setChatBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Clauset RAG synthesizer ready. Ask any question — recall runs on-device first, and restricted memories never leave this node.",
    },
  ]);

  // Right pane: Hybrid Recall Debugger
  const [searchQuery, setSearchQuery] = useState(initialQuery ?? "");
  const [shard, setShard] = useState<ShardId>("incidents");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [searching, setSearching] = useState(false);
  const [searchRes, setSearchRes] = useState<HybridSearchResponse | null>(null);
  const [compareMap, setCompareMap] = useState<Record<string, HybridSearchResponse> | null>(null);
  const [distilled, setDistilled] = useState<Record<string, { sop: string; saving: boolean }>>({});

  async function submitChat(promptText?: string) {
    const q = (promptText ?? chatInput).trim();
    if (!q || chatBusy) return;
    if (!promptText) setChatInput("");

    const userTurn: ChatTurn = { id: `u-${Date.now()}`, role: "user", content: q };
    setTurns((prev) => [...prev, userTurn]);
    setChatBusy(true);
    try {
      const res = await clausetClient.ask({
        query: q,
        shard: chatShard,
        mode: "hybrid",
        device: ctrl.state?.active_device,
      });
      setTurns((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: res.answer, meta: res },
      ]);
      setSearchQuery(q);
      const dbg = await ctrl.search(q, chatShard === "all" ? "incidents" : chatShard, "hybrid", 5, {
        explain: true,
      });
      setSearchRes(dbg);
    } catch (e) {
      ctrl.pushNotice("RAG synthesis error", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setChatBusy(false);
    }
  }

  async function runSearch(overrideQuery?: string) {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q || searching) return;
    setSearching(true);
    setCompareMap(null);
    try {
      const cleanFilters: SearchFilters = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v) cleanFilters[k as keyof SearchFilters] = v;
      }
      const res = await ctrl.search(q, shard, mode, 5, { filters: cleanFilters, explain: true });
      setSearchRes(res);
    } catch (e) {
      ctrl.pushNotice("Recall query failed", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q) return;
    const t = setTimeout(() => {
      void submitChat(q);
    }, 0);
    return () => clearTimeout(t);
    // run once if navigated from Overview quick search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function compareAllModes() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const [h, d, s] = await Promise.all([
        ctrl.search(q, shard, "hybrid", 3, { filters, explain: false }),
        ctrl.search(q, shard, "dense", 3, { filters, explain: false }),
        ctrl.search(q, shard, "sparse", 3, { filters, explain: false }),
      ]);
      setCompareMap({ hybrid: h, dense: d, sparse: s });
    } finally {
      setSearching(false);
    }
  }

  async function distillHit(hit: SearchHit) {
    if (String(hit.sensitivity).toLowerCase() === "restricted") {
      ctrl.pushNotice("Blocked by Residency Guard", "Restricted points never leave this node.", "warn");
      return;
    }
    try {
      const r = await clausetClient.intelligence({
        action: "distill_sop",
        text: hit.text,
        asset_id: hit.asset_id,
        sensitivity: hit.sensitivity,
      });
      if (r.sop) {
        setDistilled((prev) => ({ ...prev, [hit.id]: { sop: r.sop!, saving: false } }));
      }
    } catch (e) {
      ctrl.pushNotice("Distillation failed", e instanceof Error ? e.message : String(e), "error");
    }
  }

  async function savePlaybook(hit: SearchHit, sop: string) {
    setDistilled((prev) => ({ ...prev, [hit.id]: { ...prev[hit.id], saving: true } }));
    try {
      await ctrl.write({
        shard: "manuals",
        domain: "manual",
        title: `Playbook · ${hit.asset_id || hit.slug || "Agent"}`,
        slug: `playbook-${(hit.slug || hit.id.slice(0, 8)).replace(/[^a-z0-9-]/gi, "-")}`,
        text: sop,
        criticality: hit.criticality || "high",
        sensitivity: "internal",
        asset_id: hit.asset_id,
      });
    } finally {
      setDistilled((prev) => ({ ...prev, [hit.id]: { ...prev[hit.id], saving: false } }));
    }
  }

  function inspectCitation(c: ChatCitation) {
    ctrl.openPoint({
      id: c.id,
      shard: c.shard,
      slug: c.slug,
      title: c.title,
      text: c.excerpt,
      sensitivity: c.sensitivity,
      origin_device: c.origin_device,
    });
  }

  function copyTurn(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const origins = Array.from(new Set((ctrl.fleet?.devices ?? []).map((d) => d.id)));
  const maxBm25 = Math.max(
    1,
    ...(searchRes?.results ?? []).map((r) => r.scores?.sparse ?? 0),
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* LEFT PANE: Grounded Agent RAG Assistant */}
      <WorkbenchCard
        title="Clauset RAG Assistant"
        subtitle="On-device grounded synthesis · restricted points quarantined locally"
        className="flex flex-col xl:col-span-6"
        noPadding
        actions={
          <select
            value={chatShard}
            onChange={(e) => setChatShard(e.target.value as ShardId | "all")}
            aria-label="RAG scope"
            className="h-7 rounded-md border border-stone-300 bg-stone-50 px-2 font-mono text-[11px] text-zinc-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">Playbooks + Traces</option>
            {SHARD_IDS.map((s) => (
              <option key={s} value={s}>
                {presentShard(s).label}
              </option>
            ))}
          </select>
        }
      >
        <div className="flex flex-wrap gap-1.5 border-b border-stone-200 bg-stone-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void submitChat(p)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:border-blue-500 hover:text-blue-800 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:text-blue-300"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="clauset-scroll flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "480px", minHeight: "340px" }}>
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={cn(
                "rounded-xl border p-3.5 text-xs leading-relaxed",
                turn.role === "user"
                  ? "ml-8 border-blue-200 bg-blue-50/75 text-zinc-900 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-slate-100"
                  : "mr-3 border-stone-200 bg-stone-50/85 text-zinc-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200",
              )}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-slate-400">
                  {turn.role === "user" ? (
                    "Operator / Agent Query"
                  ) : (
                    <>
                      <Bot className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" /> Clauset Synthesizer
                    </>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  {turn.meta && (
                    <>
                      <StatusBadge tone={turn.meta.synthesis_mode === "cloud-llm" ? "signal" : "ok"}>
                        {turn.meta.synthesis_mode}
                      </StatusBadge>
                      <span className="font-mono text-[10px] text-zinc-500 dark:text-slate-400">
                        {turn.meta.latency_ms}ms
                      </span>
                    </>
                  )}
                  {turn.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => copyTurn(turn.id, turn.content)}
                      className="rounded p-1 text-zinc-400 hover:bg-stone-200 hover:text-zinc-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      aria-label="Copy response"
                    >
                      {copiedId === turn.id ? <Check className="h-3 w-3 text-teal-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="whitespace-pre-wrap">{turn.content}</div>

              {turn.meta && turn.meta.quarantined_count > 0 && (
                <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Residency Guard: {turn.meta.quarantined_count} restricted record(s) stayed strictly on-device.
                  </span>
                </div>
              )}

              {turn.meta && turn.meta.citations.length > 0 && (
                <div className="mt-3 border-t border-stone-200 pt-2 dark:border-slate-800">
                  <div className="mb-1.5 font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                    Grounded Citations ({turn.meta.citations.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {turn.meta.citations.map((c) => (
                      <button
                        key={`${turn.id}-${c.id}`}
                        type="button"
                        onClick={() => inspectCitation(c)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer",
                          c.quarantined
                            ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                            : "border-stone-300 bg-white text-zinc-700 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-400",
                        )}
                      >
                        {c.quarantined && <Lock className="h-2.5 w-2.5" />}
                        [{c.index}] {c.title} · {c.score}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitChat();
          }}
          className="flex items-center gap-2 border-t border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-[#141a26]"
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask across local playbooks & episodic traces..."
            className="h-9 flex-1 rounded-lg border border-stone-300 bg-stone-50 px-3 text-xs text-zinc-900 outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
          <PrimaryButton type="submit" disabled={chatBusy || !chatInput.trim()}>
            {chatBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Ask
          </PrimaryButton>
        </form>
      </WorkbenchCard>

      {/* RIGHT PANE: Hybrid Recall & RRF Score Inspector */}
      <WorkbenchCard
        title="Hybrid Recall & RRF Debugger"
        subtitle="Inspect Dense cosine vs BM25 sparse vs Reciprocal Rank Fusion scores"
        className="xl:col-span-6"
        actions={
          <PrimaryButton
            variant="outline"
            onClick={() => void compareAllModes()}
            disabled={!searchQuery.trim() || searching}
          >
            <Columns3 className="h-3.5 w-3.5" /> Compare Modes
          </PrimaryButton>
        }
      >
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Query shard memory (e.g. 'tool timeout circuit breaker')..."
                className="h-8 w-full rounded-lg border border-stone-300 bg-stone-50 pl-8 pr-2 text-xs text-zinc-900 outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <PrimaryButton type="submit" disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Recall
            </PrimaryButton>
          </form>

          {/* Shard + Mode + Filter Controls */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select
              value={shard}
              onChange={(e) => setShard(e.target.value as ShardId)}
              aria-label="Target shard"
              className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {SHARD_IDS.map((s) => (
                <option key={s} value={s}>
                  {presentShard(s).shortLabel}
                </option>
              ))}
            </select>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as SearchMode)}
              aria-label="Search mode"
              className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="hybrid">Hybrid (RRF)</option>
              <option value="dense">Dense Vector</option>
              <option value="sparse">BM25 Sparse</option>
            </select>
            <select
              value={filters.sensitivity ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, sensitivity: e.target.value }))}
              aria-label="Sensitivity filter"
              className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Any sensitivity</option>
              <option value="public">public</option>
              <option value="internal">internal</option>
              <option value="restricted">restricted</option>
            </select>
            <select
              value={filters.origin_device ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, origin_device: e.target.value }))}
              aria-label="Origin filter"
              className="h-8 rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Any origin</option>
              {origins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {searchRes && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-[11px] text-zinc-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                {searchRes.latency_ms}ms · {searchRes.results.length} hits · {searchRes.mode}
              </span>
              <StatusBadge tone={searchRes.offline ? "warn" : "ok"}>
                {searchRes.offline ? "Offline Local" : "Online Local"}
              </StatusBadge>
            </div>
          )}

          {compareMap && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["hybrid", "dense", "sparse"] as const).map((m) => (
                <div
                  key={m}
                  className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-[11px] dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="mb-1.5 flex items-center justify-between font-mono font-semibold uppercase text-zinc-700 dark:text-slate-200">
                    <span>{m}</span>
                    <span className="text-zinc-500 dark:text-slate-400">{compareMap[m].latency_ms}ms</span>
                  </div>
                  <div className="space-y-1.5">
                    {compareMap[m].results.map((r, i) => (
                      <div
                        key={r.id}
                        className="rounded border border-stone-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div className="flex justify-between font-mono text-[10px]">
                          <span>#{i + 1}</span>
                          <span>{r.score}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-zinc-700 dark:text-slate-300">
                          {r.title || r.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="clauset-scroll max-h-[360px] space-y-2.5 overflow-y-auto pr-0.5">
            {!searchRes ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                Run a query or click a RAG starter prompt to inspect RRF dense/sparse channel decomposition.
              </div>
            ) : searchRes.results.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                No matches found with current filters.
              </div>
            ) : (
              searchRes.results.map((hit, idx) => {
                const restricted = String(hit.sensitivity).toLowerCase() === "restricted";
                const dist = distilled[hit.id];
                const dPct = Math.min(100, Math.round((hit.scores?.dense ?? 0) * 100));
                const sPct = Math.min(100, Math.round(((hit.scores?.sparse ?? 0) / maxBm25) * 100));
                const fPct = Math.min(100, Math.round((hit.scores?.fused ?? 0) * 100));

                return (
                  <div
                    key={hit.id}
                    className="rounded-lg border border-stone-300 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => ctrl.openPoint({ ...hit, shard })}
                        className="text-left font-display text-xs font-semibold text-zinc-900 hover:text-blue-700 cursor-pointer dark:text-slate-100 dark:hover:text-blue-400"
                      >
                        #{idx + 1} · {hit.title || hit.slug || hit.id.slice(0, 8)}
                      </button>
                      <div className="flex flex-wrap items-center gap-1">
                        <CriticalityTag value={hit.criticality} />
                        <SensitivityTag value={hit.sensitivity} />
                        <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                          {hit.score}
                        </span>
                      </div>
                    </div>

                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-700 dark:text-slate-300">
                      {hit.text}
                    </p>

                    {hit.scores && (
                      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-[10px] text-zinc-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                        <div>
                          <div className="flex justify-between">
                            <span>dense</span>
                            <span>{hit.scores.dense ?? "—"}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                            <div className="h-full bg-blue-600" style={{ width: `${dPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between">
                            <span>bm25</span>
                            <span>{hit.scores.sparse ?? "—"}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                            <div className="h-full bg-amber-500" style={{ width: `${sPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between font-semibold text-zinc-900 dark:text-white">
                            <span>rrf</span>
                            <span>{hit.scores.fused}</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                            <div className="h-full bg-teal-500" style={{ width: `${fPct}%` }} />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-zinc-400 dark:text-slate-500">
                        {hit.origin_device ?? "local"} · {hit.asset_id ?? shard}
                      </span>
                      <PrimaryButton
                        variant="outline"
                        disabled={restricted}
                        title={restricted ? "Restricted memories never leave this device" : "Distill into reusable Playbook"}
                        onClick={() => void distillHit(hit)}
                      >
                        {restricted ? <Lock className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                        {restricted ? "Quarantined" : "Distill Playbook"}
                      </PrimaryButton>
                    </div>

                    {dist && (
                      <div className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-xs dark:border-blue-800 dark:bg-blue-950/40">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-semibold uppercase text-blue-800 dark:text-blue-300">
                            Synthesized Playbook Draft
                          </span>
                          <PrimaryButton
                            disabled={dist.saving}
                            onClick={() => void savePlaybook(hit, dist.sop)}
                          >
                            Save to Playbooks
                          </PrimaryButton>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-800 dark:text-slate-200">
                          {dist.sop}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </WorkbenchCard>
    </div>
  );
}
