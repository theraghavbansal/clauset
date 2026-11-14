# 13TH PROTOCOL: AN AI HACKATHON 2026 — OFFICIAL PITCH DECK

**Voyager Coding Club, KCC Institute of Technology & Management, Greater Noida**  
**HackIndia 2026 • Round 1 Pitch Deck**

---

## Slide 1: Title Slide

| Field | Content |
| :--- | :--- |
| **Header Badge** | `ROUND 1: PITCH` |
| **Hackathon Title** | `13TH PROTOCOL: AN AI HACKATHON 2026` |
| **Project Name** | **Clauset** |
| **Subtitle / Value Prop** | AI-powered solution for **Local-First Semantic Memory Mesh & Policy Residency Firewall for Autonomous Edge Agents** |
| **Club & College** | **Voyager Coding Club, KCC ITM** |
| **Team Name** | **Team Clauset** |
| **Team Members** | `[Member 1] • [Member 2] • [Member 3] • [Member 4]` |
| **Template Compliance** | *Color theme (White/Red/Charcoal/Green) and logos (KCC ITM, HackIndia, Voyager digital cube) strictly preserved.* |

> **Speaker Notes (Slide 1 — 20 seconds)**:  
> *"Good morning judges and fellow builders. Today, we are proud to present **Clauset**, a local-first semantic memory mesh, data residency firewall, and grounded RAG workbench designed for autonomous AI agents operating at the physical edge."*

---

## Slide 2: Problem & Audience

### ✖ The Problem
1. **Agent Amnesia on WAN Disconnects**: Cloud-dependent agents freeze or fail when network uplinks drop in edge and field environments; conventional vector databases are cloud-only.
2. **Silent Partition Data Loss**: Concurrent edits during offline network splits cause catastrophic Last-Write-Wins data corruption, wiping out local field discoveries.
3. **Critical Data & Secret Exfiltration**: Naive RAG prompts retrieve and send raw API tokens, system passwords, and confidential user data to external LLM providers.

### ✔ Target Users
1. **Autonomous Robotics & Field Drones**: Unmanned vehicles operating in intermittent, bandwidth-constrained, or GPS-denied environments.
2. **Regulated & Air-Gapped Enclaves**: Healthcare facilities, defense installations, and financial networks bound by strict data sovereignty laws.
3. **Industrial IoT & Plant Automation**: Smart factories coordinating high-frequency sensor readings, telemetry, and automated machine safety playbooks.

> **Speaker Notes (Slide 2 — 35 seconds)**:  
> *"Modern AI agents are brittle when they leave high-speed data centers. If a rescue drone or field robot loses its uplink, it loses its memory. When multiple agents edit playbooks while disconnected, reconnecting silently overwrites their data. Worst of all, naive RAG prompts routinely dump internal API keys and confidential PII to remote cloud LLMs. Our target users are defense robotics, regulated healthcare enclaves, and industrial IoT fleets who cannot afford amnesia or privacy leaks."*

---

## Slide 3: Proposed Solution

### Main Heading: Local-First Agent Memory Mesh & Policy Firewall
*An air-gapped vector memory fabric providing sub-5ms recall, deterministic residency governance, and vector-clocked conflict reconciliation.*

### 3 Solution Pillars:
1. ⚡ **Real-Time — Sub-5ms Hybrid Recall**  
   Fuses in-process BM25 lexical precision with dense vector cosine similarity via Reciprocal Rank Fusion (`RRF k=2`) directly on the edge device.
2. 🧠 **Adaptive AI — Zero-Overwrite 3-Way Merge**  
   Explicit vector clocks detect partitioned edits and stage Base, Local, and Remote states for deterministic, human-or-agent reconciliation.
3. 🛡️ **Secure — Residency Shield & Quarantine**  
   Cryptographic policy floor locks sensitive records to `local_only`, stripping secrets prior to any LLM prompt.

> **Speaker Notes (Slide 3 — 40 seconds)**:  
> *"Clauset solves this by giving every edge device its own decentralized memory mesh. First, it offers sub-5ms hybrid recall by combining BM25 keyword matching with dense vectors locally on the node. Second, it replaces destructive Last-Write-Wins with vector-clocked 3-Way Conflict Arbitration. Third, our deterministic Residency Shield guarantees that restricted secrets can never leave the node or leak into external LLM prompts."*

---

## Slide 4: Features & Innovation

| Feature | Title | Description |
| :--- | :--- | :--- |
| **FEATURE 01** | **Dual-Engine Hybrid Recall (Zero Native Hurdles)** | Intelligent gateway that automatically probes the Python `qdrant_edge` + `FastEmbed` ONNX engine on port 3030 with seamless in-process Embedded TypeScript Mesh fallback for 100% platform compatibility. |
| **FEATURE 02** | **Grounded Air-Gapped Agent RAG Workbench** | Multi-turn agent assistant citing verified source playbook spans, live Dense/BM25/RRF scoring debugger, and deterministic offline extractive synthesis. |
| **INNOVATION / USP** | **Residency Firewall & 3-Way Partition Conflict Arbitration** | Deterministic policy floor preventing secret exfiltration to cloud LLMs, paired with vector-clocked 3-way visual merge cards that eliminate Last-Write-Wins data corruption. |

