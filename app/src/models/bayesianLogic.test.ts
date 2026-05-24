import { describe, it, expect } from 'vitest';
import { generateOxCalScript } from './bayesianLogic';
import type { Context, Observation } from './hmdp';
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
