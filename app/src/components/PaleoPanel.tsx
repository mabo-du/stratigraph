/**
 * PaleoPanel.tsx — Paleo-coastline time slider panel.
 * Fetches ancient coastline data from GPlates Web Service and renders
 * a self-contained SVG preview. Shows site contexts relative to sea level.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCoastline } from '../utils/paleoCoastline';
import type { Context } from '../models/hmdp';

interface PaleoPanelProps {
  open: boolean;
  onClose: () => void;
  contexts: Context[];
}

/** Plate carrée projection of [lng, lat] to SVG coordinates */
function project(
  lng: number, lat: number,
  centerLng: number, centerLat: number,
  scale: number
): [number, number] {
  const DEG_TO_RAD = Math.PI / 180;
  const x = (lng - centerLng) * DEG_TO_RAD * scale;
  const y = -(lat - centerLat) * DEG_TO_RAD * scale;
  return [x, y];
}

export const PaleoPanel: React.FC<PaleoPanelProps> = ({
  open, onClose, contexts,
}) => {
  const [timeKa, setTimeKa] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [coastline, setCoastline] = useState<GeoJSON.FeatureCollection | null>(null);
  const loading = coastline === null && error === null;

  // Compute projection center from context spatial centroids
  const center = useMemo(() => {
    const lngs: number[] = [];
    const lats: number[] = [];
    for (const ctx of contexts) {
      if (ctx.spatial?.centroid) {
        lngs.push(ctx.spatial.centroid.x);
        lats.push(ctx.spatial.centroid.y);
      }
    }
    if (lngs.length === 0) return { lng: 0, lat: 0 };
    return {
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
    };
  }, [contexts]);

  // Fetch coastline data when time changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Keep previous data visible while fetching (better UX)
    fetchCoastline(timeKa)
      .then(data => { if (!cancelled) setCoastline(data); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [open, timeKa]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeKa(parseInt(e.target.value, 10));
  }, []);

  // Build SVG paths from coastline data
  const svgPaths = useMemo(() => {
    if (!coastline) return null;
    const scale = 300;
    const margin = 80;
    const centerLng = center.lng;
    const centerLat = center.lat;

    // Collect all projected points to compute bounds
    const allPoints: [number, number][] = [];
    const paths: string[] = [];

    for (const feature of coastline.features) {
      if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0] as [number, number][];
        const projected = ring.map(([lng, lat]) => project(lng, lat, centerLng, centerLat, scale));
        allPoints.push(...projected);
        const d = projected.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join('') + 'Z';
        paths.push(d);
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (const poly of feature.geometry.coordinates) {
          const ring = poly[0] as [number, number][];
          const projected = ring.map(([lng, lat]) => project(lng, lat, centerLng, centerLat, scale));
          allPoints.push(...projected);
          const d = projected.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join('') + 'Z';
          paths.push(d);
        }
      }
    }

    if (allPoints.length === 0) return null;
    const xs = allPoints.map(p => p[0]);
    const ys = allPoints.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;

    // Normalize to SVG viewBox coordinates (240x180 with margin)
    const svgW = 240;
    const svgH = 180;
    const normScale = Math.min((svgW - margin * 2) / w, (svgH - margin * 2) / h);
    const offX = (svgW - w * normScale) / 2 - minX * normScale;
    const offY = (svgH - h * normScale) / 2 - minY * normScale;

    const normalizedPaths = paths.map(d => {
      const points = d.replace(/[MLZ]/g, '').trim().split(/\s+/).map(Number);
      const newD: string[] = [];
      let idx = 0;
      let cmd = 'M';
      while (idx < points.length) {
        const x = points[idx++] * normScale + offX;
        const y = points[idx++] * normScale + offY;
        newD.push(`${cmd}${x.toFixed(1)},${y.toFixed(1)}`);
        cmd = 'L';
      }
      return newD.join('') + 'Z';
    });

    return {
      paths: normalizedPaths,
      width: svgW,
      height: svgH,
    };
  }, [coastline, center]);

  // Check context positions relative to coastline
  const submergence = useMemo(() => {
    if (!coastline || contexts.length === 0) return null;
    // Simple check: contexts with z < ~120m below modern sea level
    // would have been submerged during LGM
    const submerged = contexts.filter(ctx => {
      const z = ctx.spatial?.centroid?.z;
      return z !== undefined && z < -timeKa * 4.6;
    });
    const above = contexts.length - submerged.length;
    const seaLevel = Math.round(timeKa * 4.6);
    return { submerged, above, seaLevel };
  }, [coastline, contexts, timeKa]);

  if (!open) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 60, right: 12,
      zIndex: 10,
      background: 'var(--surface)',
      border: '1px solid var(--border-2)',
      borderRadius: 'var(--radius)',
      padding: '10px 14px',
      width: 270,
      fontSize: '0.78rem',
      color: 'var(--text-1)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: '0.82rem' }}>Paleo-Coastline</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
      </div>

      {/* Time slider */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-3)' }}>
          <span>Present</span>
          <span style={{ fontWeight: 600 }}>{timeKa} ka BP</span>
          <span>LGM</span>
        </div>
        <input type="range" min={0} max={26} step={0.5} value={timeKa} onChange={handleSliderChange}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
      </div>

      {/* SVG mini-map */}
      {loading ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
          Loading coastline data...
        </div>
      ) : error ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c05c5c' }}>
          {error}
        </div>
      ) : svgPaths ? (
        <svg viewBox={`0 0 ${svgPaths.width} ${svgPaths.height}`}
          style={{ width: '100%', height: 180, background: 'var(--bg)', borderRadius: 4 }}>
          {/* Sea background */}
          <rect x="0" y="0" width={svgPaths.width} height={svgPaths.height} fill="rgba(74,158,175,0.15)" />
          {/* Land masses */}
          {svgPaths.paths.map((d, i) => (
            <path key={i} d={d} fill="rgba(74,158,111,0.3)" stroke="rgba(74,158,111,0.6)" strokeWidth="0.5" />
          ))}
          {/* Context markers */}
          {contexts.map(ctx => {
            if (!ctx.spatial?.centroid) return null;
            const [px, py] = project(
              ctx.spatial.centroid.x, ctx.spatial.centroid.y,
              center.lng, center.lat, 300
            );
            return (
              <circle key={ctx.id}
                cx={px + svgPaths.width / 2}
                cy={py + svgPaths.height / 2}
                r={3} fill="var(--accent)" stroke="#fff" strokeWidth="1"
              />
            );
          })}
        </svg>
      ) : (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
          No coastline data
        </div>
      )}

      {/* Status info */}
      {submergence && (
        <div style={{
          marginTop: 8, padding: '6px 8px', borderRadius: 4, fontSize: '0.72rem',
          background: submergence.submerged.length > 0 ? 'rgba(192,92,92,0.15)' : 'rgba(74,158,111,0.15)',
          color: submergence.submerged.length > 0 ? '#c05c5c' : '#4a9e6f',
        }}>
          {timeKa === 0 ? (
            'Modern coastline reference'
          ) : submergence.submerged.length > 0 ? (
            <>{submergence.submerged.length} context(s) submerged (~{submergence.seaLevel}m below present)</>
          ) : (
            <>All {submergence.above} context(s) above water level</>
          )}
        </div>
      )}

      <div style={{ marginTop: 4, fontSize: '0.62rem', color: 'var(--text-4)' }}>
        Data: GPlates Web Service (ZAHIROVIC2022)
      </div>
    </div>
  );
};
