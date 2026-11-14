import { dispatchProtocol } from "./protocol-gateway";
import type {
  ChatCitation,
  HybridSearchResponse,
  ProtocolChatResponse,
  SearchHit,
  SearchMode,
  ShardId,
  SyncStatus,
} from "./protocol-types";

const BASE_URL = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";

async function callCloudLlm(messages: Array<{ role: "system" | "user"; content: string }>): Promise<string | null> {
  const key = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages, stream: false }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function isRestrictedHit(hit: SearchHit): boolean {
  return (
    String(hit.sensitivity ?? "").toLowerCase() === "restricted" ||
    String(hit.sync_state ?? "").toLowerCase() === "local_only"
  );
}

function buildLocalExtractiveAnswer(query: string, citations: ChatCitation[], offline: boolean): string {
  if (!citations.length) {
    return `No matching memories were found on this node for "${query}". Try indexing a new episodic trace or switching search mode to Hybrid RRF.`;
  }
  const top = citations[0];
  const lines = [
    `Grounded local recall across ${citations.length} memory record${citations.length === 1 ? "" : "s"}${offline ? " (100% air-gapped on-device)" : ""}:`,
    "",
    `Primary match [${top.index}] (${top.title}): ${top.excerpt}`,
  ];
  if (citations.length > 1) {
    lines.push("");
    lines.push("Supporting mesh evidence:");
    for (const c of citations.slice(1, 4)) {
      const origin = c.origin_device ? ` · ${c.origin_device}` : "";
      const tag = c.quarantined ? " [LOCAL QUARANTINE]" : "";
      lines.push(`• [${c.index}] ${c.title}${origin}${tag}: ${c.excerpt}`);
    }
  }
  const qCount = citations.filter((c) => c.quarantined).length;
  if (qCount > 0) {
    lines.push("");
    lines.push(
      `Residency Shield: ${qCount} restricted record${qCount === 1 ? "" : "s"} stayed strictly on-device and ${qCount === 1 ? "was" : "were"} excluded from external LLM prompts.`,
    );
  }
  return lines.join("\n");
}

export async function runProtocolRagChat(params: {
  query: string;
  shard?: ShardId | "all";
  mode?: SearchMode;
  device?: string;
}): Promise<ProtocolChatResponse> {
  const t0 = performance.now();
  const targetShards: ShardId[] =
    params.shard && params.shard !== "all" ? [params.shard] : ["incidents", "manuals"];

  const [syncRes, ...searchResults] = await Promise.all([
    dispatchProtocol("GET", "sync-status"),
    ...targetShards.map((shard) =>
      dispatchProtocol("POST", "search", {
        body: {
          device: params.device,
          shard,
          query: params.query,
          mode: params.mode ?? "hybrid",
          limit: 4,
          explain: true,
        },
      }),
    ),
  ]);

  const syncStatus = syncRes.data as SyncStatus | undefined;
  const offline = syncStatus ? !syncStatus.online : false;

  const mergedHits: Array<SearchHit & { _shard: ShardId }> = [];
  searchResults.forEach((r, idx) => {
    const resp = r.data as HybridSearchResponse | undefined;
    const shard = targetShards[idx];
    for (const hit of resp?.results ?? []) {
      mergedHits.push({ ...hit, _shard: shard });
    }
  });
  mergedHits.sort((a, b) => b.score - a.score);
  const topHits = mergedHits.slice(0, 5);

  const citations: ChatCitation[] = topHits.map((h, i) => ({
    index: i + 1,
    id: h.id,
    shard: h._shard,
    title: h.title || h.slug || h.id.slice(0, 8),
    slug: h.slug,
    score: h.score,
    sensitivity: h.sensitivity || "internal",
    origin_device: h.origin_device,
    quarantined: isRestrictedHit(h),
    excerpt: h.text,
  }));

  const safeCitations = citations.filter((c) => !c.quarantined);
  const quarantinedCount = citations.length - safeCitations.length;

  let answer: string | null = null;
  let synthesisMode: "cloud-llm" | "local-extractive" = "local-extractive";

  if (!offline && safeCitations.length > 0) {
    const contextBlock = safeCitations
      .map((c) => `[${c.index}] (${c.shard} | ${c.title} | origin=${c.origin_device ?? "local"}): ${c.excerpt}`)
      .join("\n\n");
    answer = await callCloudLlm([
      {
        role: "system",
        content:
          "You are the Clauset Mesh Intelligence synthesizer. Answer concisely using ONLY the provided memory citations [1], [2], etc. Cite sources inline. Keep answers actionable and under 140 words.",
      },
      {
        role: "user",
        content: `Question: ${params.query}\n\nRetrieved Mesh Memories:\n${contextBlock}`,
      },
    ]);
    if (answer) {
      synthesisMode = "cloud-llm";
      if (quarantinedCount > 0) {
        answer += `\n\n[Residency Guard: ${quarantinedCount} restricted local memory hit(s) were withheld from the cloud LLM.]`;
      }
    }
  }

  if (!answer) {
    answer = buildLocalExtractiveAnswer(params.query, citations, offline);
  }

  return {
    ok: true,
    answer,
    synthesis_mode: synthesisMode,
    offline,
    latency_ms: Number((performance.now() - t0).toFixed(1)),
    quarantined_count: quarantinedCount,
    citations,
    model: synthesisMode === "cloud-llm" ? MODEL : "local-extractive-rrf",
  };
}

