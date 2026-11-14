# Clauset — Core Edge Engine Subsystem

This folder contains the native Python Qdrant Edge engine (`mini-services/edge-engine`) that powers hardware-accelerated local vector storage within the **Clauset** architecture.

> **Note**: For the main application, web interface, TypeScript SDK, CLI tool, and verification suite, see the root documentation at [../README.md](../README.md).

---

## Subsystem Architecture

The core edge engine is a FastAPI service designed to run locally on resource-constrained devices:

```
┌────────────────────────────────────────────────────────┐
│ Clauset Root Gateway (:3000)                           │
│ - Web Workbench UI                                     │
│ - Dual-Engine Proxy & Embedded TS Fallback             │
│ - Policy Enclave & Grounded RAG Assistant              │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP Proxy / Probing (:3030)
                            ▼
┌────────────────────────────────────────────────────────┐
│ edge-mem-main/mini-services/edge-engine (:3030)       │
│ - FastEmbed Local Embeddings (ONNX Runtime)            │
│ - Qdrant Edge Vector Database                          │
│ - Shard Management (manuals, incidents, sensors)      │
│ - Peer Federation Gossip (:3031 peer node)             │
└────────────────────────────────────────────────────────┘
```

---

## Direct Engine Operation

### 1. Requirements
- Python 3.11, 3.12, or 3.13
- Virtual environment (`venv`) with dependencies from `mini-services/edge-engine/requirements.txt`

### 2. Manual Startup

**Linux / macOS:**
```bash
cd mini-services/edge-engine
./start.sh
```

**Windows (via Clauset automated bootstrap):**
```bash
# From the repository root:
node scripts/launch.mjs --bootstrap-python
```

### 3. Automated Peer Mesh

When started via `launch.mjs`, the system can instantiate two local edge peers simultaneously:
- **Primary Node (`device-alpha`)**: Port `3030`
- **Secondary Peer (`device-beta`)**: Port `3031`
- **Federated Gossip**: Configured via `FEDERATED_PEERS="device-beta=http://127.0.0.1:3031"`

---

## Running Engine Unit Tests

To run the Python engine test suite directly:

```bash
cd mini-services/edge-engine
python -m unittest discover -s tests -p "test_*.py"
```

---

## Shards & Storage Layout

- **`manuals`**: Operating manuals, runbooks, and recovery checklists (long-term read reference).
- **`incidents`**: Historical outage reports, anomalies, and operator actions (medium-term episodic memory).
- **`sensors`**: High-frequency metric telemetry subject to periodic TTL retention expiration.