> **Speaker Notes (Slide 4 — 35 seconds)**:  
> *"Our core innovation is two-fold: First, our Residency Firewall enforces a mathematical floor—any record tagged with secrets or PII is quarantined before prompt construction. Second, our Dual-Engine Gateway guarantees instant zero-setup launch on any operating system by hot-failing between Python Qdrant Edge and an in-process TypeScript mesh runtime."*

---

## Slide 5: Tech Stack & Architecture

### Architecture Flow:
`Agent Observation / Query` ➔ `Clauset Gateway (:3000)` ➔ `Residency Shield` ➔ `Local Shards (Qdrant Edge / TS Mesh)` ➔ `Priority WAL & 3-Way Merge` ➔ `Cloud Qdrant Hub`

### Tech Stack Breakdown:
- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v3, Interactive SVG Topology Canvas, Full Light & Dark Mode.
- **Backend**: TypeScript Mesh Gateway, Node.js 20+, FastAPI (Python Edge Engine), Priority WAL Queue Engine, Server-Sent Events (SSE).
- **AI / ML Engine**: Qdrant Edge Vector Engine, FastEmbed ONNX Runtime, In-Process BM25 Lexical, Reciprocal Rank Fusion ($k=2$).
- **Mesh Storage**: Segmented Local Shards (`manuals`, `incidents`, `sensors`), Vector-Clock Conflict Store, Cloud Qdrant Central Archive, Portable JSON Snapshots.

> **Speaker Notes (Slide 5 — 30 seconds)**:  
> *"Our architecture is built on Next.js 16 and React 19 on the frontend, with an interactive SVG topology canvas supporting full Light and Dark modes. The backend features a dual-engine architecture with Qdrant Edge, FastEmbed, and in-process BM25 lexical recall, synchronizing via a priority Write-Ahead Log to cloud archives."*

---

## Slide 6: Impact & Scalability

| Category | Metric / KPI | Description |
| :--- | :---: | :--- |
| **Expected Impact** | **< 5ms** | **99.9% Latency Reduction**: Sub-5ms on-device recall replaces 400ms+ cloud roundtrips with 100% offline continuous operation and zero data exfiltration. |
| **Feasibility** | **100%** | **11/11 Verified Tests**: Dual-engine architecture guarantees zero native hurdles on Windows, macOS, and Linux out-of-the-box; fully verified via automated test harness. |
| **Scalability** | **Mesh** | **Decentralized Edge Mesh**: Lightweight on-device footprint (<50MB RAM) scaling seamlessly across fleets of robotic units and centralized cloud vaults. |

> **Speaker Notes (Slide 6 — 25 seconds)**:  
> *"By moving semantic memory directly to the edge, we slash query latency from 400ms over WAN to under 5ms locally. Our solution has a verified 11/11 test pass rate across the full stack and scales effortlessly from small micro-controllers and robots up to enterprise cloud fleets."*

---

## Slide 7: Roadmap & Conclusion

### Headline: Resilient, Local-First Memory for the Agentic Era.
**Thank You.**

### 3-Step Milestone Roadmap:
1. **1 Prototype (MVP — Completed)**:  
   Dual-engine gateway, interactive topology workbench, Light/Dark mode, 3-way conflict resolver, and Grounded RAG with Residency Shield deployed and tested.
2. **2 Beta Phase (Next 60 Days)**:  
   Multi-hop ad-hoc wireless mesh gossip, hardware security module (HSM) enclave key integration, and native ROS2 / LangChain agent plugins.
3. **3 Scale (Enterprise Fleet)**:  
   Enterprise fleet rollout across thousands of robotic units with differential vector delta compression and federated policy governance.

> **Speaker Notes (Slide 7 — 15 seconds)**:  
> *"Clauset brings resilience, privacy, and zero data loss to the autonomous agentic era. Our MVP is fully operational and open for evaluation. Thank you, and we welcome your questions!"*

---

## How to Present This Deck

1. **Interactive Browser Presentation**:  
   Open `clauset-presentation.html` in any web browser (Chrome, Edge, Firefox).  
   - Press **Space** or **→** to advance slides.  
   - Press **←** to go back.  
   - Press **F** to enter full-screen mode.
2. **Export to PDF for Submission**:  
   - In `clauset-presentation.html`, click the **🖨 Export to PDF** button (or press `Ctrl+P`).  
   - Set Destination to **Save as PDF**, Layout to **Landscape**, and check **Background graphics**.  
   - Save your official 7-slide PDF!
