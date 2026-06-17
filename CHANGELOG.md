# Changelog

All notable changes to StratiGraph will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- No unreleased changes yet.

## [1.0.9] — 2026-06-17

### Fixed
- **Toolbar UI & Dropdown Clipping** — Fixed an issue where the Export dropdown menu was being clipped and hidden behind the canvas. Replaced the `overflow-x` approach with a responsive `flex-wrap` layout on the toolbar and elevated its `z-index` to properly escape stacking contexts without horizontal scrolling issues.

## [1.0.8] — 2026-06-16

### Fixed
- **Web P2P Privacy Fix** — Disabled WebRTC fallback completely on web builds to prevent privacy leaks when no custom signaling server is configured. Web builds are now explicitly "Offline Only" for collaboration.
- **Desktop mDNS P2P Security** — Dynamically discovered mDNS peers are now properly wrapped by the Phase 1 Ed25519 signature layer. Added validation to ignore any non-local IP addresses (10.x.x.x, 172.16-31.x.x, 192.168.x.x) broadcasted via mDNS.
- **Zero-Trust Yjs Crash** — Fixed a critical `TypeError: Cannot set property applyUpdate` crash on app startup in production builds by replacing the global `Y.applyUpdate` monkey-patch with a Vite alias plugin that natively wraps the ES module exports for seamless integration without breaking strict mode constraints.
- **Oxigraph WASM Bundling** — Fixed production bundling of the Oxigraph WASM dependency by explicitly copying it to `dist/assets` and increasing the PWA Workbox cache size limit to 10MB to accommodate the ~4MB database engine binary.

## [1.0.7] — 2026-06-16

### Fixed

- **Critical: File-load cycle** — Toolbar's hidden file input no longer intercepts the file picker before Workspace's reader can process it. The Load button now delegates directly to Workspace's hidden input, fixing the double-picker cycle that prevented users from opening saved `.hmatrix.json` projects (#1).

