# Changelog

All notable changes to StratiGraph will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-05-29

### Added

- **DAG Engine** — Cycle detection via DFS on every relationship addition. Transitive reduction (Dye & Buck algorithm) at import time.
- **HMDP Data Model** — Core types: Context, Observation, Phase, Event, SpatialMetadata with full HMDP/Frictionless Data standard.
- **Cytoscape.js Canvas** — Dagre (Sugiyama) auto-layout, manual drag-and-drop, node selection, tooltips, legend, empty-state.
- **Sidebar UI** — Unit list with filtering, NodeEditor (type/phase/description/relationship management), PhasePanel with color picker.
- **Toolbar** — Undo/redo, auto-layout, fit view, import/save/load, export dropdown, publication mode toggle, heatmap toggle, theme toggle.
- **CSV Import Engine** — Step-by-step wizard with Dropzone and ColumnMapper. Supports Contexts, Observations, Events CSVs with flexible column mapping for 20+ naming conventions.
- **HOARD Phase 1 JSON Import** — Parses `ctx_sheet_*.json`, infers relationships from `cuts/fills/same_as`, creates stub contexts for missing cross-references, schema-validated.
- **HOARD EEDP Export** — End-to-End DAG-Path extraction (Markdown + JSON). Linearises DAG for hallucination-free AI report generation.
- **Libby/OxCal Export** — Dye & Buck algorithm converting DAG to transitively reduced OxCal CQL script with boundary constraints.
- **PNG/SVG/PDF Export** — 2x resolution PNG, SVG via plugin (with raster fallback), A3 landscape PDF with jsPDF.
- **Dark/Light Theme** — Full CSS variable design system (DM Sans + JetBrains Mono + DM Serif Display) cascading into Cytoscape canvas.
- **Publication Mode** — Disables auto-layout for freehand node positioning during final PDF preparation.
- **Heatmap Mode** — Finds-density color interpolation across node backgrounds.
- **Phase Groups** — Compound Cytoscape parent nodes with phase-colored dashed bounding boxes.
- **Undo/Redo** — 50-deep command pattern stack via useReducer.
- **Keyboard Shortcuts** — Ctrl+Z/Shift+Z (undo/redo), Ctrl+S (save), Ctrl+F (search), Escape (deselect/close), Delete (remove).
- **Search Overlay** — Ctrl+F palette with keyboard navigation, auto-focus, and canvas highlighting.
- **Save/Load** — Portable `.hmatrix.json` files with all project state.
- **Schema Contract** — `schemas/context-sheet-v1.json` shared between HOARD and StratiGraph.
- **Test Suite** — 6 test files (graphLogic, csvParser, cytoscapeHelpers, hoardImporter, hoardExport, bayesianLogic) all passing.
- **Research Library** — Companion `docs/research-papers/` with 4 deep-research papers covering Harris Matrix conventions, user needs, and architectural synthesis.

### Ecosystem

- **HOARD** — Bidirectional integration: import Phase 1 outputs, export EEDP for AI.
- **Trowel** — Shared context data model; Trowel consumes StratiGraph EEDP outputs for deterministic report drafting.
- **Libby** — OxCal CQL export for Bayesian radiocarbon calibration.

[unreleased]: https://github.com/strati-graph/stratigraph/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/strati-graph/stratigraph/releases/tag/v1.0.0
