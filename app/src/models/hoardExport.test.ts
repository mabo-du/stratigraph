import { describe, it, expect } from 'vitest';
import { extractEEDPPaths } from './hoardExport';
import type { Context, Observation } from './hmdp';
import { ContextType, RelationshipType } from './hmdp';

describe('HOARD Export - EEDP Extraction', () => {
  it('extracts independent paths from a branching DAG', () => {
    // Topsoil
    //  ├── Pit Fill 1 ── Pit Cut 1 ──┐
    //  └── Wall ─────────────────────┴── Natural Geology

    const contexts: Context[] = [
      { id: '1', type: ContextType.Positive, description: 'Topsoil' },
      { id: '2', type: ContextType.Positive, description: 'Pit Fill 1' },
      { id: '3', type: ContextType.Negative, description: 'Pit Cut 1' },
      { id: '4', type: ContextType.Positive, description: 'Wall' },
      { id: '5', type: ContextType.Positive, description: 'Natural Geology' },
    ];

    const observations: Observation[] = [
      { id: 'o1', source: '1', target: '2', relationshipType: RelationshipType.Above },
      { id: 'o2', source: '2', target: '3', relationshipType: RelationshipType.Above },
      { id: 'o3', source: '3', target: '5', relationshipType: RelationshipType.Above },
      
      { id: 'o4', source: '1', target: '4', relationshipType: RelationshipType.Above },
      { id: 'o5', source: '4', target: '5', relationshipType: RelationshipType.Above },
    ];

    const paths = extractEEDPPaths(contexts, observations);

    expect(paths.length).toBe(2);

    // Path 1: 1 -> 2 -> 3 -> 5
    const path1Ids = paths[0].nodes.map(n => n.id);
    expect(path1Ids).toEqual(['1', '2', '3', '5']);

    // Path 2: 1 -> 4 -> 5
    const path2Ids = paths[1].nodes.map(n => n.id);
    expect(path2Ids).toEqual(['1', '4', '5']);
  });

  it('handles transitive reduction during extraction', () => {
    const contexts: Context[] = [
      { id: '1', type: ContextType.Positive },
      { id: '2', type: ContextType.Positive },
      { id: '3', type: ContextType.Positive },
    ];

    const observations: Observation[] = [
      { id: 'o1', source: '1', target: '2', relationshipType: RelationshipType.Above },
      { id: 'o2', source: '2', target: '3', relationshipType: RelationshipType.Above },
      { id: 'o3', source: '1', target: '3', relationshipType: RelationshipType.Above }, // Redundant direct edge
    ];

    const paths = extractEEDPPaths(contexts, observations);
    
    // There should only be ONE path: 1 -> 2 -> 3
    // The redundant edge 1 -> 3 shouldn't create a separate 1 -> 3 path.
    expect(paths.length).toBe(1);
    expect(paths[0].nodes.map(n => n.id)).toEqual(['1', '2', '3']);
  });
});
