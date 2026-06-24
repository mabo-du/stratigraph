/**
 * fileUtils.ts — Save/load project JSON, export PNG/SVG, export GeoJSON.
 * exports: saveProject, loadProject, loadDemoProject, exportPNG, exportSVGFallback, exportPDF, exportGeoJSON
 */

import type { Core } from 'cytoscape';
import type { MatrixState } from '../models/matrixState';
import { jsPDF } from 'jspdf';
import { saveProjectOffline, updateProjectOffline } from './offlineStorage';
import proj4 from 'proj4';
import * as turf from '@turf/turf';

// Ensure Web Mercator is available by default alongside WGS84
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs");

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

/** Track the last offline project ID for overwrite-save. */
let lastOfflineId: string | null = null;

export async function saveProject(state: MatrixState) {
  // NOTE: roomId, roomKey, and syncServer are intentionally excluded from
  // exported project files — writing the collaboration encryption key into
  // the file would leak it to anyone the file is shared with.
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

  // Browser download
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const safeName = state.meta.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadBlob(blob, `${safeName}.hmatrix.json`);

  // Offline IndexedDB persistence (silent — best effort)
  try {
    if (lastOfflineId) {
      await updateProjectOffline(lastOfflineId, state.meta.projectName, state.meta.siteName, exportData);
    } else {
      lastOfflineId = await saveProjectOffline(state.meta.projectName, state.meta.siteName, exportData);
    }
  } catch {
    // IndexedDB may be unavailable — that's fine, file download succeeded
  }
}

/**
 * Load the built-in Roman Villa demo project.
 * Returns null if the demo file cannot be fetched.
 */
export async function loadDemoProject(): Promise<{ meta: MatrixState['meta']; contexts: any[]; observations: any[]; events: any[]; phases: any[]; positions: any } | null> {
  try {
    const resp = await fetch('/demo_roman_villa.hmatrix.json');
    if (!resp.ok) return null;
    const data = await resp.json();

    return {
      meta: {
        projectName: data.projectName ?? 'Roman Villa Excavation',
        siteName: data.siteName ?? '',
        excavationYear: data.excavationYear ?? '',
        notes: data.notes ?? '',
        roomId: undefined,
        roomKey: undefined,
        syncServer: undefined,
      },
      contexts: data.contexts ?? [],
      observations: data.observations ?? [],
      events: data.events ?? [],
      phases: data.phases ?? [],
      positions: data.positions ?? {},
    };
  } catch {
    return null;
  }
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
      // Collaboration keys are no longer restored from file exports —
      // they are stored in the keychain/IndexedDB vault instead.
      roomId: undefined,
      roomKey: undefined,
      syncServer: undefined,
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

// ── GeoJSON Export ───────────────────────────────────────────────────────────

export interface GeoJSONResult {
  json: string;
  featureCount: number;
  totalContexts: number;
  skippedContexts: number;
}

/**
 * Build a GeoJSON FeatureCollection from contexts with spatial geometries/centroids.
 * Handles CRS projections using proj4 and geometry manipulation with turf.js.
 */
export function buildGeoJSON(state: MatrixState, targetCrs: 'EPSG:4326' | 'EPSG:3857' = 'EPSG:4326'): GeoJSONResult {
  const features: any[] = [];
  let skipped = 0;

  for (const ctx of state.contexts) {
    if (!ctx.spatial || (!ctx.spatial.geoJSON && !ctx.spatial.centroid)) {
      skipped++;
      continue;
    }

    const sourceCrs = ctx.spatial.crs || 'EPSG:4326';

    // Start with the geometry we have
    let geometry = ctx.spatial.geoJSON;
    if (!geometry && ctx.spatial.centroid) {
      geometry = {
        type: 'Point',
        coordinates: [ctx.spatial.centroid.x, ctx.spatial.centroid.y, ctx.spatial.centroid.z ?? 0]
      };
    }

    if (!geometry) {
      skipped++;
      continue;
    }

    // We deep clone the geometry to avoid mutating the application state
    const clonedGeom = JSON.parse(JSON.stringify(geometry));
    const feature = turf.feature(clonedGeom as any, {
      id: ctx.id,
      type: ctx.type,
      description: ctx.description ?? '',
      period: ctx.period ?? '',
      phase: ctx.phase ?? '',
      originalCrs: sourceCrs
    });

    // If we need to reproject, use proj4 via turf's coordEach
    if (sourceCrs !== targetCrs) {
      try {
        const transform = proj4(sourceCrs, targetCrs);
        turf.coordEach(feature, (coord) => {
          // coordinate is [x, y, z?]
          const projected = transform.forward([coord[0], coord[1]]);
          coord[0] = projected[0];
          coord[1] = projected[1];
        });
      } catch (err) {
        console.warn(`Failed to project context ${ctx.id} from ${sourceCrs} to ${targetCrs}`, err);
        // Fallback: continue without throwing to process rest of features
      }
    }

    features.push(feature);
  }

  const collection = turf.featureCollection(features);

  // Attach metadata
  (collection as any).crs = {
    type: 'name',
    properties: { name: targetCrs === 'EPSG:4326' ? 'urn:ogc:def:crs:OGC:1.3:CRS84' : 'urn:ogc:def:crs:EPSG::3857' },
  };
  (collection as any).metadata = {
    projectName: state.meta.projectName,
    siteName: state.meta.siteName,
    generatedAt: new Date().toISOString(),
    totalContexts: state.contexts.length,
    georeferencedFeatures: features.length,
    skippedContexts: skipped,
  };

  return {
    json: JSON.stringify(collection, null, 2),
    featureCount: features.length,
    totalContexts: state.contexts.length,
    skippedContexts: skipped,
  };
}

/**
 * Export contexts with spatial metadata as a GeoJSON FeatureCollection.
 * Triggers a file download.
 */
export function exportGeoJSON(state: MatrixState, targetCrs: 'EPSG:4326' | 'EPSG:3857' = 'EPSG:4326'): string {
  const { json } = buildGeoJSON(state, targetCrs);
  const blob = new Blob([json], { type: 'application/geo+json' });
  const safeName = state.meta.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadBlob(blob, `${safeName}_contexts.geojson`);
  return json;
}
