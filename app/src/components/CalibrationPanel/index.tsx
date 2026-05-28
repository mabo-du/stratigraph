import React, { useState, useEffect } from 'react';
import { FlaskConical, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { loadCurve, calibrateDate, calibrateSequence, computeAgreementIndex } from '../../utils/calibration';
import type { CalibratedResult, CurvePoint, ConstrainedResult } from '../../utils/calibration';
import { generateCalibrationFigureSvg } from '../../utils/calibrationFigure';
import type { Event, Observation } from '../../models/hmdp';
import { RelationshipType } from '../../models/hmdp';

interface CalibrationPanelProps {
  events: Event[];
  observations: Observation[];
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({ events, observations }) => {
  const [curve, setCurve] = useState<CurvePoint[] | null>(null);
  const [curveLoading, setCurveLoading] = useState(true);
  const [curveError, setCurveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState<Map<string, CalibratedResult | ConstrainedResult>>(new Map());
  const [calibrating, setCalibrating] = useState(false);
  const [showConstrained, setShowConstrained] = useState(true);
  const [hasConstraints] = useState(() =>
    observations.some(o =>
      o.relationshipType === RelationshipType.Above || o.relationshipType === RelationshipType.Below,
    ),
  );

  // Load curve on mount
  useEffect(() => {
    let cancelled = false;
    setCurveLoading(true);
    loadCurve()
      .then(c => { if (!cancelled) { setCurve(c); setCurveLoading(false); } })
      .catch(e => { if (!cancelled) { setCurveError(String(e)); setCurveLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Auto-calibrate all C14 events when curve is ready
  useEffect(() => {
    if (!curve || events.length === 0) return;
    setCalibrating(true);
    const newResults = new Map<string, CalibratedResult | ConstrainedResult>();

    // Build stratigraphic constraints from observations
    const directionalObs = observations.filter(
      o => o.relationshipType === RelationshipType.Above || o.relationshipType === RelationshipType.Below,
    );
    const constraints: { older: string; younger: string }[] = [];
    for (const obs of directionalObs) {
      if (obs.relationshipType === RelationshipType.Above) {
        constraints.push({ older: obs.target, younger: obs.source });
      } else {
        constraints.push({ older: obs.source, younger: obs.target });
      }
    }

    // Build event maps for sequence calibration
    const dateEvents = new Map<string, { c14BP: number; sigma: number; contextId: string }>();
    const contextEvents = new Map<string, string[]>();

    for (const event of events) {
      if (!event.rDate || event.type !== 'C14') continue;
      const parts = event.rDate.split(',').map(s => s.trim());
      if (parts.length !== 2) continue;
      const bp = parseInt(parts[0]);
      const sigma = parseInt(parts[1]);
      if (isNaN(bp) || isNaN(sigma)) continue;

      dateEvents.set(event.id, { c14BP: bp, sigma, contextId: String(event.contextId) });

      const ctxId = String(event.contextId);
      if (!contextEvents.has(ctxId)) contextEvents.set(ctxId, []);
      contextEvents.get(ctxId)!.push(event.id);
    }

    if (dateEvents.size === 0) { setCalibrating(false); return; }

    if (constraints.length > 0) {
      // Sequence calibration with constraints
      const seqResults = calibrateSequence(curve, dateEvents, constraints, contextEvents);
      for (const [id, r] of seqResults) newResults.set(id, r);
    }

    // Fallback: individual calibration for any events not in sequence results
    for (const [id, ev] of dateEvents) {
      if (!newResults.has(id)) {
        newResults.set(id, calibrateDate(curve, ev.c14BP, ev.sigma));
      }
    }

    setResults(newResults);
    setCalibrating(false);
  }, [curve, events, observations]);

  const c14Events = events.filter(e => e.type === 'C14' && e.rDate);

  const formatRange = (r: { from: number; to: number }) =>
    `${r.to}–${r.from} cal BP (${r.to > 1950 ? `${1950 - r.to} BC` : `${r.to - 1950} cal AD`} – ${r.from > 1950 ? `${1950 - r.from} BC` : `${r.from - 1950} cal AD`})`;

  const formatCalendar = (bp: number) =>
    bp > 1950 ? `${1950 - bp} BC` : `${bp - 1950} cal AD`;

  if (c14Events.length === 0) return null;

  return (
    <div className="sidebar-section">
      <div
        className="sidebar-header"
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FlaskConical size={14} style={{ color: '#5b9bd5' }} />
          <span className="sidebar-header-title">Radiocarbon</span>
          {c14Events.length > 0 && <span className="sidebar-count">{c14Events.length}</span>}
        </div>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {curveLoading && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>
              Loading calibration curve…
            </p>
          )}
          {curveError && (
            <p style={{ fontSize: '0.78rem', color: 'var(--error)', padding: 8 }}>
              Error: {curveError}
            </p>
          )}
          {calibrating && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>
              Calibrating…
            </p>
          )}

          {!curveLoading && !calibrating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Toggle for constrained mode */}
              {hasConstraints && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showConstrained}
                      onChange={() => setShowConstrained(v => !v)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    Apply stratigraphic constraints
                  </label>
                </div>
              )}

              {c14Events.map(event => {
                const result = results.get(event.id);

                if (!result) {
                  return (
                    <div key={event.id} style={{
                      padding: '6px 8px',
                      background: 'var(--surface-3)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                    }}>
                      <div><strong>{event.name}</strong> ({event.id})</div>
                      <div style={{ color: 'var(--text-3)', marginTop: 2 }}>{event.rDate} BP</div>
                    </div>
                  );
                }

                const rDateParts = (event.rDate || '').split(',').map(s => s.trim());
                const bp = parseInt(rDateParts[0]) || 0;
                const sig = parseInt(rDateParts[1]) || 0;

                return (
                  <CalibratedDateCard
                    key={event.id}
                    event={event}
                    result={result}
                    curve={curve}
                    c14BP={bp}
                    sigma={sig}
                    showConstrained={showConstrained}
                    formatCalendar={formatCalendar}
                    formatRange={formatRange}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sub-component: single calibrated date card ──────────────────────────────

interface CardProps {
  event: Event;
  result: CalibratedResult | ConstrainedResult;
  curve: CurvePoint[] | null;
  c14BP: number;
  sigma: number;
  showConstrained: boolean;
  formatCalendar: (bp: number) => string;
  formatRange: (r: { from: number; to: number }) => string;
}

const CalibratedDateCard: React.FC<CardProps> = ({ event, result, curve, c14BP, sigma, showConstrained, formatCalendar, formatRange }) => {
  const [showPlot, setShowPlot] = useState(false);

  // Use constrained or unconstrained density for plotting
  const isConstrained = 'constrained' in result && (result as ConstrainedResult).constrained && showConstrained;
  const displayResult = isConstrained ? (result as ConstrainedResult).unconstrained : result;

  // If showing constrained, use constrained data
  const activeResult = isConstrained ? result : displayResult;
  const constrainedInfo = 'constrained' in result ? (result as ConstrainedResult) : null;

  // Find max density for plot scaling
  const maxProb = Math.max(...activeResult.density.map(p => p.prob));

  return (
    <div style={{
      padding: '6px 8px',
      background: 'var(--surface-3)',
      borderRadius: 'var(--radius-sm)',
      fontSize: '0.78rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600 }}>{event.name}</div>
          <div style={{ color: 'var(--text-3)' }}>
            {event.rDate} BP · Median {formatCalendar(result.median)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {/* Export SVG button */}
          {curve && (
            <button
              className="icon-btn"
              onClick={() => {
                const svg = generateCalibrationFigureSvg(
                  event.name, event.id, c14BP, sigma, curve, activeResult,
                );
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${event.id.replace(/[^a-z0-9]/gi, '_')}_calibration.svg`;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              title="Export calibration figure (SVG)"
            >
              <Download size={11} />
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setShowPlot(v => !v)}
            title="Toggle calibration plot"
            style={{ fontSize: '0.7rem' }}
          >
            {showPlot ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Constrained badge with agreement index */}
      {constrainedInfo?.constrained && (() => {
        const agreement = computeAgreementIndex(constrainedInfo);
        const color = agreement >= 60 ? 'var(--success)' : agreement >= 30 ? '#d48b45' : 'var(--error)';
        return (
          <div style={{ fontSize: '0.68rem', color: '#5b9bd5', marginTop: 2, fontWeight: 500 }}>
            ⚙ Constrained — Agreement: <span style={{ color }}>{agreement}%</span>
            {' '}({constrainedInfo.constrainedByOlder.length} older + {constrainedInfo.constrainedByYounger.length} younger)
          </div>
        );
      })()}

      {/* 2σ range */}
      <div style={{ marginTop: 4, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500 }}>95.4%:</span>
        {activeResult.range2σ.map((r, i) => (
          <div key={i} style={{ paddingLeft: 12, fontSize: '0.72rem' }}>
            {formatRange(r)}
          </div>
        ))}
      </div>

      {/* 1σ range */}
      <div style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500 }}>68.2%:</span>
        {activeResult.range1σ.map((r, i) => (
          <div key={i} style={{ paddingLeft: 12, fontSize: '0.72rem' }}>
            {formatRange(r)}
          </div>
        ))}
      </div>

      {/* Mini PDF plot */}
      {showPlot && (
        <div style={{
          marginTop: 6,
          height: 48,
          position: 'relative',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}>
          {activeResult.density.map((p, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${((p.calBP - activeResult.density[activeResult.density.length - 1].calBP) / (activeResult.density[0].calBP - activeResult.density[activeResult.density.length - 1].calBP)) * 100}%`,
                width: `${100 / activeResult.density.length * 1.5}%`,
                height: `${(p.prob / maxProb) * 100}%`,
                background: constrainedInfo?.constrained && isConstrained ? '#5b9bd5' : 'var(--accent)',
                opacity: 0.7,
                minWidth: 1,
              }}
              title={`${p.calBP} cal BP: ${(p.prob * 100).toFixed(2)}%`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
