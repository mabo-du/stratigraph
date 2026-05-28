import { describe, it, expect } from 'vitest';
import { buildGeoJSON } from './fileUtils';
import type { MatrixState } from '../models/matrixState';
import { ContextType } from '../models/hmdp';

function makeState(overrides?: Partial<MatrixState>): MatrixState {
  return {
    meta: { projectName: 'Test Excavation', siteName: 'Site A', excavationYear: '2026', notes: '' },
    contexts: [],
    observations: [],
    events: [],
    phases: [],
    positions: {},
    selectedContextId: null,
    showImportModal: false,
    sidebarTab: 'units',
    dataVersion: 1,
    past: [],
    future: [],
    ...overrides,
  };
}

describe('GeoJSON Export', () => {
  it('exports a FeatureCollection with projected contexts', () => {
    const state = makeState({
      contexts: [
        { id: 'SU001', type: ContextType.Positive, spatial: { centroid: { x: 500.5, y: 1000.2, z: 12.4 } }, period: 'Roman' },
        { id: 'SU002', type: ContextType.Negative, spatial: { centroid: { x: 501.0, y: 1001.0 } }, period: 'Medieval' },
      ],
    });

    const result = buildGeoJSON(state);
    const parsed = JSON.parse(result.json);

    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features).toHaveLength(2);

    // Feature 1: SU001 with full 3D coordinates
    expect(parsed.features[0].geometry.type).toBe('Point');
    expect(parsed.features[0].geometry.coordinates).toEqual([500.5, 1000.2, 12.4]);
    expect(parsed.features[0].properties.id).toBe('SU001');
    expect(parsed.features[0].properties.type).toBe('Positive');

    // Feature 2: SU002 with z defaulting to 0
    expect(parsed.features[1].geometry.coordinates).toEqual([501.0, 1001.0, 0]);
    expect(parsed.features[1].properties.id).toBe('SU002');
  });

  it('skips contexts without spatial centroids', () => {
    const state = makeState({
      contexts: [
        { id: 'SU001', type: ContextType.Positive, spatial: { centroid: { x: 1, y: 2 } } },
        { id: 'SU002', type: ContextType.Positive },  // no spatial
        { id: 'SU003', type: ContextType.Positive, description: 'no coords' },  // no spatial
      ],
    });

    const result = buildGeoJSON(state);
    const parsed = JSON.parse(result.json);

    expect(parsed.features).toHaveLength(1);
    expect(result.totalContexts).toBe(3);
    expect(result.featureCount).toBe(1);
    expect(result.skippedContexts).toBe(2);
  });

  it('includes project metadata in the output', () => {
    const state = makeState({
      contexts: [
        { id: 'A', type: ContextType.Positive, spatial: { centroid: { x: 0, y: 0 } } },
      ],
    });

    const result = buildGeoJSON(state);
    const parsed = JSON.parse(result.json);

    expect(parsed.metadata.projectName).toBe('Test Excavation');
    expect(parsed.metadata.generatedAt).toBeDefined();
    expect(parsed.crs.type).toBe('name');
  });

  it('handles empty context list gracefully', () => {
    const state = makeState();
    const result = buildGeoJSON(state);
    const parsed = JSON.parse(result.json);

    expect(parsed.features).toHaveLength(0);
    expect(result.totalContexts).toBe(0);
  });

  it('handles contexts with partial spatial data (no centroid)', () => {
    const state = makeState({
      contexts: [
        { id: 'B', type: ContextType.Positive, spatial: { crs: 'EPSG:4326' } }, // has spatial but no centroid
      ],
    });

    const result = buildGeoJSON(state);
    const parsed = JSON.parse(result.json);

    expect(parsed.features).toHaveLength(0);
    expect(result.skippedContexts).toBe(1);
  });
});
