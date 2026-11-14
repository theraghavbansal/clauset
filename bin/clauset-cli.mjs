#!/usr/bin/env node
/**
 * Clauset CLI Wrapper
 * Usage:
 *   node bin/clauset-cli.mjs status
 *   node bin/clauset-cli.mjs search "split brain partition" --shard manuals --mode hybrid
 *   node bin/clauset-cli.mjs ask "How do we recover from a tool timeout?"
 *   node bin/clauset-cli.mjs remember --shard incidents --title "Relay stall" --text "..." --criticality high
 *   node bin/clauset-cli.mjs offline | online | sync | bootstrap | retention | snapshot | conflict
 */

const args = process.argv.slice(2);
const baseUrl = (process.env.CLAUSET_URL || process.env.PROTOCOL_URL || getFlag("--url") || "http://localhost:3000").replace(/\/+$/, "");

function getFlag(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

function positionalArgs() {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
    body: method !== "GET" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    console.error(`[clauset] HTTP ${res.status}:`, JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

async function main() {
  const pos = positionalArgs();
  const cmd = pos[0] || "help";
  const device = getFlag("--device", "device-alpha");

  switch (cmd) {
    case "status": {
      const [health, state, sync] = await Promise.all([
        call("GET", "/api/protocol/health"),
        call("GET", "/api/protocol/state"),
        call("GET", `/api/protocol/sync-status?device=${encodeURIComponent(device)}`),
      ]);
      console.log(JSON.stringify({
        service: health.service,
        protocol_version: health.protocol_version,
        engine_mode: health.engine_mode,
        engine_label: health.engine_label,
        active_node: state.active_device,
        online: sync.online,
        queue_depth: sync.queue_depth,
        open_conflicts: sync.open_conflicts?.length ?? 0,
        cloud_points: state.cloud?.total_points ?? 0,
      }, null, 2));
      break;
    }
    case "search": {
      const query = pos.slice(1).join(" ") || getFlag("--query", "");
      if (!query) {
        console.error("Usage: clauset-cli search <query> [--shard incidents|manuals|sensors] [--mode hybrid|dense|sparse]");
        process.exit(1);
      }
      const res = await call("POST", "/api/protocol/search", {
        device,
        shard: getFlag("--shard", "incidents"),
        query,
        mode: getFlag("--mode", "hybrid"),
        limit: Number(getFlag("--limit", "5")),
        explain: true,
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case "ask": {
      const query = pos.slice(1).join(" ") || getFlag("--query", "");
      if (!query) {
        console.error("Usage: clauset-cli ask <question> [--shard all|manuals|incidents]");
        process.exit(1);
      }
      const res = await call("POST", "/api/protocol/chat", {
        device,
        shard: getFlag("--shard", "all"),
        mode: getFlag("--mode", "hybrid"),
        query,
      });
      console.log(`\n[Clauset Synthesis: ${res.synthesis_mode} | ${res.latency_ms}ms | Quarantined: ${res.quarantined_count}]\n`);
      console.log(res.answer);
      console.log("\nCitations:", res.citations.map((c) => `[${c.index}] ${c.title} (${c.shard}, score=${c.score})`).join(" | "));
      break;
    }
    case "remember": {
      const text = getFlag("--text") || pos.slice(1).join(" ");
      if (!text) {
        console.error("Usage: clauset-cli remember --text \"...\" [--shard incidents] [--criticality high] [--sensitivity internal]");
        process.exit(1);
      }
      const res = await call("POST", "/api/protocol/write", {
        device,
        shard: getFlag("--shard", "incidents"),
        title: getFlag("--title"),
        text,
        criticality: getFlag("--criticality", "medium"),
        sensitivity: getFlag("--sensitivity", "internal"),
        asset_id: getFlag("--asset"),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case "offline":
      console.log(JSON.stringify(await call("POST", "/api/protocol/connectivity", { device, online: false }), null, 2));
      break;
    case "online":
      console.log(JSON.stringify(await call("POST", "/api/protocol/connectivity", { device, online: true }), null, 2));
      break;
    case "sync":
      console.log(JSON.stringify(await call("POST", "/api/protocol/sync", { device }), null, 2));
      break;
    case "bootstrap":
      console.log(JSON.stringify(await call("POST", "/api/protocol/bootstrap", { device }), null, 2));
      break;
    case "retention":
      console.log(JSON.stringify(await call("POST", "/api/protocol/retention/run", { device }), null, 2));
      break;
    case "snapshot":
      console.log(JSON.stringify(await call("POST", "/api/protocol/snapshot/export", { device }), null, 2));
      break;
    case "conflict":
      console.log(JSON.stringify(await call("POST", "/api/protocol/demo/conflict", { device }), null, 2));
      break;
    default:
      console.log(`Clauset CLI (target: ${baseUrl})
Commands:
  status                    Show engine mode, node link, queue & cloud stats
  search <query>            Hybrid/dense/sparse search (--shard, --mode, --limit)
  ask <question>            Grounded RAG synthesis with residency protection
  remember --text "..."     Write a memory record subject to residency policy
  offline / online          Toggle active node link state
  sync / bootstrap          Run edge <-> cloud sync or full snapshot bootstrap
  retention                 Run raw telemetry TTL pruning sweep
  snapshot                  Export portable snapshot JSON
  conflict                  Stage a demo divergence conflict`);
  }
}

main().catch((err) => {
  console.error("[clauset] Error:", err.message);
  process.exit(1);
});
