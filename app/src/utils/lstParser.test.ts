import { describe, it, expect } from 'vitest';
import { parseLstFile } from './lstParser';
import { RelationshipType, ContextType } from '../models/hmdp';

describe('LST Parser', () => {
  it('parses classic BASP format with HEADING, CONTEXT DEFINITIONS, RELATIONS', () => {
    const input = `*HEADING
Project: Roman Villa Excavation
Site: Site 1
Date: 2020

*CONTEXT DEFINITIONS
1 "Topsoil"
2 "Pit fill"
3 "Pit cut"
4 "Natural geology"

*RELATIONS
1 2 AB
2 3 AB
3 4 AB`;

    const result = parseLstFile(input);

    expect(result.contexts).toHaveLength(4);
    expect(result.observations).toHaveLength(3);
    expect(result.metadata.project).toBe('Roman Villa Excavation');

    // Verify contexts
    expect(result.contexts.find(c => c.id === '1')?.description).toBe('Topsoil');
    expect(result.contexts.find(c => c.id === '4')?.description).toBe('Natural geology');

    // Verify edges
    expect(result.observations[0].source).toBe('1');
    expect(result.observations[0].target).toBe('2');
    expect(result.observations[0].relationshipType).toBe(RelationshipType.Above);
  });

  it('parses ArchEd extended JSON format', () => {
    const input = `*HEADER
{"site_name":"Test Site","project_code":"TS2020"}

*SU
{"id":"101","desc":"Topsoil","type":"layer"}
{"id":"102","desc":"Pit fill","type":"fill"}
{"id":"103","desc":"Pit cut","type":"cut"}

*RELATION
{"from":"101","to":"102","type":"AB"}
{"from":"102","to":"103","type":"AB"}
{"from":"101","to":"103","type":"AB"}`;

    const result = parseLstFile(input);

    expect(result.contexts).toHaveLength(3);
    expect(result.observations).toHaveLength(3);
    expect(result.metadata.site_name).toBe('Test Site');

    // ArchEd JSON types should map to HMDP types
    expect(result.contexts.find(c => c.id === '103')?.type).toBe(ContextType.Negative);
    expect(result.contexts.find(c => c.id === '101')?.type).toBe(ContextType.Positive);
  });

  it('handles EQUALS and EQUAL sections', () => {
    const input = `*EQUALS
200 201
300 301`;

    const result = parseLstFile(input);

    expect(result.observations).toHaveLength(2);
    expect(result.observations[0].relationshipType).toBe(RelationshipType.Equals);
    expect(result.observations[0].source).toBe('200');
    expect(result.observations[0].target).toBe('201');
  });

  it('creates stub contexts for referenced IDs', () => {
    const input = `*RELATIONS
A B AB`;

    const result = parseLstFile(input);

    expect(result.contexts).toHaveLength(2);
    expect(result.contexts.find(c => c.id === 'A')?.type).toBe(ContextType.Unknown);
    expect(result.contexts.find(c => c.id === 'B')?.type).toBe(ContextType.Unknown);
  });

  it('handles BELOW relationships', () => {
    const input = `*RELATIONS
1 2 BE`;

    const result = parseLstFile(input);

    expect(result.observations[0].source).toBe('1');
    expect(result.observations[0].target).toBe('2');
    expect(result.observations[0].relationshipType).toBe(RelationshipType.Below);
  });

  it('handles Stratify-format ABOVE section', () => {
    const input = `*HEADING
Project: Test

*CONTEXT
101 Topsoil
102 Pit

*ABOVE
101 102`;

    const result = parseLstFile(input);

    expect(result.contexts).toHaveLength(2);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].source).toBe('101');
    expect(result.observations[0].target).toBe('102');
    expect(result.observations[0].relationshipType).toBe(RelationshipType.Above);
  });

  it('handles empty content gracefully', () => {
    const result = parseLstFile('');
    expect(result.contexts).toHaveLength(0);
    expect(result.observations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('handles context IDs with square brackets', () => {
    const input = `*CONTEXT DEFINITIONS
[101] "Topsoil"
[102] "Pit fill"

*RELATIONS
[101] [102] AB`;

    const result = parseLstFile(input);

    // The brackets should be stripped from IDs
    const ctx101 = result.contexts.find(c => c.id === '101');
    expect(ctx101).toBeDefined();
    expect(ctx101?.description).toBe('Topsoil');
    expect(result.observations[0].source).toBe('101');
    expect(result.observations[0].target).toBe('102');
  });

  it('captures warnings about created stubs', () => {
    const input = `*RELATIONS
1 2 AB
2 3 AB`;

    const result = parseLstFile(input);

    // Contexts: 1, 2, 3 are created as stubs
    expect(result.contexts).toHaveLength(3);
    // No explicit context definitions means no descriptions
    expect(result.contexts.every(c => !c.description)).toBe(true);
  });
});
