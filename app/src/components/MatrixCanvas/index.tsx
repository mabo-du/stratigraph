/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MatrixCanvas/index.tsx — Cytoscape.js graph canvas.
 * Renders the Harris Matrix as a directed acyclic graph (DAG).
 * Exposes: triggerAutoLayout(), exportPNG(), exportSVG(), fitView() via ref.
 */

import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import cytoscape from 'cytoscape';
// @ts-ignore — no official types for cytoscape-dagre
import dagre from 'cytoscape-dagre';
import type { Context, Observation, Phase, Event } from '../../models/hmdp';
import type { LayoutPosition } from '../../models/matrixState';
import type { PublicationTemplate } from '../../utils/cytoscapeHelpers';
import {
  buildCytoscapeElements,
  collectPositions,
  generateCytoscapeStyle,
} from '../../utils/cytoscapeHelpers';
import { exportPNG, exportSVGFallback, exportPDF } from '../../utils/fileUtils';

// Register extensions once (guard against double-registration in StrictMode)
try { cytoscape.use(dagre); } catch { /* already registered */ }

// Attempt to register cytoscape-svg if available
try {
  // @ts-ignore
  import('cytoscape-svg').then(mod => {
    try { cytoscape.use(mod.default ?? mod); } catch { /* already registered */ }
  }).catch(() => { /* plugin not installed */ });
} catch { /* ignore */ }

export interface MatrixCanvasHandle {
  triggerAutoLayout: () => void;
  exportPNG: () => void;
  exportSVG: () => void;
  exportPDF: () => void;
  fitView: () => void;
  focusNode: (id: string) => void;
}

interface MatrixCanvasProps {
  contexts: Context[];
  observations: Observation[];
  events?: Event[]; // Make sure Event is available
  phases: Phase[];
  positions: Record<string, LayoutPosition>;
  selectedContextId: string | null;
  projectName: string;
  showPhaseGroups: boolean;
  theme: 'dark' | 'light';
  publicationMode: boolean;
  publicationTemplate: PublicationTemplate;
  heatmapMode: boolean;
  dataVersion: number;
  onNodeSelect: (id: string | null) => void;
  onPositionsChange: (positions: Record<string, LayoutPosition>) => void;
  onLayoutComplete: (positions: Record<string, LayoutPosition>) => void;
}

const DAGRE_OPTIONS = {
  name: 'dagre',
  rankDir: 'TB',         // Top → Bottom (newest at top, oldest at bottom)
  rankSep: 80,
  nodeSep: 50,
  edgeSep: 20,
  padding: 50,
  animate: true,
  animationDuration: 450,
  animationEasing: 'ease-out-cubic',
};

