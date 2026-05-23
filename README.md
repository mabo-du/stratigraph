# Harris Matrix Generator

A free, open-source, browser-based tool for creating, editing, and exporting Harris Matrices — the directed acyclic graphs used in archaeology to represent the stratigraphic sequence of an excavation.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Status: MVP](https://img.shields.io/badge/Status-MVP-blue)
![Stack: React + Cytoscape.js](https://img.shields.io/badge/Stack-React%20%2B%20Cytoscape.js-61dafb)

---

## Why this exists

Every stratigraphic excavation produces a Harris Matrix. The available tools are either obsolete (BASP/Stratify, ArchEd), OS-restricted, or proprietary (Harris Matrix Composer). The archaeological community has been asking for a modern, free, drag-and-drop solution for years. This is that tool.

---

## Features (v0.1 MVP)

- **Add stratigraphic units manually** — SU identifier, type (positive/negative/unknown), phase assignment, and free-text description
- **Define relationships** — Above, Below, Equals, Contemporary with
- **Auto-layout** — Hierarchical Dagre/Sugiyama layout (newest contexts at top, oldest at bottom)
- **Manual repositioning** — Drag nodes freely; positions are saved
- **Undo / Redo** — Full command history (up to 50 steps), Ctrl+Z / Ctrl+Shift+Z
- **Cycle detection** — Flags impossible stratigraphic loops before they're saved
- **Transitive reduction** — Automatically removes redundant implied edges on import
- **Phase / period colouring** — Create named phases with custom colours; nodes colour accordingly
- **Import from CSV** — Two-step guided import: Contexts CSV (nodes) + Observations CSV (edges), with flexible column mapping
- **Export PNG** — Full-canvas 2× resolution raster export
- **Export SVG** — Vector export (requires `cytoscape-svg`; falls back to raster-in-SVG wrapper)
- **Save / Load project** — Portable `.hmatrix.json` format (human-readable, git-friendly)
- **Runs entirely in the browser** — No server, no installation, no account

---

## Getting started

### Prerequisites

- Node.js 18+ and npm

### Development

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for production

```bash
cd app
npm run build
```

Output is in `app/dist/`. The entire build is a static site — drop it anywhere (GitHub Pages, Netlify, a USB stick).

---

## Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React 19 + TypeScript | Mature, large ecosystem, excellent tooling |
| Build | Vite | Fast dev server, simple config |
| Graph rendering | Cytoscape.js | Mature, handles large DAGs, layout plugins |
| DAG layout | cytoscape-dagre (Sugiyama) | The standard hierarchical layout for Harris Matrices |
| CSV parsing | PapaParse | Robust handling of messy field data |
| Icons | Lucide React | Clean, consistent SVG icons |
| SVG export | cytoscape-svg | Optional plugin for true vector export |

---

## Project file format

Projects are saved as `.hmatrix.json` — a plain JSON file you can open in any text editor, commit to git, or share via email. Structure:

```json
{
  "projectName": "Excavation 2024",
  "siteName": "Site Name",
  "excavationYear": "2024",
  "notes": "...",
  "contexts": [...],
  "observations": [...],
  "phases": [...],
  "positions": { "SU001": { "x": 100, "y": 200 }, ... },
  "version": "1.0"
}
```

---

## CSV import format

The importer accepts any CSV structure via a guided column-mapping step. A minimal two-column observations CSV works fine:

```csv
su_above,su_below
SU001,SU002
SU001,SU003
SU002,SU004
```

A typical contexts CSV:

```csv
id,type,description
SU001,Positive,Dark silty loam with charcoal flecks
SU002,Negative,Cut for pit
SU003,Positive,Backfill of pit
```

---

## Repository structure

```
01. Harris-Matrix-Generator/
├── app/                    # The React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImportEngine/   # CSV import wizard
│   │   │   ├── MatrixCanvas/   # Cytoscape.js canvas
│   │   │   ├── Sidebar/        # SU list, node editor, phase panel
│   │   │   └── Toolbar/        # Top toolbar
│   │   ├── hooks/
│   │   │   └── useMatrixStore.ts   # Central state + undo/redo
│   │   ├── models/
│   │   │   ├── hmdp.ts             # Core data types (HMDP standard)
│   │   │   ├── graphLogic.ts       # Cycle detection, transitive reduction
│   │   │   └── matrixState.ts      # App state types and actions
│   │   └── utils/
│   │       ├── csvParser.ts        # PapaParse wrapper + field normalisation
│   │       ├── cytoscapeHelpers.ts # Element builder + Cytoscape styles
│   │       └── fileUtils.ts        # Save / load / export
│   └── package.json
└── docs/
    ├── scope.md            # Original project scope
    ├── PLANNING.md         # Roadmap and future development
    └── research-papers/    # Reference material
```

---

## Data model

The core data model follows the Frictionless Data Harris Matrix Data Package (HMDP) standard:

- **Context** (node) — `id`, `type` (Positive/Negative/Unknown), `description`, `phase`
- **Observation** (edge) — `source`, `target`, `relationshipType` (Above/Below/Equals/Contemporary)
- **Phase** — `id`, `name`, `color`

---

## Contributing

This is an open-source project aimed at the archaeological community. Contributions are welcome — particularly from field archaeologists who can identify real-world workflow gaps.

See `docs/PLANNING.md` for the development roadmap.

---

## License

MIT — see `LICENSE`.

---

## Acknowledgements

- Edward Harris, for the stratigraphic method and the original matrix conventions
- The Cytoscape.js team for an exceptional graph library
- The open-archaeo community for documenting the gap this tool aims to fill
