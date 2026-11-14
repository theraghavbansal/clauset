#!/usr/bin/env node
/**
 * End-to-end verification suite for 13th Protocol Gateway, Residency Firewall,
 * Hybrid RRF Search, Grounded RAG Chat, Conflict Arbitration, Snapshot Handoff & CLI.
 */
import assert from "assert/strict";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, ".protocol-data");
const PORT = 3413;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/protocol/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? `${e.message} ${e.cause ? String(e.cause) : ""}` : String(e);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`Timed out waiting for 13th Protocol server (${lastErr})`);
}

async function req(method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
    body: method !== "GET" ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  // Start against clean isolated data state, then remove test state at the end
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, PROTOCOL_FORCE_EMBEDDED: "1" },
    stdio: "pipe",
  });

  let logs = "";
  server.stdout.on("data", (d) => (logs += d.toString()));
  server.stderr.on("data", (d) => (logs += d.toString()));

  try {
    await waitForServer();

    // 1. HTML Page + Health
    const htmlRes = await fetch(BASE);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("Clauset"), "Landing HTML should contain Clauset");

    const h = await req("GET", "/api/protocol/health");
    assert.equal(h.status, 200);
    assert.equal(h.json.ok, true);
    assert.equal(h.json.service, "clauset-gateway");
    assert.equal(h.json.protocol_version, "1.3.0");
    assert.equal(h.json.engine_mode, "embedded-ts-mesh");

    // 2. Cut link offline & verify search + RAG still run offline
    const off = await req("POST", "/api/protocol/connectivity", { device: "device-alpha", online: false });
    assert.equal(off.status, 200);
    assert.equal(off.json.online, false);

    const search = await req("POST", "/api/protocol/search", {
      shard: "manuals",
      query: "split brain partition recovery",
      mode: "hybrid",
      explain: true,
    });
    assert.equal(search.status, 200);
    assert.equal(search.json.offline, true);
    assert.ok(search.json.results.length > 0, "Offline hybrid search must return results");
    assert.ok(search.json.results[0].scores?.fused >= 0, "Explain scores should be present");

    const rag = await req("POST", "/api/protocol/chat", {
      query: "How do we handle restricted enclave secrets and split brain?",
      shard: "all",
    });
    assert.equal(rag.status, 200);
    assert.equal(rag.json.offline, true);
    assert.equal(rag.json.synthesis_mode, "local-extractive");
    assert.ok(rag.json.citations.length > 0, "RAG chat must include citations");

    // 3. Write restricted canary while offline -> must remain local_only
    const canaryText = "CANARY-SECRET-0xDEADBEEF must never leave alpha";
    const wRestr = await req("POST", "/api/protocol/write", {
      shard: "incidents",
      slug: "canary-restricted-test",
      sensitivity: "restricted",
      criticality: "critical",
      text: canaryText,
    });
    assert.equal(wRestr.status, 200);
    assert.equal(wRestr.json.sync_state, "local_only");

    // Write normal queued trace while offline -> queued
    const wQueued = await req("POST", "/api/protocol/write", {
      shard: "incidents",
      slug: "offline-trace-test",
      sensitivity: "internal",
      criticality: "high",
      text: "Recovered downstream RPC timeout while offline",
    });
    assert.equal(wQueued.status, 200);
    assert.equal(wQueued.json.sync_state, "queued");

    // 4. Restore link, sync, and verify restricted canary NEVER reached cloud
    await req("POST", "/api/protocol/connectivity", { device: "device-alpha", online: true });
    const syncRes = await req("POST", "/api/protocol/sync", { device: "device-alpha" });
    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.json.ok, true);
    assert.ok(syncRes.json.pushed >= 1);

    const cloudPts = await req("GET", "/api/protocol/cloud/points?collection=edge-incidents");
    assert.equal(cloudPts.status, 200);
    const leaked = (cloudPts.json.points || []).some((p) => String(p.text || "").includes("CANARY-SECRET-0xDEADBEEF"));
    assert.equal(leaked, false, "Restricted canary must NEVER reach Cloud Hub");

    // 5. Snapshot export must also exclude restricted points
    const snap = await req("POST", "/api/protocol/snapshot/export", { device: "device-alpha" });
    assert.equal(snap.status, 200);
    assert.ok(snap.json.excluded_local_only >= 1, "Snapshot export must exclude local_only points");

    // 6. Policy residency floor cannot be bypassed
    const badPolicy = await req("PUT", "/api/protocol/policy", {
      ttl_raw_sensor_seconds: 600,
      rules: [
        { id: "bad", field: "sensitivity", op: "eq", value: "restricted", action: "sync_now", reason: "bypass" },
      ],
    });
    assert.equal(badPolicy.status, 400);

    // 7. Stage & resolve conflict
    await req("POST", "/api/protocol/demo/conflict", { device: "device-alpha" });
    const syncConf = await req("POST", "/api/protocol/sync", { device: "device-alpha" });
    assert.ok(syncConf.json.new_conflicts >= 1, "Expected conflict on sync");
    const ss = await req("GET", "/api/protocol/sync-status?device=device-alpha");
    const cid = ss.json.open_conflicts[0].id;
    const resConf = await req("POST", "/api/protocol/conflict/resolve", {
      device: "device-alpha",
      conflict_id: cid,
      resolution: "merge",
      merged_text: "Merged protocol consensus verified.",
    });
    assert.equal(resConf.status, 200);
    assert.equal(resConf.json.ok, true);

    // 8. TTL Retention Sweep expires old seeded telemetry
    const ret = await req("POST", "/api/protocol/retention/run", { device: "device-alpha" });
    assert.equal(ret.status, 200);
    assert.ok(ret.json.expired >= 4, "Expected old telemetry points to expire");

    // 9. Intelligence route (auto_tag + distill_sop + restricted guard)
    const tagRes = await req("POST", "/api/protocol/intelligence", {
      action: "auto_tag",
      text: "Critical token leak detected on autonomous perimeter agent",
    });
    assert.equal(tagRes.status, 200);
    assert.equal(tagRes.json.ok, true);
    assert.equal(tagRes.json.sensitivity, "restricted");

    const blockedDistill = await req("POST", "/api/protocol/intelligence", {
      action: "distill_sop",
      text: "Private key material",
      sensitivity: "restricted",
    });
    assert.equal(blockedDistill.status, 403);

    // 10. SSE stream emits metrics event
    const sseCtrl = new AbortController();
    const sseRes = await fetch(`${BASE}/api/protocol/stream`, { signal: sseCtrl.signal });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const chunk = await reader.read();
    const sseText = new TextDecoder().decode(chunk.value || new Uint8Array());
    sseCtrl.abort();
    assert.ok(sseText.includes("event: metrics"), "SSE stream should emit metrics event");

    // 11. CLI wrapper smoke check
    const cli = spawnSync(process.execPath, [path.join(ROOT, "bin", "clauset-cli.mjs"), "status"], {
      env: { ...process.env, CLAUSET_URL: BASE },
      encoding: "utf-8",
    });
    assert.equal(cli.status, 0, `CLI exited with ${cli.status}: ${cli.stderr}`);
    const cliJson = JSON.parse(cli.stdout);
    assert.equal(cliJson.protocol_version, "1.3.0");

    console.log("ALL CLAUSET VERIFICATION CHECKS PASSED!");
  } catch (err) {
    console.error("Server logs:\n", logs);
    throw err;
  } finally {
    server.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
