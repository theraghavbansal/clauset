# Clauset — Hackathon Pitch & Demo Script

## 30-Second Pitch

> Autonomous agents deployed on robots, field relays, and edge terminals lose access to cloud vector databases the moment the link drops — yet still need institutional memory, safety playbooks, and zero-trust data governance.
>
> **Clauset** gives every edge node its own hybrid-search semantic memory mesh, a non-bypassable residency firewall that guarantees restricted credentials never leave the device, a grounded RAG synthesizer that works even 100% air-gapped, and 3-way conflict arbitration when partitioned peers reconnect.

## Live 3-Minute Demo Flow

Open the **Demo** drawer in the bottom-left rail (or press `⌘K` -> `Open Demo Walkthrough`):

1. **Mesh Overview & Live Topology**: Point out the live SVG topology (`Alpha` local node, `Beta` federated peer, `Gamma` partitioned peer, `Cloud Qdrant Hub`) and switch smoothly between Light and Dark mode.
2. **Cut Uplink (Air-Gap)**: Toggle **Cut Link** in the sidebar. Show the topology link switch to `AIR-GAPPED`.
3. **Offline Grounded RAG**: Open **Agent RAG & Search** and ask *"Which memories are quarantined as restricted?"* or *"How do we recover from a split-brain partition?"*. Show sub-5ms hybrid RRF recall and the **Residency Shield** quarantining `restricted` local records.
4. **Policy Enforcement**: In **Memory Vault**, click `+ Restricted Secret Canary` and show the live **Policy Preview** locking it to `local_only`.
5. **Reconnect, Sync & 3-Way Conflict Resolution**: Click **Reconnect**, then **Sync Now**, then open **Sync & Conflicts** -> **Stage Conflict** -> **Sync Now** -> resolve via **3-Way Merge Editor**.
6. **SDK & CLI**: Open **Governance & SDK** or run `node bin/clauset-cli.mjs status` in a terminal to demonstrate programmatic agent integration.
