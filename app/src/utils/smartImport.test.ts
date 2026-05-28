import { describe, it, expect } from 'vitest';
import { detectFieldSystem, suggestMappings, mappingConfidence } from './smartImport';

describe('Smart Import — Field System Detection', () => {
  it('detects Intrasis headers', () => {
    const headers = ['US', 'US_type', 'beskrivning', 'from_us', 'to_us', 'relation_type', 'easting', 'northing'];
    const result = detectFieldSystem(headers);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('intrasis');
    expect(result!.score).toBeGreaterThan(0);
  });

  it('detects generic CSV headers', () => {
    const headers = ['id', 'type', 'description', 'from', 'to', 'relationship', 'x', 'y'];
    const result = detectFieldSystem(headers);
    // Should detect "Generic CSV" with the lowest priority
    expect(result).not.toBeNull();
    expect(result!.code).toBe('generic');
  });

  it('returns null for completely unrelated headers', () => {
    const headers = ['col1', 'col2', 'data', 'value'];
    const result = detectFieldSystem(headers);
    expect(result).toBeNull();
  });
});

describe('Smart Import — Column Mapping Suggestions', () => {
  it('suggests correct mappings for Intrasis export', () => {
    const headers = ['US', 'US_type', 'beskrivning', 'from_us', 'to_us', 'relation_type', 'easting', 'northing'];
    const mapping = suggestMappings(headers);

    expect(mapping.idColumn).toBe('US');
    expect(mapping.typeColumn).toBe('US_type');
    expect(mapping.sourceColumn).toBe('from_us');
    expect(mapping.targetColumn).toBe('to_us');
    expect(mapping.centroidXColumn).toBe('easting');
  });

  it('suggests correct mappings for FAIMS-style headers', () => {
    const headers = ['record_id', 'unit_type', 'field_description', 'relation_above', 'relation_below'];
    const mapping = suggestMappings(headers);

    expect(mapping.idColumn).toBe('record_id');
    expect(mapping.typeColumn).toBe('unit_type');
    // description should be 'field_description' matching FAIMS patterns
    expect(mapping.descriptionColumn).toBe('field_description');
    expect(mapping.sourceColumn).toBe('relation_above');
    expect(mapping.targetColumn).toBe('relation_below');
  });

  it('returns empty for unmappable headers', () => {
    const headers = ['foo', 'bar', 'baz'];
    const mapping = suggestMappings(headers);

    // Fields with no match are undefined/empty
    expect(mapping.idColumn).toBeFalsy();
    expect(mapping.sourceColumn).toBeFalsy();
    expect(mapping.targetColumn).toBeFalsy();
  });

  it('prefers specific patterns over generic ones', () => {
    // Intrasis has higher priority than Generic CSV
    const headers = ['US', 'source', 'target'];
    // 'US' should match Intrasis id, not generic 'id'
    const mapping = suggestMappings(headers);
    expect(mapping.idColumn).toBe('US');
  });
});

describe('Smart Import — Confidence Scoring', () => {
  it('returns 1.0 when all three core fields are mapped', () => {
    const mapping = { idColumn: 'id', sourceColumn: 'from', targetColumn: 'to' };
    expect(mappingConfidence(mapping)).toBe(1);
  });

  it('returns 0.33 when only id is mapped', () => {
    const mapping = { idColumn: 'id', sourceColumn: '', targetColumn: '' };
    expect(mappingConfidence(mapping)).toBeCloseTo(0.33, 1);
  });

  it('returns 0 when nothing is mapped', () => {
    const mapping = { idColumn: '', sourceColumn: '', targetColumn: '' };
    expect(mappingConfidence(mapping)).toBe(0);
  });
});