export async function runProtocolIntelligence(body: {
  action: "distill_sop" | "auto_tag";
  text: string;
  asset_id?: string;
  sensitivity?: string;
}) {
  const restricted = String(body.sensitivity ?? "").toLowerCase() === "restricted";
  const text = body.text.trim();
  if (!text) return { status: 400, data: { error: "text required" } };

  if (body.action === "distill_sop") {
    if (restricted) {
      return {
        status: 403,
        data: { error: "Residency Floor: restricted memories cannot be sent to external cloud LLMs" },
      };
    }
    const llmSop = await callCloudLlm([
      {
        role: "system",
        content:
          "Distill this field/agent incident into a crisp reusable Standard Operating Playbook under 100 words: 1 title line, numbered steps, and a Verification line.",
      },
      { role: "user", content: `Asset ${body.asset_id || "MESH-NODE"}:\n${text}` },
    ]);
    if (llmSop) {
      return { status: 200, data: { ok: true, action: "distill_sop", sop: llmSop, mode: "cloud-llm" } };
    }
    const cleanSentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const localSop = [
      `PLAYBOOK UPDATE (${body.asset_id || "EDGE-NODE"})`,
      ...cleanSentences.slice(0, 4).map((s, idx) => `${idx + 1}. ${s}`),
      "Verification: Confirm local hybrid recall score and healthy sync queue depth = 0.",
    ].join("\n");
    return { status: 200, data: { ok: true, action: "distill_sop", sop: localSop, mode: "local-extractive" } };
  }

  if (!restricted) {
    const llmTag = await callCloudLlm([
      {
        role: "system",
        content:
          'Classify this note as JSON ONLY: {"criticality":"low|medium|high|critical","sensitivity":"internal|restricted|public","reason":"<=10 words"}.',
      },
      { role: "user", content: text },
    ]);
    if (llmTag) {
      const m = llmTag.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]) as { criticality?: string; sensitivity?: string; reason?: string };
          return {
            status: 200,
            data: {
              ok: true,
              action: "auto_tag",
              criticality: ["low", "medium", "high", "critical"].includes(parsed.criticality ?? "")
                ? parsed.criticality
                : "medium",
              sensitivity: ["internal", "restricted", "public"].includes(parsed.sensitivity ?? "")
                ? parsed.sensitivity
                : "internal",
              reason: parsed.reason || "Cloud LLM classification",
              mode: "cloud-llm",
            },
          };
        } catch {
          /* fall back to local classifier */
        }
      }
    }
  }

  const lower = text.toLowerCase();
  const sensitivity = /\b(secret|token|password|key|pii|private|restricted|credential|ssn)\b/.test(lower)
    ? "restricted"
    : /\b(public|open|broadcast)\b/.test(lower)
      ? "public"
      : "internal";
  const criticality = /\b(critical|breach|shutdown|injection|panic|unacceptable|fatal|emergency)\b/.test(lower)
    ? "critical"
    : /\b(high|timeout|spike|failover|overheat|corrupt|leak|defect)\b/.test(lower)
      ? "high"
      : /\b(warning|retry|drift|elevated)\b/.test(lower)
        ? "medium"
        : "low";

  return {
    status: 200,
    data: {
      ok: true,
      action: "auto_tag",
      criticality,
      sensitivity,
      reason:
        sensitivity === "restricted"
          ? "Local classifier detected sensitive credential/PII markers"
          : `Local classifier matched ${criticality} operational urgency`,
      mode: "local-heuristic",
    },
  };
}
