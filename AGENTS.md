# StratiGraph

<!-- AI-CONTEXT-START -->

## Quick Reference

- **Build**: `cd app && npm run build` (tsc -b && vite build)
- **Dev**: `cd app && npm run dev`
- **Test**: `cd app && npm run test` (vitest — 7 test suites, all passing)
- **Lint**: `cd app && npm run lint`
- **Preview**: `cd app && npm run preview`
- **Desktop dev**: `cd app && npm run tauri:dev` (Tauri + Vite hot-reload)
- **Desktop build**: `cd app && npm run tauri:build` (produces .deb, .rpm, .AppImage)
- **PWA**: App auto-registers service worker in production builds; installable via browser prompt
- **Deploy**: `git push` triggers `.github/workflows/deploy.yml`

## Project Overview

StratiGraph is a browser-based Harris Matrix generator for archaeological
stratigraphy — a React + TypeScript + Vite SPA. It allows field archaeologists
to construct, validate, and export stratigraphic sequences (directed acyclic
graphs) with no backend dependency. Data is stored as portable `.hmatrix.json`
files.

The app implements the **Harris Matrix Data Package (HMDP)** standard and
integrates with three sister projects in the digital heritage ecosystem:

| Project | Role | Location |
|---------|------|----------|
| **HOARD** | AI context-sheet digitisation (Phases 0-5) | `~/Projects/HOARD` |
| **Trowel** | Compliance report drafting from field data | `~/Projects/trowel` |
| **Libby** | Bayesian radiocarbon calibration | `~/Projects/Libby` |

See `docs/scope.md` for the original project scope and `README.md` for the
full feature list.

## Architecture

```
app/
├── src/                     # React + TypeScript frontend
│   ├── models/              # HMDP data types, DAG engine, OxCal export, HOARD I/O
│   │   ├── hmdp.ts              — Context, Observation, Phase, Event, SpatialMetadata
│   │   ├── graphLogic.ts        — Cycle detection, transitive reduction (Dye & Buck)
│   │   ├── bayesianLogic.ts     — OxCal CQL script generation
│   │   ├── hoardImporter.ts     — HOARD Phase 1 JSON import + inference engine
│   │   ├── hoardExport.ts       — EEDP path extraction for hallucination-free AI
│   │   ├── matrixState.ts       — State types + actions (undo/redo)
│   │   └── *.test.ts            — 7 test files covering all modules
│   ├── hooks/
│   │   └── useMatrixStore.ts    — useReducer central store with undo/redo
│   ├── components/
│   │   ├── MatrixCanvas/        — Cytoscape.js DAG renderer (Dagre layout)
│   │   ├── Toolbar/             — Top toolbar (import/export/save/load/views)
│   │   ├── Sidebar/             — Unit list, node editor, phase management
│   │   ├── ImportEngine/        — CSV wizard + HOARD JSON import with column mapping
│   │   └── SearchOverlay/       — Ctrl+F palette
│   └── utils/
│       ├── csvParser.ts         — PapaParse-based CSV import with flexible column mapping
│       ├── fileUtils.ts         — .hmatrix.json save/load, GeoJSON/PNG/SVG/PDF export
│       ├── tauriBridge.ts       — Tauri native dialog bridge with browser fallback
│       └── cytoscapeHelpers.ts  — Element builders, style generators
├── src-tauri/               # Tauri v2 Rust backend (desktop builds)
│   ├── src/lib.rs               — Tauri app setup with dialog + fs plugins
│   ├── Cargo.toml               — Rust dependencies
│   ├── tauri.conf.json          — Window config, bundle targets, security
│   └── capabilities/default.json — Permission grants (dialog, fs)
├── package.json
└── vite.config.ts
```

**Key architectural decisions:**
- Pure DAG model separate from visual representation (graphLogic.ts)
- Frictionless HMDP data standard for interoperability
- Cycle detection via DFS on every relationship addition
- Transitive reduction (Dye & Buck) at import time
- EEDP extraction prevents topological hallucinations in AI pipelines
- Undo/redo via command pattern (50-deep stack)
- Zero backend — runs entirely in the browser
- PWA: auto-registered service worker with Workbox precaching; offline-capable via IndexedDB project persistence
- Tauri v2 desktop wrapper (Rust + OS-native WebView) enables offline fieldwork with native file dialogs
- Tauri bundle sizes: ~3.7 MB .deb, ~11 MB binary, ~80 MB AppImage (bundles system deps)

## Conventions

- Commits: [Conventional Commits](https://www.conventionalcommits.org/)
- Branches: `feature/`, `bugfix/`, `hotfix/`, `refactor/`, `chore/`

## Key Files

| File | Purpose |
|------|---------|
| `.agents/AGENTS.md` | Project-specific agent instructions |
| `TODO.md` | Task tracking |
| `CHANGELOG.md` | Version history |
| `app/src-tauri/` | Tauri v2 desktop build (Rust backend, native dialogs) |
| `app/src/utils/tauriBridge.ts` | Tauri<->browser bridge with native file dialog fallback |
| `app/src/utils/offlineStorage.ts` | IndexedDB-backed offline project persistence |

<!-- AI-CONTEXT-END -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **StratiGraph** (543 symbols, 679 relationships, 8 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/StratiGraph/context` | Codebase overview, check index freshness |
| `gitnexus://repo/StratiGraph/clusters` | All functional areas |
| `gitnexus://repo/StratiGraph/processes` | All execution flows |
| `gitnexus://repo/StratiGraph/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
