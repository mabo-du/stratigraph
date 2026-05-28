import { describe, it, expect } from 'vitest';
import { generateOxCalScript, generateLibbyPayload } from './bayesianLogic';
import type { Context, Observation, Event } from './hmdp';
import { RelationshipType, ContextType } from './hmdp';

describe('Bayesian Logic - OxCal Export', () => {
  it('generates a valid sequence with transitive reduction', () => {
    const contexts: Context[] = [
      { id: '1', type: ContextType.Unknown, description: 'Layer 1 (Youngest)' },
      { id: '2', type: ContextType.Unknown, description: 'Layer 2 (Middle)' },
      { id: '3', type: ContextType.Unknown, description: 'Layer 3 (Oldest)' },
    ];

    const observations: Observation[] = [
      { id: 'rel1', source: '1', target: '2', relationshipType: RelationshipType.Above }, // 1 above 2
      { id: 'rel2', source: '2', target: '3', relationshipType: RelationshipType.Above }, // 2 above 3
      { id: 'rel3', source: '1', target: '3', relationshipType: RelationshipType.Above }, // 1 above 3 (Redundant path)
    ];

    const script = generateOxCalScript(contexts, observations);

    // Should contain Context definitions
    expect(script).toContain('Sequence("Context_1")');
    expect(script).toContain('Phase("Events_1")');
    
    // 3 is oldest, so 3 is below 2. 
    // In observations: 1 above 2 -> 2 is older than 1.
    // 2 above 3 -> 3 is older than 2.
    // Transitive reduction should remove "3 is older than 1" direct edge
    
    // Check older -> younger edges
    expect(script).toContain('Boundary("=End_3");');
    expect(script).toContain('Boundary("=Start_2");');

    expect(script).toContain('Boundary("=End_2");');
    expect(script).toContain('Boundary("=Start_1");');

    // Should NOT contain the redundant direct edge from 3 to 1
    // We expect 3->2 and 2->1, but not 3->1.
    const hasRedundantEdge = script.includes('Boundary("=End_3");\n    Boundary("=Start_1");');
    expect(hasRedundantEdge).toBe(false);
  });
});

describe('Libby JSON Payload', () => {
  const contexts: Context[] = [
    { id: '1', type: ContextType.Positive, description: 'Topsoil', period: 'Modern', phase: 'p1' },
    { id: '2', type: ContextType.Positive, description: 'Fill', phase: 'p1' },
    { id: '3', type: ContextType.Negative, description: 'Cut' },
  ];

  const observations: Observation[] = [
    { id: 'o1', source: '1', target: '2', relationshipType: RelationshipType.Above },
    { id: 'o2', source: '2', target: '3', relationshipType: RelationshipType.Above },
  ];

  const events: Event[] = [
    { id: 'Beta-123456', contextId: '2', name: 'Charcoal lens', rDate: '2050, 30', type: 'C14' },
  ];

  it('generates valid JSON payload with metadata', () => {
    const json = generateLibbyPayload('Test Site', contexts, observations, events);
    const parsed = JSON.parse(json);

    expect(parsed.libby.project).toBe('Test Site');
    expect(parsed.metadata.totalContexts).toBe(3);
    expect(parsed.metadata.totalEvents).toBe(1);
    expect(parsed.metadata.totalConstraints).toBe(2);
  });

  it('includes constraints from transitive reduction', () => {
    const json = generateLibbyPayload('Test', contexts, observations, events);
    const parsed = JSON.parse(json);

    expect(parsed.constraints.length).toBe(2);
    // 1 above 2 -> target(2) older than source(1): constraint older=2, younger=1
    expect(parsed.constraints[0].older).toBe('2');
    expect(parsed.constraints[0].younger).toBe('1');
  });

  it('includes parsed C14 dates', () => {
    const json = generateLibbyPayload('Test', contexts, observations, events);
    const parsed = JSON.parse(json);

    expect(parsed.dates).toHaveLength(1);
    expect(parsed.dates[0].labId).toBe('Beta-123456');
    expect(parsed.dates[0].bp).toBe(2050);
    expect(parsed.dates[0].sigma).toBe(30);
  });

  it('includes embedded OxCal CQL script', () => {
    const json = generateLibbyPayload('Test', contexts, observations, events);
    const parsed = JSON.parse(json);

    expect(parsed.oxcal).toContain('StratiGraph Bayesian Export');
    expect(parsed.oxcal).toContain('R_Date');
  });

  it('groups contexts by phase', () => {
    const json = generateLibbyPayload('Test', contexts, observations, events);
    const parsed = JSON.parse(json);

    const p1Phase = parsed.phases.find((p: any) => p.id === 'p1');
    expect(p1Phase).toBeDefined();
    expect(p1Phase.contexts).toContain('1');
    expect(p1Phase.contexts).toContain('2');
  });

  it('handles empty data gracefully', () => {
    const json = generateLibbyPayload('Empty', [], [], []);
    const parsed = JSON.parse(json);

    expect(parsed.metadata.totalContexts).toBe(0);
    expect(parsed.dates).toHaveLength(0);
    expect(parsed.constraints).toHaveLength(0);
  });
});
