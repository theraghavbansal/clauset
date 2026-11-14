"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Lock, Play, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import type { ProtocolController } from "@/hooks/use-protocol";
import { clausetClient } from "@/sdk/client";
import type { PolicyConfig, PolicySimResponse, RetentionStatus } from "@/lib/protocol-types";
import { PrimaryButton, StatusBadge, SyncStateTag, WorkbenchCard, cn } from "./WorkbenchUI";

export default function GovernanceSdkPanel({ ctrl }: { ctrl: ProtocolController }) {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [retention, setRetention] = useState<RetentionStatus | null>(null);

  // Simulator inputs
  const [simCrit, setSimCrit] = useState("critical");
  const [simSens, setSimSens] = useState("restricted");
  const [simDomain, setSimDomain] = useState("incident");
  const [simRes, setSimRes] = useState<PolicySimResponse | null>(null);

  // SDK / CLI tab
  const [codeTab, setCodeTab] = useState<"sdk" | "cli" | "http">("sdk");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    clausetClient.getPolicy().then(setPolicy).catch(() => null);
    clausetClient.retentionStatus().then(setRetention).catch(() => null);
  }, [ctrl.state]);

  async function runSim() {
    const res = await clausetClient.simulatePolicy({
      text: "Policy dry run test",
      criticality: simCrit,
      sensitivity: simSens,
      domain: simDomain,
    });
    setSimRes(res);
  }

  useEffect(() => {
    let cancel = false;
    clausetClient
      .simulatePolicy({
        text: "Policy dry run test",
        criticality: simCrit,
        sensitivity: simSens,
        domain: simDomain,
      })
      .then((res) => {
        if (!cancel) setSimRes(res);
      })
      .catch(() => null);
    return () => {
      cancel = true;
    };
  }, [simCrit, simSens, simDomain]);

  async function runSweep() {
    const res = await clausetClient.runRetention(ctrl.state?.active_device);
    setRetention(res);
    await ctrl.refresh();
    ctrl.pushNotice(
      "TTL retention sweep finished",
      `Expired ${res.expired ?? 0} of ${res.checked ?? 0} telemetry records (> ${res.ttl_seconds}s)`,
      res.expired ? "ok" : "info",
    );
  }

  const snippets: Record<"sdk" | "cli" | "http", string> = {
    sdk: `import { ClausetClient } from "@/sdk/client";

const mesh = new ClausetClient({ baseUrl: "http://localhost:3000" });

// 1. Offline hybrid recall + grounded RAG synthesis
const reply = await mesh.ask({
  query: "How do we recover from a split-brain partition?",
  shard: "all",
  mode: "hybrid",
});

// 2. Policy-enforced local memory write
const saved = await mesh.remember({
  shard: "incidents",
  title: "Agent-Alpha Checkpoint",
  criticality: "${simCrit}",
  sensitivity: "${simSens}",
  text: "Recovered quorum without losing offline WAL queue.",
});`,
    cli: `# Query node status & active engine mode
node bin/clauset-cli.mjs status

# Ask the grounded on-device RAG assistant
node bin/clauset-cli.mjs ask "How do we recover from split-brain?"

# Write a memory subject to residency policy
node bin/clauset-cli.mjs remember --shard incidents --criticality ${simCrit} --sensitivity ${simSens} --text "Checkpoint saved offline"

# Toggle air-gap mode and synchronize
node bin/clauset-cli.mjs offline
node bin/clauset-cli.mjs online && node bin/clauset-cli.mjs sync`,
    http: `# Hybrid Search (Clauset Gateway -> Python EdgeShard or Embedded TS Mesh)
curl -X POST http://localhost:3000/api/protocol/search \\
  -H "Content-Type: application/json" \\
  -d '{"shard":"manuals","query":"tool timeout circuit breaker","mode":"hybrid","explain":true}'

# Grounded Agent RAG Chat (with Restricted Residency Guard)
curl -X POST http://localhost:3000/api/protocol/chat \\
  -H "Content-Type: application/json" \\
  -d '{"query":"Which records stay quarantined locally?","shard":"all"}'`,
  };

  function copySnippet() {
    void navigator.clipboard.writeText(snippets[codeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Residency Firewall Rules */}
        <WorkbenchCard
          title="Residency Firewall & Routing Rules"
          subtitle="First matching rule sets sync_state; restricted floor is immutable"
          className="xl:col-span-7"
          actions={
            <StatusBadge tone="crit">
              <Lock className="h-3 w-3" /> Residency Floor Locked
            </StatusBadge>
          }
        >
          <div className="space-y-2">
            {(policy?.rules ?? ctrl.state?.policy.rules ?? []).map((r, i) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-zinc-500 dark:text-slate-400">
                      #{i + 1} {r.id}
                    </span>
                    <code className="rounded border border-stone-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-zinc-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      {r.field} {r.op} {r.op === "eq" ? r.value : `[${(r.values ?? []).join(", ")}]`}
                    </code>
                  </div>
                  <p className="mt-1 text-zinc-600 dark:text-slate-300">{r.reason}</p>
                </div>
                <SyncStateTag value={r.action} />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-300 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs">
              <div className="font-display font-semibold text-zinc-900 dark:text-slate-100">
                Telemetry TTL Eviction Sweep
              </div>
              <div className="font-mono text-[11px] text-zinc-500 dark:text-slate-400">
                TTL: {retention?.ttl_seconds ?? policy?.ttl_raw_sensor_seconds ?? 600}s · Total expired:{" "}
                {retention?.expired_total ?? 0}
              </div>
            </div>
            <PrimaryButton variant="outline" onClick={() => void runSweep()}>
              <Trash2 className="h-3.5 w-3.5" /> Run Retention Sweep
            </PrimaryButton>
          </div>
        </WorkbenchCard>

        {/* Interactive Policy Dry-Run Simulator */}
        <WorkbenchCard
          title="Policy Rule Simulator"
          subtitle="Test how tags route before committing a write"
          className="xl:col-span-5"
          actions={
            <PrimaryButton variant="outline" onClick={() => void runSim()}>
              <Play className="h-3 w-3" /> Trace
            </PrimaryButton>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Sensitivity
                </label>
                <select
                  value={simSens}
                  onChange={(e) => setSimSens(e.target.value)}
                  className="h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="restricted">restricted</option>
                  <option value="internal">internal</option>
                  <option value="public">public</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Criticality
                </label>
                <select
                  value={simCrit}
                  onChange={(e) => setSimCrit(e.target.value)}
                  className="h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-500 dark:text-slate-400">
                  Domain
                </label>
                <select
                  value={simDomain}
                  onChange={(e) => setSimDomain(e.target.value)}
                  className="h-8 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="incident">incident</option>
                  <option value="manual">manual</option>
                  <option value="sensor">sensor</option>
                </select>
              </div>
            </div>

            {simRes && (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-display text-xs font-semibold text-zinc-900 dark:text-slate-100">
                    <ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    Resulting Action
                  </span>
                  <SyncStateTag value={simRes.decision.sync_state} />
                </div>
                <p className="text-xs text-zinc-600 dark:text-slate-300">{simRes.decision.reason}</p>

                <div className="space-y-1 border-t border-stone-200 pt-2 dark:border-slate-800">
                  {simRes.trace.map((step) => (
                    <div
                      key={step.id}
                      className={cn(
                        "flex items-center justify-between rounded px-2 py-1 font-mono text-[10px]",
                        step.is_match
                          ? "border border-blue-200 bg-blue-50 font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                          : "text-zinc-500 dark:text-slate-400",
                      )}
                    >
                      <span>
                        {step.id}: {step.field}={step.point_value}
                      </span>
                      <span>
                        {step.is_match ? `MATCH -> ${step.action}` : step.matched ? "skipped" : "no match"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </WorkbenchCard>
      </div>

      {/* SDK / CLI / Gateway Wrapper Workbench */}
      <WorkbenchCard
        title="Clauset SDK & CLI Wrapper"
        subtitle="Drop-in programmatic wrapper around the local Python EdgeShard or Embedded TS Mesh"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-stone-300 bg-stone-100 p-0.5 dark:border-slate-700 dark:bg-slate-900">
              {(["sdk", "cli", "http"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCodeTab(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-mono text-[11px] uppercase cursor-pointer",
                    codeTab === t
                      ? "bg-white font-semibold text-zinc-950 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-zinc-600 dark:text-slate-400",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <PrimaryButton variant="outline" onClick={copySnippet}>
              {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </PrimaryButton>
          </div>
        }
      >
        <div className="rounded-xl border border-zinc-800 bg-[#0d1117] p-4 text-zinc-100">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            <Terminal className="h-3.5 w-3.5 text-teal-400" />
            {codeTab === "sdk"
              ? "src/sdk/client.ts"
              : codeTab === "cli"
                ? "bin/clauset-cli.mjs"
                : "/api/protocol/*"}
          </div>
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-zinc-200">
            <code>{snippets[codeTab]}</code>
          </pre>
        </div>
      </WorkbenchCard>
    </div>
  );
}
