# Clauset — Local-First Agent Memory & Policy Mesh

<div align="center">

```
  ██████╗██╗      █████╗ ██╗   ██╗███████╗███████╗████████╗
 ██╔════╝██║     ██╔══██╗██║   ██║██╔════╝██╔════╝╚══██╔══╝
 ██║     ██║     ███████║██║   ██║███████╗█████╗     ██║   
 ██║     ██║     ██╔══██║██║   ██║╚════██║██╔══╝     ██║   
 ╚██████╗███████╗██║  ██║╚██████╔╝███████║███████╗   ██║   
  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝   ╚═╝   
```

**The Local-First Memory Mesh, Data Residency Firewall, and Grounded RAG Workbench for Autonomous AI Edge Agents.**

[![Live Demo](https://img.shields.io/badge/live_demo-clauset--workbench.onrender.com-success?style=for-the-badge&logo=render)](https://clauset-workbench.onrender.com/)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/theraghavbansal/clauset)
[![Verification](https://img.shields.io/badge/test_suite-11%2F11_verified-success.svg)](scripts/verify.mjs)
[![Runtime](https://img.shields.io/badge/engine-Dual--Engine_(Qdrant_Edge_%2B_Embedded_TS)-blue.svg)](#dual-engine-architecture)
[![Residency Shield](https://img.shields.io/badge/security-Zero--Exfiltration_Residency_Shield-red.svg)](#data-residency-firewall)
[![UI Theme](https://img.shields.io/badge/ui-Light_%26_Dark_Mode_Workbench-orange.svg)](#workbench-ui-tour)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

**[🌐 Open Live Deployed Workbench](https://clauset-workbench.onrender.com/)**

[Live App](https://clauset-workbench.onrender.com/) • [Quickstart](#quickstart-5-minute-setup) • [Architecture](#system-architecture) • [Key Capabilities](#core-capabilities--invariants) • [Workbench Tour](#workbench-ui-tour) • [TypeScript SDK](#programmatic-typescript-sdk) • [CLI Reference](#cli-wrapper-reference) • [REST API](#rest-api-reference) • [Hackathon Dossier](#hackathon-submission-dossier)

</div>

> 🚀 **Live Production Deployment**: Experience Clauset live in your browser at **[https://clauset-workbench.onrender.com/](https://clauset-workbench.onrender.com/)**.
> Test air-gapped network severance ("Cut Link"), sub-5ms hybrid RAG recall, live telemetry streams, and 3-way partition conflict arbitration with zero installation.

---

## Executive Summary

**Clauset** is an offline-first semantic memory mesh and policy firewall built specifically for autonomous agents operating at the physical edge — field robotics, air-gapped industrial infrastructure, defense systems, medical enclaves, and distributed mobile agents.

When autonomous agents are deployed outside centralized cloud data centers, conventional cloud-hosted vector databases fail: network drops cause agent amnesia, concurrent edits across partitions trigger catastrophic silent overwrites, and unconstrained context retrieval leaks proprietary credentials and confidential data to third-party LLM providers.

Clauset solves this by giving every edge node:
1. **Sub-10ms On-Device Hybrid Recall**: Reciprocal Rank Fusion (`RRF k=2`) blending BM25 keyword search with dense vector cosine similarity directly on the node.
2. **Deterministic Data Residency Firewall**: Enforcing residency rules (`local_only`, `replicated`, `restricted`) *before* data touches the replication queue or an LLM context window.
3. **Partition-Tolerant Vector WAL**: Priority-queued Write-Ahead Logging that continues accumulating observations offline and safely replicates on reconnect.
4. **Zero-Silent-Overwrite 3-Way Conflict Arbitration**: Explicit ancestry tracking with vector clocks, visual diffing, and 3-way merge capabilities when partitions heal.
5. **Grounded On-Device RAG Assistant**: Multi-turn operational assistant that redacts restricted data, cites local playbooks with verified source spans, and falls back to deterministic local extractive synthesis when air-gapped.
6. **Dual-Engine Architecture**: Automatically links with high-performance Python `qdrant_edge` + `FastEmbed` engines or falls back to an in-process, zero-native-dependency TypeScript mesh runtime that works out of the box on Windows, macOS, and Linux.

---

## The Problem: Why Edge Agents Need Clauset

```
Traditional Cloud-Centric Agent               Clauset Local-First Agent Mesh
────────────────────────────────              ────────────────────────────────
[Agent Observation]                           [Agent Observation]
        │                                             │
        ▼                                             ▼
 [Internet WAN]  ──✖ (Drop / Partition)     [Local Clauset Gateway]
        │             Agent Freezes!                  │
        ▼                                    ┌────────┴────────┐
 [Cloud Vector DB]                           ▼                 ▼
        │                              [Dense Engine]    [BM25 Lexical]
        ▼                                    └────────┬────────┘
 [Cloud LLM Call]                                     ▼
   ⚠ LEAKS TOKENS & SECRETS!                   [Residency Shield]
                                                      │  (Restricted Redacted)
                                                      ▼
                                              [Grounded RAG Answer]
                                              ✔ 100% Air-Gapped & Resilient
```

| Failure Mode | Traditional Cloud Architecture | Clauset Edge Mesh Architecture |
| :--- | :--- | :--- |
| **Connectivity Drop** | Agents freeze, fail lookups, or drop critical telemetry. | 100% operational offline with local persistent vector shards (`manuals`, `incidents`, `sensors`). |
| **Partition Healing** | Cloud databases overwrite edge edits (Last-Write-Wins), destroying local incident records. | Vector-clocked 3-Way Conflict Arbitration flags divergences for explicit Keep Local, Accept Remote, or 3-Way Merge. |
| **Privacy & Exfiltration** | Naive RAG prompts send local environment secrets and sensitive data to remote LLM APIs. | Strict **Residency Shield** quarantines `restricted` items from external prompts and replication payloads. |
| **Recall Quality** | Pure dense embeddings hallucinate on exact alphanumeric identifiers (e.g. error codes `E-502`, serial `BR-409`). | **Hybrid RRF (`k=2`)** balances exact keyword matches with semantic vectors for zero-miss accuracy. |
| **Cold Starts** | Long network ingestion and slow model downloads block agent initialization. | Sub-second snapshot bootstrap with portable JSON serialization and policy-sanitized payloads. |

---

## Core Capabilities & Invariants

### 1. Dual-Engine Architecture (Hot Probing & Transparent Failover)
Clauset features an intelligent gateway layer (`src/lib/protocol-gateway.ts`) that guarantees instant launch regardless of host environment:
- **Python Qdrant Edge Mode (`:3030`)**: Integrates with native `qdrant_edge` storage, `fastembed` embeddings, and federated peer gossip (`device-alpha` <-> `device-beta`).
- **Embedded TypeScript Mesh Runtime (`.protocol-data/`)**: A pure Node.js in-process engine equipped with an exact BM25 indexer, 128-dimensional deterministic semantic projection vector space, Reciprocal Rank Fusion combiner, and persistent WAL.
- **Zero Configuration**: The gateway probes `:3030` with sub-100ms timeouts; if Python or wheels are absent, it seamlessly transitions to the embedded engine without crashing or degrading features.

### 2. Immutable Residency Firewall & RAG Guard
Every memory point submitted to Clauset is evaluated against a declarative policy matrix:
- **`local_only`**: Persisted to the local node; never enqueued in sync queues, never replicated over the wire.
- **`replicated`**: Synchronized across peer nodes and uploaded to central storage once online.
- **`restricted`**: Cryptographic/policy floor. Any payload tagged with credentials, auth tokens, or PII is automatically forced to `local_only`.
- **RAG Residency Quarantine**: When an agent prompts the `/api/protocol/chat` endpoint, Clauset retrieves all relevant memories, runs the residency audit, and **quarantines** restricted records — citing their metadata for auditability while stripping their sensitive bodies before LLM synthesis.

### 3. Zero-Silent-Overwrite 3-Way Conflict Resolution
When an agent operates in an offline partition, concurrent edits to operational playbooks or incident reports cause vector clock divergence. 
- Clauset captures base, local, and remote versions upon reconnection.
- Conflicts are staged in an interactive resolution card rather than blindly discarded.
- Operators or agents can execute a **3-Way Merge**, **Keep Local**, or **Accept Remote**, ensuring complete audit trails and data integrity.

### 4. Partition-Tolerant Write-Ahead Log (WAL)
- Edge writes are appended immediately to a persistent priority WAL queue (`critical` > `high` > `medium` > `low`).
- When offline, writes continue safely with monotonic sequence tracking.
- When uplink recovers, the sync engine drains the queue with exponential backoff and payload deduplication.

### 5. Multi-Shard Domain Segregation
Memory is segmented into distinct operational shards:
- `manuals`: Canonical operating procedures, recovery manuals, safety playbooks (immutable reference base).
- `incidents`: High-criticality event traces, anomalies, operator interventions, and resolved outage logs.
- `sensors`: Fast-moving telemetry, environmental metrics, and temperature/pressure readings subject to automatic TTL retention pruning sweeps.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLAUS-ET WORKBENCH UI                           │
│  [Dark / Light Mode] • [Topology Canvas] • [RAG Chat] • [Memory Vault]      │
│  [Conflict Console] • [Governance Simulator] • [Command Palette ⌘K]        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / SSE / REST
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLAUS-ET PROTOCOL GATEWAY (:3000)                      │
│                  src/lib/protocol-gateway.ts & API Routes                   │
│                                                                             │
│   ┌───────────────────────────────┐     ┌───────────────────────────────┐   │
│   │     Primary Engine Probe      │     │      Embedded Fallback        │   │
│   │   Python Qdrant Edge (:3030)  │◄───►│  TypeScript Mesh Runtime      │   │
│   │   - FastEmbed ONNX Pipeline   │(fail│  - In-Process BM25 Lexical    │   │
│   │   - Native Qdrant Shards      │ over│  - 128d Dense Cosine Space    │   │
│   │   - Peer Gossip (:3031)       │     │  - Reciprocal Rank Fusion     │   │
│   └───────────────────────────────┘     └───────────────┬───────────────┘   │
│                                                         │                   │
│   ┌─────────────────────────────────────────────────────┴───────────────┐   │
│   │                 RESIDENCY SHIELD & POLICY ENGINE                    │   │
│   │     Enforces policy routing: local_only | replicated | restricted   │   │
│   │     Quarantines credentials & PII from external RAG prompts         │   │
│   └─────────────────────────────────────────────────────┬───────────────┘   │
│                                                         │                   │
│   ┌─────────────────────────────────────────────────────┴───────────────┐   │
│   │                   GROUNDED RAG SYNTHESIS ENGINE                     │   │
│   │     Hybrid RRF Search ──► Source Verification ──► Citing Assistant  │   │
│   └─────────────────────────────────────────────────────┬───────────────┘   │
│                                                         │                   │
│   ┌─────────────────────────────────────────────────────┴───────────────┐   │
│   │               PERSISTENT WAL & 3-WAY CONFLICT ENGINE                │   │
│   │     Vector Clocks • Priority Sync Queue • Snapshot Importer/Exporter│   │
│   │     Storage Root: .protocol-data/mesh-state.json                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
        [Regional Edge Peers]                     [Central Cloud Qdrant]
        (device-beta, device-gamma)               (Enterprise Memory Archive)
```

---

## Quickstart (5-Minute Setup)

Clauset requires **Node.js 20+**. The full embedded mesh runtime runs out-of-the-box with **zero Python or Docker setup required**.

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/13thprotocol/clauset.git
cd clauset

# Install dependencies
npm install
```

### 2. Launch Development Server

```bash
npm run dev
```

*On Windows systems where PowerShell ExecutionPolicy restricts scripts, use any of these alternatives:*
```cmd
# Alternative A: Double click start.bat in Explorer
start.bat

# Alternative B: Direct Node runner
node scripts/launch.mjs --dev

# Alternative C: cmd runner
npm.cmd run dev
```

Open your browser to: **`http://localhost:3000`**

*(Or skip local installation and try the live cloud deployment directly at **[https://clauset-workbench.onrender.com/](https://clauset-workbench.onrender.com/)**)*

### 3. Optional: Bootstrap Python Qdrant Edge Engine
If you intend to run the native Python Qdrant Edge engine alongside the Next.js gateway:

```bash
node scripts/launch.mjs --bootstrap-python
```
*This automatically sets up a virtual environment in `.venv/`, installs `qdrant_edge`, `fastembed`, and `qdrant_client`, and boots dual edge peer instances on ports 3030 and 3031.*

---

## Workbench UI Tour

The Clauset Workbench is engineered as an industrial-grade command center with zero hydration flicker and instant Light/Dark mode toggling:

```
┌─ [CLAUSET MESH WORKBENCH] ────────────────────────── [Theme: ☀/☾] [Uplink: Online] ─┐
│                                                                                     │
│  [Overview]        [Agent RAG]        [Memory Vault]      [Sync & Conflicts] [Policy]│
│                                                                                     │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────────────────┐  │
│  │ LIVE TOPOLOGY CANVAS    │  │ HYBRID RECALL & GROUNDED RAG WORKBENCH           │  │
│  │                         │  │                                                  │  │
│  │ [Cloud Qdrant Central]  │  │ > "How do we recover from a split-brain partition?" │  │
│  │           ▲             │  │                                                  │  │
│  │       (Uplink)          │  │ [Clauset Assistant]:                             │  │
│  │           │             │  │ 1. Verify vector clocks on both edge peers [1]   │  │
│  │    [Edge Relay]         │  │ 2. Stage base/local/remote versions in console [2]│ │
│  │      ▲       ▲          │  │ 3. Execute 3-way merge to preserve observations. │  │
│  │      │       │          │  │                                                  │  │
│  │ [device-a] [device-b]   │  │ Citations:                                       │  │
│  │ (Active)    (Peer)      │  │ [1] SOP-Partition-Recovery (manuals, score=0.94) │  │
│  │                         │  │ [2] Partition-Incident-Log (incidents, score=0.88)│ │
│  │                         │  │ Residency Guard: 1 restricted record quarantined.│  │
│  └─────────────────────────┘  └──────────────────────────────────────────────────┘  │
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ SHARD STATS: manuals (14) • incidents (28) • sensors (142) • WAL Queue (0)    │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Header & Navigation Rail**:
   - Live Node Ping and Engine indicator (`Embedded TS Mesh (Persistent)` or `Qdrant Edge Native`).
   - One-click **Cut Link / Reconnect** toggle to simulate offline network partitions instantly.
   - Light / Dark Mode toggle (`localStorage` backed, warm-paper & slate vs deep obsidian).
   - Global **⌘K Command Palette** for rapid keyboard-driven control.
   - **Guided Walkthrough Drawer** offering a 5-step interactive product tour.

2. **Interactive Topology Canvas**:
   - Visual SVG network map illustrating live telemetry between `Edge Node Alpha`, `Peer Node Beta`, `Regional Relay`, and `Cloud Qdrant`.
   - Dynamic packet pulse animations reflecting real-time sync events.

3. **Agent RAG Workbench**:
   - Split-screen workspace pairing conversational agent queries with a raw retrieval debugger.
   - Visual score breakdown comparing Dense Cosine, BM25 Lexical, and Reciprocal Rank Fusion (`RRF k=2`) metrics.
   - Live audit badge displaying quarantined restricted points.

4. **Memory Vault & Shard Inspector**:
   - Real-time shard browser with full-text filter and metadata search.
   - Slide-out **Point Inspector Drawer** with AI Playbook Distillation and automated tag prediction.
   - **Write Memory Composer** with live residency preview and policy compliance dry-run.
   - **Cloud Archive Browser** inspecting remote synchronized collections.

5. **Sync & 3-Way Conflict Console**:
   - Visual diff viewer displaying Base, Local, and Remote states for divergent records.
   - Interactive conflict resolution actions: *Keep Local*, *Accept Remote*, or *Custom 3-Way Merge*.
   - Snapshot import and export supporting full-fidelity JSON backups.

6. **Governance & Policy Simulator**:
   - Visual rule matrix editor (`local_only`, `replicated`, `restricted`).
   - Interactive policy sandbox testing classification triggers against raw text payloads.
   - Scheduled TTL Retention Sweeper for raw telemetry pruning.
   - Copy-paste developer integration code snippets (SDK, CLI, cURL, Python).

---

## Programmatic TypeScript SDK

Clauset includes a fully-typed TypeScript client (`src/sdk/client.ts`):

```typescript
import { ClausetClient } from "./src/sdk/client";

// Initialize client (defaults to local Next.js gateway)
const clauset = new ClausetClient({ baseUrl: "http://localhost:3000" });

async function runEdgeWorkflow() {
  // 1. Check mesh health and active engine
  const health = await clauset.health();
  console.log(`Engine: ${health.engine_label} | Version: ${health.protocol_version}`);

  // 2. Remember an observation with policy metadata
  const writeRes = await clauset.remember({
    shard: "incidents",
    title: "Optical sensor thermal warning",
    text: "Optical sensor node-4 reporting operating temperature above 78C threshold.",
    criticality: "high",
    sensitivity: "internal",
    asset_id: "sensor-node-04"
  });
  console.log(`Stored point ${writeRes.point_id} with residency: ${writeRes.residency}`);

  // 3. Perform hybrid search using Reciprocal Rank Fusion
  const searchResults = await clauset.search({
    shard: "manuals",
    query: "high temperature cooling circuit breaker",
    mode: "hybrid",
    limit: 3
  });
  console.log(`Found ${searchResults.points.length} matching playbooks`);

  // 4. Ask grounded agent question with automatic residency protection
  const chatRes = await clauset.ask({
    query: "What emergency procedure applies when sensor temperatures exceed 75C?",
    shard: "all"
  });
  console.log(`Synthesis [${chatRes.synthesis_mode}]:\n${chatRes.answer}`);
  console.log(`Citations: ${chatRes.citations.map(c => c.title).join(", ")}`);
  console.log(`Quarantined restricted records: ${chatRes.quarantined_count}`);

  // 5. Test policy residency dry-run
  const sim = await clauset.simulatePolicy({
    text: "Database admin master password root_vault_9921",
    criticality: "high",
    sensitivity: "restricted",
    domain: "security"
  });
  console.log(`Enforced residency: ${sim.enforced_residency} (Floor applied: ${sim.rule_applied})`);
}

runEdgeWorkflow();
```

---

## CLI Wrapper Reference

Clauset includes an operational command-line utility (`bin/clauset-cli.mjs`) for headless environments, CI pipelines, and robotic scripts:

```bash
# General Syntax
node bin/clauset-cli.mjs <command> [options]
```

### Available Commands

| Command | Flags / Options | Description |
| :--- | :--- | :--- |
| **`status`** | `--device <id>` | Outputs engine mode, link status, queue depth, open conflicts, and cloud points. |
| **`search`** | `<query> [--shard manuals\|incidents\|sensors] [--mode hybrid\|dense\|sparse] [--limit n]` | Executes hybrid RRF or dense vector search across local shards. |
| **`ask`** | `<question> [--shard all\|manuals\|incidents]` | Queries the grounded RAG assistant with automatic residency redaction. |
| **`remember`** | `--text "..." [--shard <id>] [--title <t>] [--criticality low\|med\|high] [--sensitivity <level>]` | Writes an observation record subject to deterministic residency routing. |
| **`offline`** | `--device <id>` | Simulates a network partition by severing the node's uplink. |
| **`online`** | `--device <id>` | Reconnects the node's uplink and triggers automatic WAL queue sync. |
| **`sync`** | `--device <id>` | Drains the local Write-Ahead Log queue to peer relays or cloud storage. |
| **`bootstrap`**| `--device <id>` | Cold-starts local memory shards from a base cloud snapshot. |
| **`retention`**| `--device <id>` | Executes a TTL telemetry pruning sweep to reclaim local edge disk space. |
| **`snapshot`** | `--device <id>` | Exports a sanitized, portable JSON snapshot of the local memory mesh. |
| **`conflict`** | `--device <id>` | Seeds a demo partition conflict to test 3-way arbitration workflows. |

### Example CLI Workflows

```bash
# Check status
$ node bin/clauset-cli.mjs status
{
  "service": "clauset-gateway",
  "protocol_version": "1.3.0",
  "engine_mode": "embedded_mesh",
  "engine_label": "Embedded TS Mesh (Persistent)",
  "active_node": "device-alpha",
  "online": true,
  "queue_depth": 0,
  "open_conflicts": 0,
  "cloud_points": 42
}

# Ask grounded question
$ node bin/clauset-cli.mjs ask "How do we recover from a split-brain partition?"

[Clauset Synthesis: extractive_grounded | 4ms | Quarantined: 0]

According to standard recovery playbooks:
1. Verify vector clock timestamps on all partitioned nodes.
2. Inspect open conflict records in the Sync Console.
3. Apply a 3-way merge to preserve non-overlapping telemetry.

Citations: [1] SOP-Partition-Recovery (manuals, score=0.96) | [2] Relational-Divergence-Notes (incidents, score=0.89)

# Sever uplink and test offline write
$ node bin/clauset-cli.mjs offline
{ "device": "device-alpha", "online": false }

$ node bin/clauset-cli.mjs remember --shard incidents --criticality high --text "Offline telemetry sample during test cut"
{
  "point_id": "p-1718290123-921",
  "residency": "replicated",
  "enqueued": true,
  "queue_depth": 1
}

# Reconnect and sync
$ node bin/clauset-cli.mjs online
{ "device": "device-alpha", "online": true }

$ node bin/clauset-cli.mjs sync
{ "ok": true, "pushed": 1, "pulled": 0, "new_conflicts": 0 }
```

---

## REST API Reference

All endpoints are hosted at `/api/protocol/*` and accept and return standard JSON:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/protocol/health` | Returns gateway status, protocol version, and active engine mode. |
| `GET` | `/api/protocol/state` | Retrieves full mesh state (nodes, link status, queue, shard counts). |
| `GET` | `/api/protocol/fleet` | Returns multi-node cluster topology and peer connectivity matrix. |
| `GET` | `/api/protocol/memory` | Returns per-shard point counts, vector dimensions, and memory usage. |
| `GET` | `/api/protocol/points` | Lists memory records within a shard with optional keyword search and limits. |
| `POST`| `/api/protocol/search` | Executes hybrid, dense, or BM25 search with optional score explanations. |
| `POST`| `/api/protocol/write` | Ingests a new point through the policy engine and appends to the WAL. |
| `POST`| `/api/protocol/chat` | Executes Grounded RAG with the Residency Shield and citation mapping. |
| `POST`| `/api/protocol/connectivity` | Toggles node uplink status (`online: true|false`). |
| `POST`| `/api/protocol/sync` | Manually triggers WAL queue flush to central cloud store. |
| `POST`| `/api/protocol/bootstrap` | Re-seeds local shards from an authoritative central snapshot. |
| `GET` | `/api/protocol/policy` | Returns current declarative residency and retention rule definitions. |
| `POST`| `/api/protocol/policy/simulate` | Tests how arbitrary payloads will be classified without saving. |
| `POST`| `/api/protocol/conflict/resolve` | Resolves a staged partition conflict (`local`, `remote`, or `merge`). |
| `POST`| `/api/protocol/snapshot/export` | Generates a portable, policy-sanitized JSON snapshot file. |
| `POST`| `/api/protocol/snapshot/import` | Ingests a portable snapshot file into local storage. |
| `POST`| `/api/protocol/retention/run` | Triggers immediate expiration of aged telemetry points. |
| `POST`| `/api/protocol/intelligence` | Generates distilled SOPs or predictive tags from incident traces. |
| `GET` | `/api/protocol/stream` | Server-Sent Events (SSE) stream broadcasting live mesh events. |

---

## Verification & Testing Suite

Clauset includes a rigorous, automated verification suite ensuring 100% test passing before any deployment:

```bash
# 1. Typecheck TypeScript sources
npm run typecheck

# 2. Run ESLint code quality suite
npm run lint

# 3. Production Webpack build
npm run build

# 4. Run full end-to-end integration test suite
npm run verify
```

### The 11 Verification Gates in `scripts/verify.mjs`

```
[1/11] Health & dual-engine detection check
[2/11] Mesh state & node connectivity initialization
[3/11] Policy routing & restricted residency firewall enforcement
[4/11] Hybrid RRF recall & dense vector query validation
[5/11] Grounded RAG synthesis with source citation verification
[6/11] RAG Residency Shield quarantine audit verification
[7/11] Offline network severance & WAL queue accumulation
[8/11] Reconnection & automated queue flush synchronization
[9/11] Split-brain divergence simulation & 3-way conflict arbitration
[10/11] Raw telemetry TTL retention pruning sweep
[11/11] Portable snapshot export and round-trip import integrity
======================================================================
✔ ALL 11 CLAUSET VERIFICATION CHECKS PASSED WITH ZERO ERRORS!
```

---

## Hackathon Submission Dossier

### Target Track & Domain
- **Track**: Autonomous Agent Infrastructure & Edge Computing / Privacy-Preserving AI
- **Tagline**: The Local-First Memory Mesh, Data Residency Firewall, and Grounded RAG Workbench for Autonomous AI Edge Agents.
- **Live Demo**: [https://clauset-workbench.onrender.com/](https://clauset-workbench.onrender.com/)
- **GitHub Repository**: [https://github.com/theraghavbansal/clauset](https://github.com/theraghavbansal/clauset)

### The Innovation
1. **Air-Gapped Autonomous Operation**: Agents do not require an active internet uplink to retain full semantic recall and reasoning capabilities.
2. **Residency Shield**: Prevents accidental data exfiltration to cloud LLMs by programmatically quarantining credentials, customer PII, and secrets.
3. **Partition-Resistant Collaboration**: Solves the split-brain dilemma for distributed fleets using vector clocks and visual 3-way merge conflict resolution.
4. **Instant Dual-Engine Accessibility**: Eliminates native compilation roadblocks by providing a zero-setup TypeScript mesh runtime alongside the native Python Qdrant Edge engine.

### Real-World Use Cases
- **Defense & Field Operations**: Drones and unmanned ground vehicles operating in GPS/WAN-denied environments maintaining synchronized tactical memory.
- **Industrial IoT & Robotics**: Factory floor robotic arms sharing operational error logs without leaking proprietary factory telemetry to external clouds.
- **Healthcare & Regulated Enclaves**: On-premises medical assistants querying patient histories while guaranteeing that PHI/HIPAA records never escape the local hospital subnet.
- **Space & Remote Exploration**: Planetary rovers and remote scientific stations accumulating sensor observations with automatic conflict resolution upon satellite pass-bys.

---

## Project Structure

```
clauset/
├── bin/
│   └── clauset-cli.mjs            # Operational CLI executable
├── edge-mem-main/                 # Upstream Python Qdrant Edge engine
│   └── mini-services/
│       └── edge-engine/           # FastAPI, FastEmbed & Qdrant native peer service
├── scripts/
│   ├── launch.mjs                 # Cross-platform orchestrator (Node + Python)
│   ├── verify.mjs                 # 11-step integration verification harness
│   └── test-e2e.mjs               # End-to-end integration test runner
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/protocol/          # Gateway API endpoints
│   │   ├── globals.css            # Tailwind styles + Theme variables
│   │   ├── layout.tsx             # Root layout with anti-flicker theme injection
│   │   └── page.tsx               # Workbench single-page dashboard
│   ├── components/
│   │   └── protocol/              # High-contrast Workbench UI components
│   │       ├── AgentRagWorkbench.tsx
│   │       ├── CommandPalette.tsx
│   │       ├── GovernanceSdkPanel.tsx
│   │       ├── MemoryVault.tsx
│   │       ├── MeshOverview.tsx
│   │       ├── PointInspectorDrawer.tsx
│   │       ├── ProtocolShell.tsx
│   │       ├── SyncConflictsConsole.tsx
│   │       ├── TopologyCanvas.tsx
│   │       ├── WalkthroughDrawer.tsx
│   │       └── WorkbenchUI.tsx
│   ├── hooks/
│   │   ├── use-protocol.ts        # Live SWR-style mesh state hook
│   │   └── use-theme.ts           # Light/Dark mode state management
│   ├── lib/
│   │   ├── protocol-gateway.ts    # Dual-engine proxy & fallback router
│   │   ├── protocol-rag.ts        # Grounded RAG + Residency Shield engine
│   │   ├── protocol-runtime.ts    # In-process Embedded TypeScript Mesh Runtime
│   │   └── protocol-types.ts      # Comprehensive TypeScript domain types
│   └── sdk/
│       └── client.ts              # ClausetClient TypeScript SDK
├── start.bat                      # One-click Windows launch script
├── tailwind.config.ts             # Tailwind CSS v3 configuration
└── tsconfig.json                  # Strict TypeScript configuration
```

---

## License

Clauset is open-source software licensed under the [MIT License](LICENSE).
Built with pride for resilient, privacy-preserving autonomous agent architectures.
