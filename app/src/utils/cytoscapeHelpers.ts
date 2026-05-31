/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * cytoscapeHelpers.ts — Build Cytoscape element arrays from app state.
 * exports: buildCytoscapeElements, generateCytoscapeStyle, PublicationTemplate
 * used_by: MatrixCanvas
 */

import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape';
import type { Context, Observation, Phase, Event } from '../models/hmdp';
import { RelationshipType } from '../models/hmdp';
import type { LayoutPosition } from '../models/matrixState';

/**
 * Publication template presets for Harris Matrix styling.
 * - standard:  Current default (dark/light theme, rounded rects, bezier)
 * - traditional: Harris Matrix conventions (rect = positive, oval = negative, orthogonal)
 * - minimal:    Black & white, grayscale-optimized, no phase color fills
 */
export type PublicationTemplate = 'standard' | 'traditional' | 'minimal';

export function buildCytoscapeElements(
  contexts: Context[],
  observations: Observation[],
  phases: Phase[],
  positions: Record<string, LayoutPosition>,
  showPhaseGroups: boolean = false,
  heatmapMode: boolean = false,
  events: Event[] = [],
  collapsedPhases: Set<string> = new Set(),
): ElementDefinition[] {
  const phaseMap = new Map(phases.map(p => [p.id, p]));
  const elements: ElementDefinition[] = [];

  // Build a set of collapsed phase IDs for fast lookup
  const isCollapsed = (phaseId: string) => showPhaseGroups && collapsedPhases.has(phaseId);

  // If grouping is enabled, create Phase parent nodes first
  if (showPhaseGroups) {
    const activePhases = new Set(contexts.filter(c => c.phase).map(c => c.phase!));
    for (const phase of phases) {
      if (activePhases.has(phase.id)) {
        const count = contexts.filter(c => c.phase === phase.id).length;
        const collapsed = collapsedPhases.has(phase.id);
        elements.push({
          data: {
            id: phase.id,
            label: collapsed ? `${phase.name} (${count})` : phase.name,
            phaseColor: phase.color,
            collapsedCount: collapsed ? count : undefined,
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
    // Skip individual nodes inside collapsed phases
    if (phase && isCollapsed(phase.id)) continue;

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
        photoUrl: ctx.photoUrl,
      },
      ...(pos ? { position: { x: pos.x, y: pos.y } } : {}),
    });
  }

  // Build a lookup for context → phase
  const ctxPhaseMap = new Map(contexts.filter(c => c.phase).map(c => [c.id, c.phase!]));

  // Edges — only use Above relationships for the directed graph
  // Equals/Contemporary are rendered differently
  for (const obs of observations) {
    // Skip edges where either endpoint is in a collapsed phase
    const srcPhase = ctxPhaseMap.get(obs.source);
    const tgtPhase = ctxPhaseMap.get(obs.target);
    if ((srcPhase && isCollapsed(srcPhase)) || (tgtPhase && isCollapsed(tgtPhase))) continue;
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

export function generateCytoscapeStyle(
  theme: 'dark'|'light',
  publicationTemplate: PublicationTemplate = 'standard',
): StylesheetStyle[] {
  const isDark = theme === 'dark';
  const isTraditional = publicationTemplate === 'traditional';
  const isMinimal = publicationTemplate === 'minimal';

  // Color palette varies by template
  const textColor = isMinimal ? '#000000' : isDark ? '#ffffff' : '#111111';
  const edgeColor = isMinimal ? '#333333' : isDark ? '#4a6a8a' : '#5a7a9a';
  const borderColor = isMinimal ? '#000000' : isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
  const nodeBg = isMinimal ? '#ffffff' : 'data(phaseColor)';
  const nodeBorderWidth = isMinimal ? 1.5 : 2;
  const defaultShape = isTraditional ? 'round-rectangle' as any : 'round-rectangle' as any;

  // Traditional: serif font for labels, monospace for IDs
  const nodeFontFamily = isTraditional
    ? '"Noto Serif Display", "DM Serif Display", Georgia, serif'
    : '"JetBrains Mono", "Fira Code", monospace';
  const nodeFontSize = isTraditional ? 11 : 13;
  const edgeCurveStyle = isTraditional ? 'straight' as any : 'bezier' as any;
  // Straight edges for publication; bezier for standard interactive use

  return [
    // ── Compound Nodes (Phases) ─────────────────────────────────────────────
    {
      selector: ':parent',
      style: {
        'background-color': isMinimal ? '#f5f5f5' as any : 'data(phaseColor)' as any,
        'background-opacity': isMinimal ? 0.5 : (isTraditional ? 0.04 : 0.08),
        'border-width': isTraditional ? 1 : 2,
        'border-color': 'data(phaseColor)' as any,
        'border-style': isTraditional ? 'solid' : 'dashed',
        'border-opacity': isTraditional ? 0.5 : 0.8,
        'label': 'data(label)',
        'font-family': isTraditional ? '"Noto Serif Display", Georgia, serif' : '"DM Sans", system-ui, sans-serif',
        'font-size': isTraditional ? 14 : 16,
        'font-weight': 600 as any,
        'text-valign': 'top',
        'text-halign': 'center',
        'color': 'data(phaseColor)' as any,
        'padding': '12px' as any,
        'text-margin-y': -8 as any,
        'shape': 'roundrectangle' as any,
      }
    },
    // ── Default node ───────────────────────────────────────────────────────
    {
      selector: 'node',
      style: {
        'shape': defaultShape,
        'background-color': nodeBg,
        'label': 'data(label)',
        'font-family': nodeFontFamily,
        'font-size': nodeFontSize,
        'font-weight': isMinimal ? 400 : 600 as any,
        'text-valign': 'center',
        'text-halign': 'center',
        'color': textColor,
        'text-outline-color': 'data(phaseColor)',
        'text-outline-width': isDark && !isMinimal ? 1 : 0,
        'width': isTraditional ? 70 : 80,
        'height': isTraditional ? 38 : 44,
        'border-width': nodeBorderWidth,
        'border-color': borderColor,
        'border-opacity': 1,
      },
    },
    // Nodes with photos
    {
      selector: 'node[photoUrl]',
      style: {
        'background-image': 'data(photoUrl)' as any,
        'background-fit': 'cover',
        'background-opacity': 0.85,
        'background-clip': 'node',
      },
    },
    // Negative contexts (cuts/pits) — oval in traditional, rectangle in standard
    {
      selector: 'node[type="Negative"]',
      style: {
        'shape': isTraditional ? 'ellipse' as any : 'rectangle' as any,
        'border-style': isTraditional ? 'solid' : 'dashed',
        'border-color': isTraditional ? '#000000' : borderColor,
        'background-color': isTraditional ? 'transparent' : nodeBg,
      },
    },
    // Unknown type — ellipse in traditional, diamond in standard
    {
      selector: 'node[type="Unknown"]',
      style: {
        'shape': isTraditional ? 'ellipse' as any : 'diamond' as any,
        'background-color': isMinimal ? '#f5f5f5' : nodeBg,
      },
    },
    // Selected node
    {
      selector: 'node:selected',
      style: {
        'border-color': isMinimal ? '#000000' : '#c8952a',
        'border-width': isMinimal ? 2.5 : 3,
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
        'width': isMinimal ? 1 : 2,
        'line-color': edgeColor,
        'target-arrow-color': edgeColor,
        'target-arrow-shape': isTraditional ? 'triangle-backcurve' as any : 'triangle',
        'arrow-scale': isTraditional ? 0.8 : 1.2,
        'curve-style': edgeCurveStyle,
        'opacity': isMinimal ? 0.7 : 0.85,
        // For traditional: add a small gap at the target for cleaner appearance
        'target-distance-from-node': isTraditional ? 2 : 0,
      },
    },
    // Equals edges — dashed, no arrow
    {
      selector: 'edge[edgeType="equals"]',
      style: {
        'line-style': 'dashed',
        'line-color': isMinimal ? '#666666' : '#c8952a',
        'target-arrow-shape': 'none',
        'mid-target-arrow-shape': 'none',
      },
    },
    // Contemporary edges — dotted, no arrow
    {
      selector: 'edge[edgeType="contemporary"]',
      style: {
        'line-style': 'dotted',
        'line-color': isMinimal ? '#888888' : '#4a9e6f',
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
