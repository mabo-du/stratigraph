<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/layers.svg" width="80" height="80" alt="StratiGraph Logo">
  <h1>StratiGraph</h1>
  <p><strong>A Modern, AI-Ready Harris Matrix Generator & Digital Heritage Hub</strong></p>
</div>

---

<div align="center">
  <img src="assets/demo.webp" alt="StratiGraph UI Demo" width="800" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
</div>

StratiGraph is a premium, entirely browser-based tool designed for archaeologists to visually construct, validate, and export stratigraphic sequences (Harris Matrices). Unlike legacy software, StratiGraph seamlessly integrates modern data visualization with Bayesian geochronology, GIS interoperability, and Artificial Intelligence readiness.

## 🚀 Key Features

### 1. Robust DAG Topology Engine
Construct massive matrices with confidence. The underlying engine utilizes the **Dye & Buck (1987) algorithm** to automatically perform transitive reduction, ensuring that mathematically redundant physical relationships are pruned, resulting in perfectly valid, physically sound stratigraphic directed acyclic graphs (DAGs).

### 2. "The Holy Trinity" of Integrations
StratiGraph is designed to be the central hub of a modern digital heritage workflow, cleanly interoperating with powerful external systems:

*   **Libby (Bayesian Geochronology):** Upload your radiocarbon `events.csv`. StratiGraph will transitively reduce your matrix and automatically output a fully structured `OxCal CQL` script, perfectly embedding your prior radiocarbon phases with complex stratigraphic boundaries.
*   **HOARD (AI Synergy):** The engine flattens complex graph topologies into strict, linear sequential paths (EEDP extraction). This entirely eliminates "topological hallucinations," providing large language models (LLMs) with perfect chronological context for automated archaeological report generation.
*   **QGIS (Spatial Metadata):** The frictionless `.hmatrix.json` schema natively supports `SpatialMetadata` (X, Y, Z centroids and CRS). Import 3D coordinates via CSV, visualize them in the UI sidebar, and export them directly to your favorite GIS platform.

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