export const MatrixCanvas = forwardRef<MatrixCanvasHandle, MatrixCanvasProps>(
  (props, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    
    // Tooltip state
    const [tooltip, setTooltip] = useState<{
      id: string;
      type: string;
      desc?: string;
      phaseColor?: string;
      x: number;
      y: number;
    } | null>(null);

    // Keep mutable refs to latest callbacks to avoid stale closures
    const onNodeSelectRef = useRef(props.onNodeSelect);
    const onPositionsChangeRef = useRef(props.onPositionsChange);
    const onLayoutCompleteRef = useRef(props.onLayoutComplete);
    const projectNameRef = useRef(props.projectName);

    useEffect(() => { onNodeSelectRef.current = props.onNodeSelect; });
    useEffect(() => { onPositionsChangeRef.current = props.onPositionsChange; });
    useEffect(() => { onLayoutCompleteRef.current = props.onLayoutComplete; });
    useEffect(() => { projectNameRef.current = props.projectName; });

    // ── Initialise Cytoscape once ──────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return;

      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        style: generateCytoscapeStyle(props.theme, props.publicationTemplate),
        wheelSensitivity: 0.25,
        minZoom: 0.05,
        maxZoom: 5,
        boxSelectionEnabled: false,
        userPanningEnabled: true,
        userZoomingEnabled: true,
      });

      cy.on('tap', 'node', evt => {
        onNodeSelectRef.current(evt.target.id());
      });

      cy.on('tap', evt => {
        if (evt.target === cy) onNodeSelectRef.current(null);
      });

      cy.on('dragfree', 'node', () => {
        onPositionsChangeRef.current(collectPositions(cy));
      });

      // Tooltip events
      cy.on('mouseover', 'node', evt => {
        const node = evt.target;
        const pos = node.renderedPosition();
        const data = node.data();
        setTooltip({
          id: data.id,
          type: data.type,
          desc: data.description,
          phaseColor: data.phaseColor,
          x: pos.x,
          y: pos.y,
        });
      });

      cy.on('mouseout', 'node', () => {
        setTooltip(null);
      });

      cy.on('pan zoom', () => {
        setTooltip(null);
      });

      cyRef.current = cy;
      return () => { cy.destroy(); cyRef.current = null; };
    }, []);

    // ── Sync elements when data changes ───────────────────────────────────
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;

      const hasPositions = Object.keys(props.positions).length > 0;

      cy.batch(() => {
        performance.mark('cy-add-start');
        cy.elements().remove();
        cy.add(
          buildCytoscapeElements(
            props.contexts,
            props.observations,
            props.phases,
            props.positions,
            props.showPhaseGroups,
            props.heatmapMode,
            props.events
          )
        );
        performance.mark('cy-add-end');
        performance.measure('Cytoscape Element Add', 'cy-add-start', 'cy-add-end');
      });

      if (props.contexts.length === 0) return;

      if (hasPositions) {
        // Restore saved positions
        cy.nodes().forEach(n => {
          const pos = props.positions[n.id()];
          if (pos) n.position({ x: pos.x, y: pos.y });
        });
        cy.fit(undefined, 50);
      } else if (!props.publicationMode) {
        // No positions yet — auto-layout (unless we are in publication mode)
        runLayout(cy, pos => onLayoutCompleteRef.current(pos));
      }
    }, [
      props.dataVersion,
      props.showPhaseGroups,
      props.heatmapMode,
      props.events,
      // positions deliberately NOT included here: they're applied above only on init
      // and updated separately via dragfree events
    ]);

    // ── Sync node phase colours when phases, heatmap, or template changes ──
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.style(generateCytoscapeStyle(props.theme, props.publicationTemplate));
      
      const elements = buildCytoscapeElements(
        props.contexts, props.observations, props.phases, props.positions, props.showPhaseGroups, props.heatmapMode, props.events
      );
      const nodeElements = elements.filter(el => !el.data?.source);
      nodeElements.forEach(el => {
        const node = cy.$(`#${CSS.escape(el.data!.id!)}`);
        if (node.length) {
          node.data('phaseColor', el.data!.phaseColor);
        }
      });
    }, [props.dataVersion, props.showPhaseGroups, props.theme, props.heatmapMode, props.events]);

    // ── Sync selection highlight ───────────────────────────────────────────
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.elements().unselect();
      if (props.selectedContextId) {
        cy.$(`#${CSS.escape(props.selectedContextId)}`).select();
      }
    }, [props.selectedContextId]);

    // ── Expose imperative handles ─────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      triggerAutoLayout: () => {
        const cy = cyRef.current;
        if (!cy) return;
        runLayout(cy, pos => onLayoutCompleteRef.current(pos));
      },
      exportPNG: () => {
        const cy = cyRef.current;
        if (cy) exportPNG(cy, projectNameRef.current);
      },
      exportSVG: () => {
        const cy = cyRef.current;
        if (!cy) return;
        // Try cytoscape-svg plugin first, fall back to PNG
        try {
          const svgStr = (cy as any).svg({ full: true, scale: 1, bg: '#0b0e11' });
          if (typeof svgStr === 'string') {
            const blob = new Blob([svgStr], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeName = projectNameRef.current.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.href = url;
            a.download = `${safeName}_matrix.svg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } else {
            throw new Error('SVG plugin not ready');
          }
        } catch {
          exportSVGFallback(cy, projectNameRef.current);
        }
      },
      exportPDF: () => {
        const cy = cyRef.current;
        if (cy) exportPDF(cy, projectNameRef.current);
      },
      fitView: () => {
        cyRef.current?.fit(undefined, 50);
      },
      focusNode: (id: string) => {
        const cy = cyRef.current;
        if (!cy) return;
        const node = cy.$(`#${CSS.escape(id)}`);
        if (node.length) {
          cy.animate({
            center: { eles: node },
            zoom: 1.5
          }, { duration: 300 });
        }
      },
    }));

    return (
      <div className={props.publicationMode ? "canvas-dot-grid" : ""} style={{ position: 'relative', flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Dot grid (now handled by CSS class in pub mode, but leaving this subtle overlay too if desired, actually we will disable this inline one if we use the CSS class) */}
        {!props.publicationMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {/* Cytoscape container */}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

        {/* Tooltip Overlay */}
        {tooltip && (
          <div 
            className="node-tooltip" 
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="tooltip-header">
              <span 
                className="unit-phase-dot" 
                style={{ backgroundColor: tooltip.phaseColor ?? '#2a3a4a' }} 
              />
              <span className="tooltip-id">{tooltip.id}</span>
              <span className="tooltip-badge">{tooltip.type}</span>
            </div>
            {tooltip.desc && <div className="tooltip-desc">{tooltip.desc}</div>}
          </div>
        )}

        {/* Empty-state message */}
        {props.contexts.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              pointerEvents: 'none',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 56, opacity: 0.08 }}>⛏</span>
            <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', opacity: 0.7 }}>
              Add stratigraphic units in the sidebar, or import from CSV
            </p>
          </div>
        )}

        {/* Legend */}
        {props.contexts.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              zIndex: 5,
              background: 'var(--surface)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--radius)',
              padding: '8px 12px',
              fontSize: '0.72rem',
              color: 'var(--text-2)',
              lineHeight: 1.8,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 20, height: 2, background: '#4a6a8a', borderRadius: 1 }} />
              Above / Below
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 20, height: 0, borderTop: '2px dashed #c8952a' }} />
              Equals
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 20, height: 0, borderTop: '2px dotted #4a9e6f' }} />
              Contemporary
            </div>
          </div>
        )}
      </div>
    );
  }
);

MatrixCanvas.displayName = 'MatrixCanvas';

// ── Layout runner ──────────────────────────────────────────────────────────

function runLayout(
  cy: cytoscape.Core,
  onComplete: (positions: Record<string, LayoutPosition>) => void
) {
  const layout = cy.layout(DAGRE_OPTIONS as any);
  layout.on('layoutstop', () => {
    onComplete(collectPositions(cy));
  });
  layout.run();
}
