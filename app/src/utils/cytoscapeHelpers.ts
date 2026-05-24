/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * cytoscapeHelpers.ts — Build Cytoscape element arrays from app state.
 * exports: buildCytoscapeElements, CYTOSCAPE_STYLE
 * used_by: MatrixCanvas
 */

import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape';
import type { Context, Observation, Phase, Event } from '../models/hmdp';
import { RelationshipType } from '../models/hmdp';
import type { LayoutPosition } from '../models/matrixState';

export function buildCytoscapeElements(
  contexts: Context[],
  observations: Observation[],
  phases: Phase[],
  positions: Record<string, LayoutPosition>,
  showPhaseGroups: boolean = false,
  heatmapMode: boolean = false,
  events: Event[] = []
): ElementDefinition[] {
  const phaseMap = new Map(phases.map(p => [p.id, p]));
  const elements: ElementDefinition[] = [];

  // If grouping is enabled, create Phase parent nodes first
  if (showPhaseGroups) {
    const activePhases = new Set(contexts.filter(c => c.phase).map(c => c.phase!));
    for (const phase of phases) {
      if (activePhases.has(phase.id)) {
        elements.push({
          data: {
            id: phase.id,
            label: phase.name,
            phaseColor: phase.color,
          },
        });
      }
    }
  }

  // Nodes
  let maxEvents = 1;
  if (heatmapMode) {
    // Calculate max events to normalize color scale
    contexts.forEach(ctx => {
      const count = events.filter(e => String(e.contextId) === ctx.id).length;
      if (count > maxEvents) maxEvents = count;
    });
  }

  for (const ctx of contexts) {
    const phase = ctx.phase ? phaseMap.get(ctx.phase) : undefined;
    const parent = showPhaseGroups && phase ? phase.id : undefined;
    const pos = positions[ctx.id];

    let nodeColor = phase?.color ?? '#2a3a4a';
    
    // Heatmap Color scale (light yellow to deep red)
    if (heatmapMode) {
      const count = events.filter(e => String(e.contextId) === ctx.id).length;
      if (count === 0) {
        nodeColor = '#e0e0e0'; // Grey for no events
      } else {
        const ratio = count / maxEvents;
        // Simple RGB interpolation: Yellow (255, 235, 59) to Red (211, 47, 47)
        const r = Math.round(255 - ratio * (255 - 211));
        const g = Math.round(235 - ratio * (235 - 47));
        const b = Math.round(59 - ratio * (59 - 47));
        nodeColor = `rgb(${r},${g},${b})`;
      }
    }

    elements.push({
      data: {
        id: ctx.id,
        label: ctx.id,
        type: ctx.type,
        parent,
        description: ctx.description ?? '',
        phaseColor: nodeColor,
        phase: ctx.phase ?? '',
      },
      ...(pos ? { position: { x: pos.x, y: pos.y } } : {}),
    });
  }

  // Edges — only use Above relationships for the directed graph
  // Equals/Contemporary are rendered differently
  for (const obs of observations) {
    // Normalise direction: source is always the "above" (earlier in time = higher in matrix)
    let source = obs.source;
    let target = obs.target;

    if (obs.relationshipType === RelationshipType.Below) {
      source = obs.target;
      target = obs.source;
    }

    const edgeType =
      obs.relationshipType === RelationshipType.Equals ? 'equals'
      : obs.relationshipType === RelationshipType.Contemporary ? 'contemporary'
      : 'stratigraphic';

    elements.push({
      data: {
        id: obs.id,
        source,
        target,
        relationshipType: obs.relationshipType,
        edgeType,
      },
    });
  }

  return elements;
}

export function collectPositions(cy: Core): Record<string, LayoutPosition> {
  const positions: Record<string, LayoutPosition> = {};
  cy.nodes().forEach(n => {
    positions[n.id()] = { x: n.position('x'), y: n.position('y') };
  });
  return positions;
}

export function generateCytoscapeStyle(theme: 'dark'|'light'): StylesheetStyle[] {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#ffffff' : '#111111';
  const edgeColor = isDark ? '#4a6a8a' : '#5a7a9a';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';

  return [
    // ── Compound Nodes (Phases) ─────────────────────────────────────────────
    {
      selector: ':parent',
      style: {
        'background-color': 'data(phaseColor)' as any,
        'background-opacity': 0.08,
        'border-width': 2,
        'border-color': 'data(phaseColor)' as any,
        'border-style': 'dashed',
        'border-opacity': 0.8,
        'label': 'data(label)',
        'font-family': '"DM Sans", system-ui, sans-serif',
        'font-size': 16,
        'font-weight': 600 as any,
        'text-valign': 'top',
        'text-halign': 'center',
        'color': 'data(phaseColor)' as any,
        'padding': '15px' as any,
        'text-margin-y': -8 as any,
        'shape': 'roundrectangle' as any,
      }
    },
    // ── Default node ───────────────────────────────────────────────────────
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle' as any,
        'background-color': 'data(phaseColor)',
        'label': 'data(label)',
        'font-family': '"JetBrains Mono", "Fira Code", monospace',
        'font-size': 13,
        'font-weight': 600 as any,
        'text-valign': 'center',
        'text-halign': 'center',
        'color': textColor,
        'text-outline-color': 'data(phaseColor)',
        'text-outline-width': isDark ? 1 : 0,
        'width': 80,
        'height': 44,
        'border-width': 2,
        'border-color': borderColor,
        'border-opacity': 1,
      },
    },
    // Negative contexts (cuts/pits) — rectangular shape
    {
      selector: 'node[type="Negative"]',
      style: {
        'shape': 'rectangle',
        'border-style': 'dashed',
      },
    },
    // Unknown type
    {
      selector: 'node[type="Unknown"]',
      style: {
        'shape': 'diamond' as any,
      },
    },
    // Selected node
    {
      selector: 'node:selected',
      style: {
        'border-color': '#c8952a',
        'border-width': 3,
        'border-opacity': 1,
      },
    },
    // Hover
    {
      selector: 'node:active',
      style: {
        'overlay-opacity': 0.1,
      },
    },

    // ── Default edge ───────────────────────────────────────────────────────
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': edgeColor,
        'target-arrow-color': edgeColor,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.2,
        'curve-style': 'bezier',
        'opacity': 0.85,
      },
    },
    // Equals edges — dashed, no arrow
    {
      selector: 'edge[edgeType="equals"]',
      style: {
        'line-style': 'dashed',
        'line-color': '#c8952a',
        'target-arrow-shape': 'none',
        'mid-target-arrow-shape': 'none',
      },
    },
    // Contemporary edges — dotted, double-headed
    {
      selector: 'edge[edgeType="contemporary"]',
      style: {
        'line-style': 'dotted',
        'line-color': '#4a9e6f',
        'target-arrow-shape': 'none',
      },
    },
    // Selected edge
    {
      selector: 'edge:selected',
      style: {
        'line-color': '#c8952a',
        'target-arrow-color': '#c8952a',
        'width': 3,
      },
    },
  ];
}