- **EEDP path count in reports** — `generateMatrixReport` now correctly populates the `eedpPaths` stat (was initialised as `0` by `computeStats` and never updated) (#2).

- **Calibration curve SVG** — The IntCal20 curve band in publication-quality calibration plots now renders as a proper continuous upper/lower band instead of disconnected vertical dashes (#3).

- **OxCal `Date()` fallback** — Non-standard rDate strings (e.g. "Late Bronze") are now emitted as `Item()` placeholders with an inline comment instead of being passed raw to OxCal's `Date()` function, fixing potential invalid script generation (#5).

- **Redundant `arrayBuffer` fetch** — `saveMedia` no longer calls `file.arrayBuffer()` twice in the Tauri code path (#6).

### Added

- **`UPDATE_OBSERVATION` action** — New `MatrixAction` type for modifying existing observations in-place (source, target, or relationship type) (#11).

- **Event CRUD actions** — `ADD_EVENT`, `UPDATE_EVENT`, and `DELETE_EVENT` action types and reducer handlers, enabling interactive management of radiocarbon dates and other events (#12).

### Changed

- **Calibration bounds naming** — `minCal`/`maxCal` renamed to `youngerBound`/`olderBound` with clarifying comment about the descending calBP sort order (#4).

- **Keychain salt hardened** — The IndexedDB web fallback for key storage now uses a random 16-byte salt for PBKDF2 (generated per-write and stored alongside the ciphertext) instead of a fixed salt (#18).

- **Semantic graph store cleanup** — `buildStore()` now attempts to close/clear any existing Oxigraph store before creating a new one, preventing abandoned store accumulation (#10).

- **Stronghold stub documented** — Tauri Stronghold integration points annotated with TODO(t130) referencing the upcoming v2 API stabilisation (#8).

- **FDE diagnostics stub documented** — `checkFullDiskEncryption()` annotated with TODO(t129); the native Rust command integration point is now clearly scoped (#7).

## [1.0.6] — 2026-06-12

### Fixed
- Fixed GitHub Pages deployment by adding enablement parameter to configure-pages action.

## [1.0.5] — 2026-06-12

### Fixed
- Fixed CI build failure preventing Tauri desktop installers from being released by syncing package-lock.json.


## [1.0.4] — 2026-06-07

### Added
- **Semantic Graph RAG (t032)** — New "RAG" toggle opens a SPARQL query panel. Builds an in-browser CIDOC-CRM triple store from HMDP data using Oxigraph WASM. Pre-built query templates (all contexts, relationships, phases, C14 dates), custom SPARQL editor, results table, Turtle export for LLM ingestion. No backend, no API key.

## [1.0.3] — 2026-06-06

### Added
- **Paleo-Coastline Mapping (t034)** — New "Paleo" toggle opens a panel with time slider (0-26 ka BP). Fetches ancient coastline data from GPlates Web Service, renders SVG preview map with site contexts and submergence status.

## [1.0.2] — 2026-06-06

### Added
- **Spatiotemporal Phasing (Timeline Mode)** — Toggle a vertical time axis that projects calibrated C14 dates onto the DAG. Each context's Y position is set from its median cal BP (IntCal20, in-browser). Left-edge SVG axis shows cal BP/BC/AD ticks with horizontal gridlines; phase-coloured bands provide chronological context. Exits cleanly without disturbing saved positions.

## [1.0.1] — 2026-06-06

### Fixed
- **noble-ed25519 v3 API compatibility** — Updated crypto layer to use `ed.hashes.sha512` instead of the deprecated `ed.etc.sha512Sync` (frozen in v3.1.0).
- **13 lint errors cleaned** — setState-in-effect refactored to derived state, missing error causes chained, unused vars/imports removed.
- **Documentation** — README, CHANGELOG, and AGENTS.md refreshed for v1.0.0 release state. User-specific paths removed from ecosystem table.

## [1.0.0] — 2026-06-06

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
- **Tauri v2 Desktop** — Native desktop builds for Linux (.deb), macOS (.dmg), Windows (.exe) with Rust backend and WebView frontend.
- **P2P Collaboration** — Real-time peer-to-peer sync over WebRTC with Yjs CRDTs. Cryptographic identity via Ed25519 signatures.
- **Local Network Discovery** — Auto-discovery of peers via mDNS (Tauri desktop).
- **Offline Storage** — IndexedDB-backed project persistence with service worker for offline web use.
- **GeoJSON Export** — Export contexts with spatial coordinates to standard GeoJSON (EPSG:4326/3857).
- **ArchesDB Export** — One-way export to CIDOC-CRM compliant JSON.
- **Legacy Import** — Support for importing classic `.LST` (ArchEd/BASP) files.
- **3D Model Integration** — Three.js photogrammetry model display on nodes.
- **Test Suite** — 16 test files (136 tests) covering all modules.
- **Release Pipeline** — CI/CD via GitHub Actions: cross-platform builds, PyPI trusted publishing for sync package.
- **Research Library** — Companion `docs/research-papers/` with 4 deep-research papers covering Harris Matrix conventions, user needs, and architectural synthesis.

### Ecosystem

- **HOARD** — Bidirectional integration: import Phase 1 outputs, export EEDP for AI.
- **Trowel** — Shared context data model; Trowel consumes StratiGraph EEDP outputs for deterministic report drafting.
- **Libby** — OxCal CQL export for Bayesian radiocarbon calibration.

[unreleased]: https://github.com/mabo-du/stratigraph/compare/v1.0.9...HEAD
[1.0.9]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.9
[1.0.8]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.8
[1.0.7]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.7
[1.0.6]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.6
[1.0.5]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.5
[1.0.4]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.4
[1.0.3]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.3
[1.0.2]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.2
[1.0.1]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.1
[1.0.0]: https://github.com/mabo-du/stratigraph/releases/tag/v1.0.0
