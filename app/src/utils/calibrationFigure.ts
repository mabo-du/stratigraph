/**
 * calibrationFigure.ts — Publication-quality calibration plot SVG generation.
 *
 * Produces an SVG string suitable for publication, showing:
 * - Calibration curve (IntCal20) as a grey band
 * - Calibrated probability density as a filled polygon
 * - 1σ (68.2%) and 2σ (95.4%) HPD range indicators
 * - Axis labels, title, and metadata
 *
 * exports: generateCalibrationFigureSvg
 */

import type { CurvePoint } from './calibration';
import type { CalibratedResult } from './calibration';

const WIDTH = 600;
const HEIGHT = 360;
const MARGIN = { top: 40, right: 30, bottom: 50, left: 60 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export function generateCalibrationFigureSvg(
  title: string,
  labCode: string,
  c14BP: number,
  sigma: number,
  curve: CurvePoint[],
  result: CalibratedResult,
): string {
  // Determine visible range: 2σ span + padding
  const allCal = result.density.map(p => p.calBP);
  const calMin = Math.min(...allCal);
  const calMax = Math.max(...allCal);
  const padding = Math.round((calMax - calMin) * 0.15) || 50;
  const xMin = calMin - padding;
  const xMax = calMax + padding;

  // Clip curve to visible range
  const visCurve = curve.filter(p => p.calBP >= xMin && p.calBP <= xMax);

  // Y range: probability density
  const maxProb = Math.max(...result.density.map(p => p.prob));
  const yMax = maxProb * 1.15;

  // Scale functions
  const sx = (calBP: number) => MARGIN.left + PLOT_W * (1 - (calBP - xMin) / (xMax - xMin));
  const sy = (prob: number) => MARGIN.top + PLOT_H * (1 - prob / yMax);

  // Build SVG paths
  const curvePath = visCurve.map((p, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return `${cmd}${sx(p.calBP).toFixed(1)},${sy(0).toFixed(1)} L${sx(p.calBP).toFixed(1)},${sy(0.02).toFixed(1)}`;
  }).join(' ');

  // PDF polygon path
  const pdfPoints = result.density.map(p => `${sx(p.calBP).toFixed(1)},${sy(p.prob).toFixed(1)}`);
  const pdfPath = `M${pdfPoints[0]} L${pdfPoints.slice(1).join(' L')} L${sx(result.density[result.density.length - 1].calBP).toFixed(1)},${sy(0).toFixed(1)} Z`;

  // 2σ range markers
  const range2σPaths = result.range2σ.map(r => {
    const x1 = sx(r.to);
    const x2 = sx(r.from);
    return `<line x1="${x1.toFixed(1)}" y1="${MARGIN.top + PLOT_H + 6}" x2="${x2.toFixed(1)}" y2="${MARGIN.top + PLOT_H + 6}" stroke="#888" stroke-width="14" stroke-linecap="round" opacity="0.5"/>`;
  }).join('\n    ');

  const range1σPaths = result.range1σ.map(r => {
    const x1 = sx(r.to);
    const x2 = sx(r.from);
    return `<line x1="${x1.toFixed(1)}" y1="${MARGIN.top + PLOT_H + 6}" x2="${x2.toFixed(1)}" y2="${MARGIN.top + PLOT_H + 6}" stroke="#333" stroke-width="14" stroke-linecap="round"/>`;
  }).join('\n    ');

  // Axis ticks (every 50 or 100 years)
  const tickStep = (xMax - xMin) > 500 ? 100 : 50;
  const ticks: string[] = [];
  for (let t = Math.ceil(xMin / tickStep) * tickStep; t <= xMax; t += tickStep) {
    const x = sx(t);
    ticks.push(`<line x1="${x.toFixed(1)}" y1="${MARGIN.top + PLOT_H}" x2="${x.toFixed(1)}" y2="${MARGIN.top + PLOT_H + 6}" stroke="#666" stroke-width="1"/>`);
    ticks.push(`<text x="${x.toFixed(1)}" y="${MARGIN.top + PLOT_H + 20}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#444">${t}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    .bg { fill: #ffffff; }
    .title { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 14px; font-weight: bold; fill: #222; }
    .subtitle { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11px; fill: #666; }
    .axis-label { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; fill: #444; }
    .curve { fill: none; stroke: #999; stroke-width: 0.5; stroke-dasharray: 2,2; }
    .pdf-fill { fill: #4a7fa8; fill-opacity: 0.35; }
    .pdf-line { fill: none; stroke: #4a7fa8; stroke-width: 1.5; }
    .hpd-label { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; fill: #666; }
  </style>
  <rect class="bg" width="${WIDTH}" height="${HEIGHT}" rx="4"/>

  <!-- Title -->
  <text class="title" x="${MARGIN.left}" y="24">${escapeXml(title)}</text>
  <text class="subtitle" x="${MARGIN.left}" y="36">${escapeXml(labCode)} — ${c14BP} ± ${sigma} BP</text>

  <!-- Plot area -->
  <clipPath id="plot-clip">
    <rect x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_W}" height="${PLOT_H}"/>
  </clipPath>
  <g clip-path="url(#plot-clip)">
    <!-- Curve band -->
    ${curvePath}

    <!-- PDF fill -->
    <path class="pdf-fill" d="${pdfPath}"/>
    <path class="pdf-line" d="${pdfPath}"/>
  </g>

  <!-- Axes -->
  <line x1="${MARGIN.left}" y1="${MARGIN.top + PLOT_H}" x2="${MARGIN.left + PLOT_W}" y2="${MARGIN.top + PLOT_H}" stroke="#444" stroke-width="1"/>
  ${ticks.join('\n    ')}

  <text class="axis-label" x="${MARGIN.left + PLOT_W / 2}" y="${HEIGHT - 8}" text-anchor="middle">Calibrated date (cal BP)</text>

  <!-- HPD ranges -->
  <g transform="translate(0, 0)">
    ${range2σPaths}
    ${range1σPaths}
    <text class="hpd-label" x="${sx(result.range2σ[0]?.to ?? xMin).toFixed(1)}" y="${MARGIN.top + PLOT_H + 22}" text-anchor="start">95.4%</text>
    <text class="hpd-label" x="${sx(result.range1σ[0]?.to ?? xMin).toFixed(1)}" y="${MARGIN.top + PLOT_H + 36}" text-anchor="start">68.2%</text>
  </g>

  <!-- Median marker -->
  <line x1="${sx(result.median).toFixed(1)}" y1="${MARGIN.top}" x2="${sx(result.median).toFixed(1)}" y2="${MARGIN.top + PLOT_H}" stroke="#222" stroke-width="1" stroke-dasharray="4,3"/>
  <text class="hpd-label" x="${sx(result.median).toFixed(1)}" y="${MARGIN.top - 4}" text-anchor="middle">${result.median} BP</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
