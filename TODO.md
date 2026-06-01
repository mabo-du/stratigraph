---
mode: subagent
---

<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2025-2026 Marcus Quinn -->
# TODO

Project task tracking with time estimates, dependencies, and TOON-enhanced parsing.

Compatible with [todo-md](https://github.com/todo-md/todo-md), [todomd](https://github.com/todomd/todo.md), [taskell](https://github.com/smallhadroncollider/taskell), and [Beads](https://github.com/steveyegge/beads).

## Format

**Human-readable:**

<!-- GH#17804: Format examples wrapped in HTML comment to prevent parsers
     from extracting them as real tasks during upgrade-planning migrations.
- [ ] t001 Task description @owner #tag ~30m risk:low logged:2025-01-15
- [ ] t002 Dependent task blocked-by:t001 ~15m risk:med
- [ ] t001.1 Subtask of t001 ~10m
- [x] t003 Completed task ~30m actual:25m logged:2025-01-10 completed:2025-01-15
- [-] Declined task
-->

Format: `- [ ] tNNN Description @owner #tag ~estimate risk:level logged:date`

**Task IDs:**
- `t001` - Top-level task
- `t001.1` - Subtask of t001
- `t001.1.1` - Sub-subtask

**Dependencies:**
- `blocked-by:t001` - This task waits for t001
- `blocked-by:t001,t002` - Waits for multiple tasks
- `blocks:t003` - This task blocks t003

**Time fields:**
- `~estimate` - AI-assisted execution time (~15m trivial, ~30m small, ~1h medium, ~2h large, ~4h major — see `reference/planning-detail.md`)
- `actual:` - Actual active time spent (from session-time-helper.sh)
- `logged:` - When task was added
- `started:` - When branch was created
- `completed:` - When task was marked done

**Risk (human oversight needed):**
- `risk:low` - Autonomous: fire-and-forget, review PR after
- `risk:med` - Supervised: check in mid-task, review before merge
- `risk:high` - Engaged: stay present, test thoroughly, potential regressions

<!--TOON:meta{version,format,updated}:
1.1,todo-md+toon,{{DATE}}
-->

## Completed — v1 MVP

- [x] t001 DAG engine (cycle detection, transitive reduction) ~2h actual:2h logged:2026-05-01
- [x] t002 HMDP data model (Context, Observation, Phase, Event) ~1h actual:1h logged:2026-05-01
- [x] t003 Cytoscape.js canvas with Dagre auto-layout ~2h actual:2h logged:2026-05-01
- [x] t004 State management with undo/redo ~1h actual:1h logged:2026-05-01
- [x] t005 Sidebar UI (unit list, node editor, phase management) ~3h actual:3h logged:2026-05-02
- [x] t006 Toolbar with import/export/save/load/view controls ~2h actual:2h logged:2026-05-02
- [x] t007 CSV import with column mapping wizard ~3h actual:3h logged:2026-05-02
- [x] t008 HOARD Phase 1 JSON import with relationship inference ~3h actual:3h logged:2026-05-03
- [x] t009 HOARD EEDP export (Markdown + JSON) ~1h actual:1h logged:2026-05-03
- [x] t010 Libby/OxCal Bayesian script generation ~2h actual:2h logged:2026-05-03
- [x] t011 PNG/SVG/PDF export ~1h actual:1h logged:2026-05-04
- [x] t012 Dark/light theme with CSS variable system ~1h actual:1h logged:2026-05-04
- [x] t013 Publication mode and heatmap mode ~1h actual:1h logged:2026-05-04
- [x] t014 Phase grouping boxes (compound Cytoscape nodes) ~1h actual:1h logged:2026-05-04
- [x] t015 Keyboard shortcuts (undo/redo, save, search, delete) ~30m actual:30m logged:2026-05-04
- [x] t016 Search overlay (Ctrl+F palette) ~30m actual:30m logged:2026-05-04
- [x] t017 Save/load .hmatrix.json project files ~30m actual:30m logged:2026-05-04
- [x] t018 HMDP schema contract (context-sheet-v1.json) ~30m actual:30m logged:2026-05-05
- [x] t019 Test suite (6 files covering all modules) ~2h actual:2h logged:2026-05-05
- [x] t020 GeoJSON export for QGIS integration #gis ~30m risk:low logged:2026-05-29
- [x] t021 Legacy .LST format import (BASP/ArchEd) #import ~1h risk:low logged:2026-05-29
- [x] t022 Publication templates (traditional Harris Matrix styling) #ui ~2h risk:med logged:2026-05-29
- [x] t024 Tauri desktop wrapper for offline fieldwork #desktop ~4h risk:med logged:2026-05-29
- [x] t025 HOARD Phase 5 document generation integration #hoard ~3h risk:med logged:2026-05-29
- [x] t026 Proper field system import adapters (ArchesDB CIDOC-CRM, Intrasis) #import ~4h risk:high logged:2026-05-29
- [x] t027 Collapsible phase groups #ui ~1h risk:low logged:2026-05-29
- [x] t028 PWA/offline support (service worker + IndexedDB) #perf ~2h risk:med logged:2026-05-29
- [x] t029 Real-time collaboration (CRDTs/WebSockets) #collab ~6h risk:high logged:2026-05-29
- [x] t030 3D model integration (Three.js photogrammetry) #3d ~4h risk:high logged:2026-05-29
- [x] t023 Photo/finds display on nodes #ui ~1h risk:low logged:2026-05-29

## Ready (no blockers)

<!-- Tasks with no open blockers — run /ready to refresh -->

- [ ] t032 Semantic Graph RAG (In-Browser Knowledge Graphs) — Translate HMDP to CIDOC-CRM triples via Oxigraph WASM for LLM ingestion #ai ~3h risk:high
- [ ] t033 Spatiotemporal Phasing & Bayesian Visualization — Project nodes onto a vertical absolute-time axis using aoristic probability distributions from Libby #geochronology ~4h risk:high
- [ ] t034 Pleistocene Paleo-Coastline Mapping — Integrate ICE-7G_NA data from Paleo: Mapper API to dynamically adjust GIS map base layers #paleo ~3h risk:med

## Backlog

<!-- Backlog tasks moved to Completed -->

## In Progress

- [x] t031 Project documentation update (AGENTS.md, README.md, TODO.md) ~30m actual:30m risk:low started:2026-05-29 logged:2026-05-29

## In Review

<!-- Tasks with open PRs awaiting merge -->

<!--TOON:in_review[0]{id,desc,owner,tags,est,pr_url,started,pr_created,status}:
-->

## Declined

<!-- Tasks that were considered but decided against -->

<!--TOON:declined[0]{id,desc,reason,logged,status}:
-->

<!--TOON:dependencies-->
<!-- Format: child_id|relation|parent_id -->
<!--/TOON:dependencies-->

<!--TOON:subtasks-->
<!-- Format: parent_id|child_ids (comma-separated) -->
<!--/TOON:subtasks-->

<!--TOON:summary{total,ready,pending,in_progress,in_review,done,declined,total_est,total_actual}:
31,1,0,1,0,29,0,36h,,
-->
