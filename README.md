# StratiGraph
*(Formerly Harris Matrix Generator)*

StratiGraph is a modern, browser-based, open-source tool for generating topological Harris Matrices for archaeological stratigraphy. Built on React and Cytoscape.js, it supports large-scale datasets, Frictionless Data integration, and automatic Bayesian chronological mapping preparations.

## Features
- **$O(1)$ Performance at Scale:** Renders 3,000+ unit graphs without React bottlenecking.
- **Topological Layout:** Automatic Dagre-based graph layouts representing strict Directed Acyclic Graphs (DAGs).
- **Frictionless Import:** Drop in your `contexts.csv` and `observations.csv` (Above/Below relationships).
- **Phase Grouping:** Toggle visual bounding boxes for broad stratigraphic phases.
- **Offline First:** All data is processed locally in the browser. No server required.

## Quick Start
```bash
cd app
npm install
npm run dev
```

## Production Build
```bash
npm run build
```

## License
MIT
