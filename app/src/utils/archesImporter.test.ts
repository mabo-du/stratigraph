import { describe, it, expect } from 'vitest';
import { parseArchesJson } from './archesImporter';
import { ContextType, RelationshipType } from '../models/hmdp';

describe('ArchesDB / CIDOC-CRM Import', () => {
  it('parses A8 Stratigraphic Unit resources', () => {
    const input = JSON.stringify([
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'SU001',
        description: 'Topsoil layer',
        period: 'Modern',
      },
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'SU002',
        description: 'Pit cut',
        period: 'Roman',
      },
    ]);

    const result = parseArchesJson(input);

    expect(result.contexts).toHaveLength(2);
    expect(result.contexts.find(c => c.id === 'SU001')?.description).toBe('Topsoil layer');
    expect(result.contexts.find(c => c.id === 'SU002')?.period).toBe('Roman');
  });

  it('extracts AP13 stratigraphic relations', () => {
    const input = JSON.stringify([
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'SU001',
        AP13: [{ target: 'SU002', relation_type: 'above' }],
      },
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'SU002',
      },
    ]);

    const result = parseArchesJson(input);

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].source).toBe('SU001');
    expect(result.observations[0].target).toBe('SU002');
    expect(result.observations[0].relationshipType).toBe(RelationshipType.Above);
  });

  it('handles AP13 with below direction', () => {
    const input = JSON.stringify([
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'SU001',
        AP13: [{ target: 'SU002', relation_type: 'below' }],
      },
      { '@type': 'A8 Stratigraphic Unit', identifier: 'SU002' },
    ]);

    const result = parseArchesJson(input);

    expect(result.observations[0].relationshipType).toBe(RelationshipType.Below);
  });

  it('creates stub contexts for referenced IDs not in the data', () => {
    const input = JSON.stringify([
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'SU001',
        AP13: [{ target: 'SU999', relation_type: 'above' }],
      },
    ]);

    const result = parseArchesJson(input);

    const stub = result.contexts.find(c => c.id === 'SU999');
    expect(stub).toBeDefined();
    expect(stub!.type).toBe(ContextType.Unknown);
  });

  it('handles resources with no relations', () => {
    const input = JSON.stringify([
      { '@type': 'A8 Stratigraphic Unit', identifier: 'ISO001' },
    ]);

    const result = parseArchesJson(input);

    expect(result.contexts).toHaveLength(1);
    expect(result.observations).toHaveLength(0);
  });

  it('handles empty resource list', () => {
    const result = parseArchesJson('[]');

    expect(result.contexts).toHaveLength(0);
    expect(result.observations).toHaveLength(0);
  });

  it('returns warning for invalid JSON', () => {
    const result = parseArchesJson('not json');

    expect(result.warnings).toContain('Invalid JSON');
  });

  it('handles AP11 physical relations as Contemporary by default', () => {
    const input = JSON.stringify([
      {
        '@type': 'A8 Stratigraphic Unit',
        identifier: 'A',
        AP11: [{ target: 'B', type: 'contemporary' }],
      },
      { '@type': 'A8 Stratigraphic Unit', identifier: 'B' },
    ]);

    const result = parseArchesJson(input);

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].relationshipType).toBe(RelationshipType.Contemporary);
  });

  it('handles alternate Arches JSON format with "resources" wrapper', () => {
    const input = JSON.stringify({
      resources: [
        { '@type': 'A8 Stratigraphic Unit', identifier: 'R1' },
        { '@type': 'A8 Stratigraphic Unit', identifier: 'R2' },
      ],
    });

    const result = parseArchesJson(input);

    expect(result.contexts).toHaveLength(2);
  });

  it('maps context types correctly', () => {
    const input = JSON.stringify([
      { '@type': 'A8 Stratigraphic Unit', identifier: '101', type: 'Layer' },
      { '@type': 'A8 Stratigraphic Unit', identifier: '102', type: 'Cut' },
    ]);

    const result = parseArchesJson(input);

    expect(result.contexts.find(c => c.id === '101')?.type).toBe(ContextType.Positive);
    expect(result.contexts.find(c => c.id === '102')?.type).toBe(ContextType.Negative);
  });
});
