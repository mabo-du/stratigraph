import React, { useState, useEffect } from 'react';
import { FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { loadCurve, calibrateDate } from '../../utils/calibration';
import type { CalibratedResult, CurvePoint } from '../../utils/calibration';
import type { Event } from '../../models/hmdp';

interface CalibrationPanelProps {
  events: Event[];
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({ events }) => {
  const [curve, setCurve] = useState<CurvePoint[] | null>(null);
  const [curveLoading, setCurveLoading] = useState(true);
  const [curveError, setCurveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState<Map<string, CalibratedResult>>(new Map());
  const [calibrating, setCalibrating] = useState(false);

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
    const newResults = new Map<string, CalibratedResult>();

    for (const event of events) {
      if (!event.rDate || event.type !== 'C14') continue;
      const parts = event.rDate.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const bp = parseInt(parts[0]);
        const sigma = parseInt(parts[1]);
        if (!isNaN(bp) && !isNaN(sigma)) {
          newResults.set(event.id, calibrateDate(curve, bp, sigma));
        }
      }
    }

    setResults(newResults);
    setCalibrating(false);
  }, [curve, events]);

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

                return (
                  <CalibratedDateCard
                    key={event.id}
                    event={event}
                    result={result}
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
  result: CalibratedResult;
  formatCalendar: (bp: number) => string;
  formatRange: (r: { from: number; to: number }) => string;
}

const CalibratedDateCard: React.FC<CardProps> = ({ event, result, formatCalendar, formatRange }) => {
  const [showPlot, setShowPlot] = useState(false);

  // Find max density for plot scaling
  const maxProb = Math.max(...result.density.map(p => p.prob));

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
        <button
          className="icon-btn"
          onClick={() => setShowPlot(v => !v)}
          title="Toggle calibration plot"
          style={{ fontSize: '0.7rem' }}
        >
          {showPlot ? '▲' : '▼'}
        </button>
      </div>

      {/* 2σ range */}
      <div style={{ marginTop: 4, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500 }}>95.4%:</span>
        {result.range2σ.map((r, i) => (
          <div key={i} style={{ paddingLeft: 12, fontSize: '0.72rem' }}>
            {formatRange(r)}
          </div>
        ))}
      </div>

      {/* 1σ range */}
      <div style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500 }}>68.2%:</span>
        {result.range1σ.map((r, i) => (
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
          {result.density.map((p, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${((p.calBP - result.density[result.density.length - 1].calBP) / (result.density[0].calBP - result.density[result.density.length - 1].calBP)) * 100}%`,
                width: `${100 / result.density.length * 1.5}%`,
                height: `${(p.prob / maxProb) * 100}%`,
                background: 'var(--accent)',
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
