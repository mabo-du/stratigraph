# PROJECT 3 — Automated Harris Matrix Generator
## Overview

A web-based and/or desktop tool for creating, editing, and exporting Harris Matrices — the directed acyclic graphs used in archaeology to represent the stratigraphic sequence of an excavation. Every stratigraphic excavation produces one. Current options are either obsolete (BASP/Stratify, ArchEd), OS-restricted, or proprietary (Harris Matrix Composer). The community explicitly wants a modern, free, drag-and-drop solution that exports to both publication-quality graphics and GIS-compatible formats.

## Target users

- Field archaeologists and site directors on excavations of all sizes
- Post-excavation supervisors synthesising stratigraphic records
- Students learning stratigraphic theory
- CRM archaeologists who must produce matrices for compliance reports
- Academic archaeologists integrating stratigraphic data with GIS analysis

## MVP scope (v1)

- Create stratigraphic unit (SU) nodes manually, with fields: SU number, type (layer, cut, fill, interface), brief description
- Define relationships between SUs: above, below, equals, contemporary with
- Auto-layout the DAG using a hierarchical layout algorithm (Sugiyama/dot layout)
- Manual drag-and-drop node repositioning
- Visual validation: flag cycles (impossible stratigraphic relationships) in red
- Import SU relationships from a CSV (two columns: SU_above, SU_below)
- Export to SVG, PNG, and PDF
- Colour-code nodes by period/phase (user-defined)
- Runs in the browser — no installation required (also package as desktop app)

## Feature roadmap (v2+)

- Import from common field databases (FileMaker, SQLite, CSV formats from ARK, ArchesDB)
- GIS export: attach coordinates to SUs, export as GeoJSON or GeoPackage for QGIS
- Phase grouping: visually group SUs into interpretive phases with coloured bounding boxes
- Link photographic and finds records to SU nodes (thumbnail previews in tooltips)
- Phased matrix view — collapse periods to simplify complex matrices
- Collaboration: real-time multi-user editing via WebSockets (CRDTs)
- Publication templates: formal Harris Matrix styling per traditional conventions
- Integration with Project 9 (Lightweight Field Database) — generate matrix live from field records

## Tech stack recommendation

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React (web-first, also Tauri wrapper for desktop) | Harris Matrix is fundamentally a web-compatible graph problem |
| Graph rendering | Cytoscape.js | Mature, handles large DAGs, excellent layout plugins |
| DAG layout | cytoscape-dagre (Dagre layout) | Implements Sugiyama hierarchical layout, widely used |
| File handling | File System Access API (browser) | Allows saving directly to disk from the browser |
| Export | svg-export + html2canvas fallback | SVG export preserves vector quality |
| CSV parsing | PapaParse | Robust, handles edge cases in field data |

## Architecture notes

- Model the matrix as a pure **directed graph data structure** (nodes + edges) separate from the visual representation. All validation (cycle detection, transitivity checks) runs on the graph model, not the DOM.
- **Cycle detection** via DFS on every relationship addition — highlight the offending edge in red immediately. Never allow a cycle to be saved silently.
- The **layout engine** should be re-runnable on demand. After manual repositioning, users can "re-auto-layout" to tidy up without losing phase colours or node data.
- Support **undo/redo** from day one using a command pattern (each action is a reversible operation stored in a stack).
- Store the project as a single **JSON file** containing nodes, edges, layout positions, phase definitions, and metadata. This is portable, human-readable, and git-friendly.
- Design **import parsing** as a separate, testable module. Accept multiple CSV column naming conventions (SU_above/SU_below, context_from/context_to, unit1/unit2, etc.) with a user-guided column mapping step.

## Core data model

```
Matrix
  id, site_name, excavation_year, created_at, notes

StratigraphicUnit (node)
  id, su_number, type (layer|cut|fill|interface|masonry|natural)
  description, period, phase, x_pos, y_pos, color

Relationship (edge)
  id, su_above_id, su_below_id
  type (above|equals|contemporary)

Phase
  id, name, color, su_ids[]
```

## Existing resources to leverage

- **Harris Matrix open-archaeo tag** — catalogue of every existing tool: https://open-archaeo.info/tags/harris-matrix/
- **Cytoscape.js** — graph library with DAG layout: https://cytoscape.org
- **Dagre layout algorithm** — the reference hierarchical layout
- **Python Harris matrix script by Stefano Costa** — existing academic implementation to reference: https://www.academia.edu/38546310
- **stratigraph R package** — another reference implementation
- **ArchEd** — last open-source desktop tool, study its data model

## Technical risks

- **Large matrices** — major urban excavations can have 3,000+ SUs. Cytoscape.js handles this but layout computation becomes slow. Test with 1,000+ nodes early and implement progressive rendering.
- **Relationship transitivity** — stratigraphic logic says if A is above B and B is above C, then A is above C. Avoid storing redundant transitive edges; compute them on-demand for validation only.
- **CSV import ambiguity** — real field data is messy. SU numbers may be strings, padded with zeros, or mixed with letters. Build a robust normalisation step.

---

## Deep Research Prompt — Project 3

> I am building a free, open-source Harris Matrix generator for archaeological stratigraphy. I need comprehensive technical and domain research covering:
>
> 1. **Harris Matrix conventions**: What are the official conventions for drawing Harris Matrices as defined by Edward Harris? What are the standard node shapes and relationship types (above, below, equals, contemporary with, bonded to)? Are there published style guides or formal diagramming standards?
>
> 2. **Existing software analysis**: Provide a detailed technical analysis of every existing Harris Matrix tool: Harris Matrix Composer, ArchEd, BASP Stratify, the Bonn software suite, stratigraph (R package), and any newer tools. For each: what OS does it run on, what file formats does it use, what are its key limitations, and is the source code available?
>
> 3. **Database export formats**: What CSV or database export formats do common archaeological field recording systems use for stratigraphic relationships? Cover: ARK (Archaeological Recording Kit), Intrasis, Heurist, ArchesDB, iDig, and FAIMS Mobile. What column names do they use for SU relationships?
>
> 4. **Graph layout algorithms**: What hierarchical DAG layout algorithms are used for automated graph drawing? Compare Sugiyama (layered), Coffman-Graham, and force-directed layouts for the specific case of Harris Matrices. What are the known aesthetic issues with auto-layout for stratigraphic graphs and how are they addressed?
>
> 5. **GIS integration**: How have researchers proposed integrating Harris Matrix data with GIS spatial data? What GeoJSON or GeoPackage schemas have been proposed for attaching geometric context data to stratigraphic units? Are there existing open-source implementations?
>
> 6. **Community requests**: Search open-archaeo.info, Reddit (r/Archaeology, r/AskArchaeology), and archaeology digital methods blogs for specific feature requests regarding Harris Matrix software. What do field archaeologists most want a modern tool to do?

---
---
