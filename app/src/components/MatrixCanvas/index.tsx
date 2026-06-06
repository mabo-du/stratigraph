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
import { loadMedia } from '../../utils/offlineMediaStorage';

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
  collapsedPhases: Set<string>;
  theme: 'dark' | 'light';
  publicationMode: boolean;
  publicationTemplate: PublicationTemplate;
  heatmapMode: boolean;
  timelineMode: boolean;
  timelinePositions: Record<string, LayoutPosition>;
  timelineAxis: { minDate: number; maxDate: number } | null;
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

    // Resolved local media URLs
    const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});

    useEffect(() => { onNodeSelectRef.current = props.onNodeSelect; });
    useEffect(() => { onPositionsChangeRef.current = props.onPositionsChange; });
    useEffect(() => { onLayoutCompleteRef.current = props.onLayoutComplete; });
    useEffect(() => { projectNameRef.current = props.projectName; });

    // ── Resolve Media Blobs ───────────────────────────────────────────────
    useEffect(() => {
      let active = true;
      const resolveUrls = async () => {
        const newUrls: Record<string, string> = {};
        let changed = false;
        for (const ctx of props.contexts) {
          if (ctx.mediaRefs && ctx.mediaRefs.length > 0) {
            const uuid = ctx.mediaRefs[0];
            // If already resolved, keep it, otherwise load
            if (!resolvedMediaUrls[ctx.id] || !resolvedMediaUrls[ctx.id].includes('blob:')) {
               const url = await loadMedia(uuid);
               if (url) {
                 newUrls[ctx.id] = url;
                 changed = true;
               }
            } else {
               newUrls[ctx.id] = resolvedMediaUrls[ctx.id];
            }
          }
        }
        if (active && changed) {
          setResolvedMediaUrls(newUrls);
        }
      };
      resolveUrls();
      return () => { active = false; };
    }, [props.contexts, props.dataVersion]);

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
            props.events,
            props.collapsedPhases,
            resolvedMediaUrls
          )
        );
        performance.mark('cy-add-end');
        performance.measure('Cytoscape Element Add', 'cy-add-start', 'cy-add-end');
      });

      if (props.contexts.length === 0) return;

      if (props.timelineMode && Object.keys(props.timelinePositions).length > 0) {
        if (hasPositions) {
          cy.nodes().forEach(n => {
            const savedPos = props.positions[n.id()];
            const tPos = props.timelinePositions[n.id()];
            if (savedPos && tPos) n.position({ x: savedPos.x, y: tPos.y });
            else if (savedPos) n.position(savedPos);
          });
          cy.fit(undefined, 50);
        } else {
          const layout = cy.layout(DAGRE_OPTIONS as any);
          layout.on('layoutstop', () => {
            for (const [id, tPos] of Object.entries(props.timelinePositions)) {
              const el = cy.getElementById(id);
              if (el.length) el.position({ x: el.position('x'), y: tPos.y });
            }
            cy.fit(undefined, 50);
          });
          layout.run();
        }
      } else if (hasPositions) {
        cy.nodes().forEach(n => {
          const pos = props.positions[n.id()];
          if (pos) n.position({ x: pos.x, y: pos.y });
        });
        cy.fit(undefined, 50);
      } else if (!props.publicationMode) {
        runLayout(cy, pos => onLayoutCompleteRef.current(pos));
      }
    }, [
      props.dataVersion,
      props.showPhaseGroups,
      props.heatmapMode,
      props.timelineMode,
      props.timelinePositions,
      props.events,
      resolvedMediaUrls,
    ]);

    // ── Sync node phase colours when phases, heatmap, or template changes ──
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.style(generateCytoscapeStyle(props.theme, props.publicationTemplate));
      
      const elements = buildCytoscapeElements(
        props.contexts, props.observations, props.phases, props.positions, props.showPhaseGroups, props.heatmapMode, props.events, props.collapsedPhases, resolvedMediaUrls
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

        {/* Timeline axis overlay */}
        {props.timelineMode && props.timelineAxis && (
          <svg
            style={{
              position: 'absolute', left: 0, top: 0, width: 52, height: '100%',
              zIndex: 3, pointerEvents: 'none', overflow: 'visible',
            }}
          >
            <rect x="0" y="0" width="52" height="100%" fill="var(--surface)" opacity="0.95" rx="0" />
            <line x1="50" y1="0" x2="50" y2="100%" stroke="var(--border-1)" strokeWidth="1" />
            {(function() {
              const { minDate, maxDate } = props.timelineAxis!;
              const range = maxDate - minDate || 1;
              const ticks = 5;
              const elements: React.JSX.Element[] = [];
              for (let i = 0; i <= ticks; i++) {
                const val = maxDate - (range * i / ticks);
                const y = Math.round(100 + (range - (val - minDate)) / range * 650);
                const label = val >= 1950 ? `${1950 - Math.round(val)} BC` : `${Math.round(val) - 1950} AD`;
                elements.push(
                  <g key={i}>
                    <line x1="44" y1={y} x2="56" y2={y} stroke="var(--text-3)" strokeWidth="1" />
                    <line x1="52" y1={y} x2="100%" y2={y} stroke="var(--border-1)" strokeWidth="0.5" opacity="0.3" />
                    <text x="42" y={y + 3} textAnchor="end" fill="var(--text-2)" fontSize="9" fontFamily="monospace">
                      {label}
                    </text>
                  </g>
                );
              }
              return elements;
            })()}
            <text x="8" y="14" fill="var(--text-3)" fontSize="9" fontFamily="sans-serif" fontWeight="600">
              cal BP
            </text>
          </svg>
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
