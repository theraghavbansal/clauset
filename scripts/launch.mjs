#!/usr/bin/env node
/**
 * Cross-platform Windows-friendly launcher for 13th Protocol.
 * Starts the optional Python Qdrant Edge engine (when installed) + the Next.js workbench,
 * with zero dependency on bash or bun.
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENGINE_DIR = path.join(ROOT, "edge-mem-main", "mini-services", "edge-engine");
const ENGINE_SRC = path.join(ENGINE_DIR, "src");
const VENV_PY = process.platform === "win32"
  ? path.join(ROOT, ".venv", "Scripts", "python.exe")
  : path.join(ROOT, ".venv", "bin", "python3");

const args = new Set(process.argv.slice(2));
const isProd = args.has("--prod");
const wantBootstrap = args.has("--bootstrap-python");
const forceEmbedded = args.has("--embedded");

const children = [];

function detectPython() {
  if (fs.existsSync(VENV_PY)) return { cmd: VENV_PY, baseArgs: [] };
  const candidates = process.platform === "win32"
    ? [
        { cmd: "py", baseArgs: ["-3.13"] },
        { cmd: "python", baseArgs: [] },
        { cmd: "python3", baseArgs: [] },
      ]
    : [
        { cmd: "python3.13", baseArgs: [] },
        { cmd: "python3", baseArgs: [] },
      ];
  for (const c of candidates) {
    const r = spawnSync(c.cmd, [...c.baseArgs, "--version"], { stdio: "ignore" });
    if (r.status === 0) return c;
  }
  return null;
}

function hasEngineDeps(py) {
  if (!py) return false;
  const r = spawnSync(py.cmd, [...py.baseArgs, "-c", "import fastembed, qdrant_edge, qdrant_client"], {
    stdio: "ignore",
  });
  return r.status === 0;
}

function bootstrapPython(py) {
  console.log("[clauset] Bootstrapping Python virtual environment for edge-engine...");
  const venvDir = path.join(ROOT, ".venv");
  let res = spawnSync(py.cmd, [...py.baseArgs, "-m", "venv", venvDir], { stdio: "inherit" });
  if (res.status !== 0) return null;
  const pip = process.platform === "win32"
    ? path.join(venvDir, "Scripts", "pip.exe")
    : path.join(venvDir, "bin", "pip");
  const req = path.join(ENGINE_DIR, "requirements.txt");
  res = spawnSync(pip, ["install", "-r", req], { stdio: "inherit" });
  if (res.status !== 0) return null;
  return { cmd: VENV_PY, baseArgs: [] };
}

function startPythonEngine(py) {
  console.log("[clauset] Starting Python Qdrant Edge engine on :3030 (and peer beta on :3031)...");
  const peerData = path.join(ENGINE_DIR, "data-beta");
  fs.mkdirSync(peerData, { recursive: true });

  const peer = spawn(py.cmd, [...py.baseArgs, path.join(ENGINE_SRC, "main.py")], {
    cwd: ENGINE_SRC,
    env: {
      ...process.env,
      EDGE_PORT: "3031",
      EDGE_DEVICE: "device-beta",
      EDGE_DATA_DIR: peerData,
      EDGE_RETENTION_INTERVAL: "0",
      PYTHONUNBUFFERED: "1",
    },
    stdio: "inherit",
  });
  children.push(peer);

  const primary = spawn(py.cmd, [...py.baseArgs, path.join(ENGINE_SRC, "main.py")], {
    cwd: ENGINE_SRC,
    env: {
      ...process.env,
      EDGE_PORT: "3030",
      EDGE_DEVICE: "device-alpha",
      FEDERATED_PEERS: "device-beta=http://127.0.0.1:3031",
      PYTHONUNBUFFERED: "1",
    },
    stdio: "inherit",
  });
  children.push(primary);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(port);
  });
}

async function pickPort(preferred) {
  let port = Number(preferred) || 3000;
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(port)) return String(port);
    if (i === 0) {
      console.log(`[clauset] Port ${port} is already in use; selecting next available port...`);
    }
    port++;
  }
  return String(preferred || 3000);
}

async function startNextServer() {
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    console.error("[clauset] Dependencies missing. Run: npm.cmd install");
    process.exit(1);
  }
  const preferred = process.env.PORT || "3000";
  const port = await pickPort(preferred);
  const sub = isProd ? "start" : "dev";
  const nextArgs = isProd ? [nextBin, sub, "-p", port] : [nextBin, sub, "--webpack", "-p", port];
  console.log(`[clauset] Launching workbench (${sub}) on http://localhost:${port} ...`);
  const nextProc = spawn(process.execPath, nextArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: port,
      ...(forceEmbedded ? { PROTOCOL_FORCE_EMBEDDED: "1" } : {}),
    },
    stdio: "inherit",
  });
  children.push(nextProc);
  nextProc.on("exit", (code) => {
    shutdown(code ?? 0);
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

let py = detectPython();
if (wantBootstrap && py && !hasEngineDeps(py)) {
  const created = bootstrapPython(py);
  if (created) py = created;
}

if (!forceEmbedded && py && hasEngineDeps(py)) {
  startPythonEngine(py);
} else if (!forceEmbedded) {
  console.log("[clauset] Python edge-engine deps not detected; starting with Embedded TypeScript Mesh Runtime.");
  console.log("[clauset] (Optional) Run `node scripts/launch.mjs --bootstrap-python` to enable Qdrant Edge Python mode.");
}

void startNextServer();
