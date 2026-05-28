<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/layers.svg" width="80" height="80" alt="StratiGraph Logo">
  <h1>StratiGraph</h1>
  <p><strong>A Modern, AI-Ready Harris Matrix Generator & Digital Heritage Hub</strong></p>
  <p>
    <img src="https://img.shields.io/badge/status-v1%20MVP%20substantially%20complete-4a9e6f" alt="Status">
    <img src="https://img.shields.io/badge/license-MIT-2a3a4a" alt="License">
    <img src="https://img.shields.io/badge/TypeScript-React-3178c6" alt="TypeScript React">
    <img src="https://img.shields.io/badge/tests-6%20suites%20all%20passing-4a9e6f" alt="Tests">
  </p>
</div>

---

<div align="center">
  <img src="assets/demo.webp" alt="StratiGraph UI Demo" width="800" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
</div>

StratiGraph is a premium, entirely browser-based tool designed for archaeologists to visually construct, validate, and export stratigraphic sequences (Harris Matrices) — the directed acyclic graphs used in every stratigraphic excavation. Unlike legacy software, StratiGraph seamlessly integrates modern data visualization with Bayesian geochronology, GIS interoperability, and Artificial Intelligence readiness.

**Current status:** v1 MVP substantially complete — core DAG engine, HOARD AI import/export, Libby/OxCal Bayesian export, CSV import with column mapping, full UI with dark/light mode, undo/redo, and exports to PNG/SVG/PDF. See [AGENTS.md](AGENTS.md) for architecture and quick start.

## 🚀 Key Features

### 1. Robust DAG Topology Engine
Construct massive matrices with confidence. The underlying engine utilizes the **Dye & Buck (1987) algorithm** to automatically perform transitive reduction, ensuring that mathematically redundant physical relationships are pruned, resulting in perfectly valid, physically sound stratigraphic directed acyclic graphs (DAGs).

### 2. Digital Heritage Ecosystem Integration
StratiGraph is the central hub of a comprehensive open-source digital heritage workflow, cleanly interoperating with every phase of the post-excavation pipeline:

| Project | Repository | Role | StratiGraph Integration |
|---------|-----------|------|------------------------|
| **HOARD** | `~/Projects/HOARD` | AI context-sheet digitisation (Phases 0-5) | **Import:** Directly loads Phase 1 `ctx_sheet_*.json` via shared `schemas/context-sheet-v1.json` contract. **Export:** Produces EEDP path files for hallucination-free AI report generation. |
| **Trowel** | `~/Projects/trowel` | Compliance report drafting from field data | **Bi-directional:** Shares context data model. Trowel consumes StratiGraph's EEDP exports for deterministic stratigraphic narrative generation. Both share `cuts`/`fills`/`same_as` relationship fields. |
| **Libby** | `~/Projects/Libby` | Bayesian radiocarbon calibration | **Export:** Upload `events.csv`, get a fully structured `OxCal CQL` script with transitively reduced stratigraphic constraints for MCMC modelling. |
| **Paleo** | `~/Projects/Paleo` | Palaeontology AI platform | **Research:** Paleo-coastline data research conducted for palaeoenvironmental reconstruction integration (see `docs/research-papers/`). |
| **Dibble** | `~/Projects/dibble` | Lithic analysis | **Ecosystem:** Shares the broader vision of connected digital heritage tools. |

### 3. Premium UI & Data Visualization

### 3. Premium UI & Data Visualization
Academics deserve nice things. StratiGraph features a highly polished user experience:
*   **WYSIWYG Publication Mode:** Disable the auto-layout grid and freely drag, nudge, and lock nodes into pixel-perfect alignment for your final PDF publication.
*   **Finds Density Heatmap:** Instantly switch the graph from sequence mode to heatmap mode. The matrix dynamically recolors itself based on the density of events/finds associated with each context.
*   **Late-Night Dark Mode:** A seamlessly integrated Dark Mode that cascades beautifully into the Cytoscape canvas itself.
*   **Frictionless CSV Imports:** Upload standard `contexts.csv` and `relationships.csv` files with a robust, visual column mapper.

## 📦 Data Schema (HMDP)

StratiGraph is built upon the open-source **Harris Matrix Data Package (HMDP)** schema, ensuring your data remains entirely interoperable and future-proof.

```json
{
  "version": "1.0",
  "meta": { "projectName": "Roman Villa", "crs": "EPSG:4326" },
  "contexts": [
    { 
      "id": "SU001", 
      "type": "Positive", 
      "phase": "P1",
      "spatial": { "centroid": { "x": 500.5, "y": 1000.2, "z": 12.4 } }
    }
  ],
  "observations": [
    { "id": "rel1", "source": "SU001", "target": "SU002", "relationshipType": "Above" }
  ]
}
```

## 🛠️ Tech Stack
*   **React + TypeScript**
*   **Vite** (Lightning-fast client-side builds)
*   **Cytoscape.js & Dagre** (Graph rendering and layouting)
*   **Frictionless Data** (Standardised CSV parsing and schema validation)

## 💻 Running Locally

StratiGraph requires absolutely no backend infrastructure. It runs entirely within your browser for maximum security and data privacy.

```bash
git clone https://github.com/strati-graph/stratigraph.git
cd stratigraph/app
npm install
npm run dev
```

Navigate to `http://localhost:5173` to start building your matrix.

### Importing from HOARD

1. **Run HOARD Phase 1** to digitise your context sheets → `ctx_sheet_*.json` files
2. In StratiGraph, click **Import** → select the **HOARD JSON Import** tab
3. Multi-select all JSON files (hold Shift or Ctrl)
4. Review the summary and click **Generate Harris Matrix**
5. Stratigraphic edges are auto-inferred from relationship fields; stub contexts created for cross-references

### Exporting to Trowel (Report Drafting)

1. Click **Export** → **HOARD Payload (.json)** to generate EEDP linearised paths
2. Open **Trowel** → import the EEDP JSON file
3. Trowel generates a deterministic stratigraphic narrative — no topological hallucinations

### Exporting to Libby (Bayesian Modelling)

1. Import or create contexts with radiocarbon events (via CSV Events tab or manual entry)
2. Click **Export** → **Export for Libby (.oxcal)**
3. The generated CQL script includes transitively reduced constraints and can be loaded into OxCal or Libby

## 📚 Research Library

The companion research repository at `~/Projects/Digital-Heritage-Research/` contains **160 deep-research papers, 388 reusable prompts, and 58 project scopes** covering the full digital heritage ecosystem:

| Directory | Contents |
|-----------|----------|
| `research-papers/` | Technical deep-dives on every component — Harris Matrix conventions, Bayesian modelling, field system schemas, graph layout algorithms, GIS integration |
| `research-prompts/` | Copy-paste prompts for development, research, and architecture design |
| `project-scopes/` | Full implementation plans for StratiGraph, HOARD, Libby, Paleo, Trowel, and 20+ other projects |

StratiGraph-specific papers:
- `Harris Matrix Generator Research Scope.md` — Comprehensive 100+ citation technical deep-dive
- `ChatGPT-research-report.md` — User pain points and feature requests from practitioner surveys
- `Digital Archaeology Research Expansion.md` — "Holy Trinity" architectural synthesis
- `Stratigraph Paleo Coastline Data Research.md` — Linked palaeoenvironmental research
