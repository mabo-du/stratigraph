/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * fileUtils.ts — Save/load project JSON, export PNG/SVG.
 * exports: saveProject, loadProject, exportPNG, exportSVGFallback
 */

import type { Core } from 'cytoscape';
import type { MatrixState } from '../models/matrixState';
import { jsPDF } from 'jspdf';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function saveProject(state: MatrixState) {
  const exportData = {
    projectName: state.meta.projectName,
    siteName: state.meta.siteName,
    excavationYear: state.meta.excavationYear,
    notes: state.meta.notes,
    contexts: state.contexts,
    observations: state.observations,
    phases: state.phases,
    positions: state.positions,
    savedAt: new Date().toISOString(),
    version: '1.0',
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const safeName = state.meta.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadBlob(blob, `${safeName}.hmatrix.json`);
}

export async function loadProject(
  file: File
): Promise<{ meta: MatrixState['meta']; contexts: any[]; observations: any[]; events: any[]; phases: any[]; positions: any }> {
  const text = await file.text();
  const data = JSON.parse(text);

  return {
    meta: {
      projectName: data.projectName ?? 'Untitled Matrix',
      siteName: data.siteName ?? '',
      excavationYear: data.excavationYear ?? '',
      notes: data.notes ?? '',
    },
    contexts: data.contexts ?? [],
    observations: data.observations ?? [],
    events: data.events ?? [],
    phases: data.phases ?? [],
    positions: data.positions ?? {},
  };
}

export function exportPNG(cy: Core, projectName: string) {
  const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  // Cytoscape's .png() can return a string (data URL) or Blob depending on output option
  const result = cy.png({ output: 'blob', bg: '#0b0e11', full: true, scale: 2 });

  if (result instanceof Blob) {
    downloadBlob(result, `${safeName}_matrix.png`);
  } else {
    // Fallback: data URL string
    const a = document.createElement('a');
    a.href = result as unknown as string;
    a.download = `${safeName}_matrix.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Fallback SVG export for when cytoscape-svg plugin is not available.
 * Renders the graph at 2x scale as PNG and wraps it in an SVG.
 * For true vector SVG, run: npm install cytoscape-svg
 */
export function exportSVGFallback(cy: Core, projectName: string) {
  const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  // Get bounding box for dimensions
  const bb = cy.elements().boundingBox();
  const w = Math.ceil(bb.w) + 100;
  const h = Math.ceil(bb.h) + 100;

  // Get PNG data URL
  const dataUrl = cy.png({ output: 'base64uri', bg: '#0b0e11', full: true, scale: 1 });

  // Wrap in SVG as a raster image (still portable as SVG, just not scalable)
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#0b0e11"/>
  <image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}" />
  <text x="10" y="${h - 10}" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.3)">
    ${projectName} — Harris Matrix Generator
  </text>
</svg>`;

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  downloadBlob(blob, `${safeName}_matrix.svg`);
}

export function exportPDF(cy: Core, projectName: string) {
  // Generate a high-resolution PNG of the graph
  const png64 = cy.png({ full: true, scale: 2, bg: '#0b0e11' });
  
  // Create an A3 landscape PDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3'
  });

  // Add header
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text(projectName || 'Harris Matrix', 15, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 15, 26);

  // Layout calculations
  const margin = 15;
  const startY = 32;
  const maxWidth = 420 - (margin * 2);  // A3 width is 420mm
  const maxHeight = 297 - startY - margin; // A3 height is 297mm

  // cy.extent() gives us the width/height of the graph
  const extent = cy.extent();
  const graphRatio = extent.w / extent.h;
  const pageRatio = maxWidth / maxHeight;

  let finalWidth, finalHeight;
  if (graphRatio > pageRatio) {
    // Bound by width
    finalWidth = maxWidth;
    finalHeight = maxWidth / graphRatio;
  } else {
    // Bound by height
    finalHeight = maxHeight;
    finalWidth = maxHeight * graphRatio;
  }

  // Draw the image
  doc.addImage(png64, 'PNG', margin, startY, finalWidth, finalHeight);
  
  const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`${safeName}_matrix.pdf`);
}
