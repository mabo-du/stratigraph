# StratiGraph

<!-- AI-CONTEXT-START -->

## Quick Reference

- **Build**: `cd app && npm run build`
- **Dev**: `cd app && npm run dev`
- **Test**: `cd app && npm run test`
- **Lint**: `cd app && npm run lint`

## Project

Browser-based Harris Matrix generator for archaeological stratigraphy.
React + TypeScript + Vite SPA. Zero backend. Portable `.hmatrix.json` files.
Pure DAG model with Cytoscape.js rendering. Tauri v2 desktop wrapper.

## Architecture

```
app/src/
├── models/          — HMDP types, DAG engine, graph logic, bayesian export
├── hooks/           — useMatrixStore (reducer + undo/redo)
├── components/      — MatrixCanvas, Toolbar, Sidebar, ImportEngine
├── collaboration/   — CollaborationBar, ShareDialog, JoinDialog, useCollaboration
├── security/        — crypto, keychain (Stronghold → IndexedDB fallback)
└── utils/           — fileUtils, csvParser, tauriBridge, cytoscapeHelpers
app/src-tauri/       — Rust backend (axum relay, mDNS discovery, Stronghold)
packages/            — @stratigraph/sync, @stratigraph/sync-react
```

## Conventions

- Commits: Conventional Commits  |  Branches: `feature/`, `bugfix/`, `refactor/`, `chore/`

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
