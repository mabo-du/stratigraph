import { expect, test, describe } from 'vitest';
import { buildAdjacencyList, hasCycle, findCyclePath, wouldCreateCycle, transitiveReduction } from './graphLogic';
import { RelationshipType } from './hmdp';
import type { Observation } from './hmdp';

describe('Graph Logic', () => {
  // ── buildAdjacencyList ──────────────────────────────────────────────────

  test('builds an adjacency list from observations', () => {
    const obs: Observation[] = [
      { id: '1', source: 'A', target: 'B', relationshipType: RelationshipType.Above },
      { id: '2', source: 'B', target: 'C', relationshipType: RelationshipType.Above },
      { id: '3', source: 'D', target: 'A', relationshipType: RelationshipType.Below } // D below A implies A -> D
    ];
    
    const adj = buildAdjacencyList(obs);
    
    expect(adj['A']).toContain('B');
    expect(adj['A']).toContain('D');
    expect(adj['B']).toContain('C');
    expect(adj['D']).toEqual([]);
  });

  test('ignores Equals and Contemporary relationships', () => {
    const obs: Observation[] = [
      { id: '1', source: 'A', target: 'B', relationshipType: RelationshipType.Equals },
      { id: '2', source: 'C', target: 'D', relationshipType: RelationshipType.Contemporary },
    ];
    const adj = buildAdjacencyList(obs);
    // No edges should be created for non-directional relationships
    expect(Object.values(adj).every(v => v.length === 0)).toBe(true);
  });

  // ── hasCycle ────────────────────────────────────────────────────────────

  test('hasCycle detects simple loops', () => {
    const adj = {
      'A': ['B'],
      'B': ['C'],
      'C': ['A']
    };
    expect(hasCycle(adj)).toBe(true);
  });

  test('hasCycle detects false loops (dag convergence)', () => {
    const adj = {
      'A': ['B', 'C'],
      'B': ['D'],
      'C': ['D'],
      'D': []
    };
    expect(hasCycle(adj)).toBe(false);
  });

  // ── findCyclePath ───────────────────────────────────────────────────────

  test('findCyclePath returns null for acyclic graph', () => {
    const adj = {
      'SU001': ['SU002'],
      'SU002': ['SU003'],
      'SU003': []
    };
    expect(findCyclePath(adj)).toBeNull();
  });

  test('findCyclePath returns the cycle path for a simple loop', () => {
    const adj = {
      'SU001': ['SU002'],
      'SU002': ['SU003'],
      'SU003': ['SU001']
    };
    const path = findCyclePath(adj);
    expect(path).not.toBeNull();
    // The path should form a closed loop (first === last)
    expect(path![0]).toBe(path![path!.length - 1]);
    // Should contain all three nodes
    expect(path).toContain('SU001');
    expect(path).toContain('SU002');
    expect(path).toContain('SU003');
  });

  test('findCyclePath returns path for self-loop', () => {
    const adj = {
      'SU001': ['SU001'],
    };
    const path = findCyclePath(adj);
    expect(path).not.toBeNull();
    expect(path).toEqual(['SU001', 'SU001']);
  });

  // ── wouldCreateCycle ────────────────────────────────────────────────────

  test('wouldCreateCycle returns null when edge is safe', () => {
    const adj = {
      'SU001': ['SU002'],
      'SU002': [],
      'SU003': []
    };
    // Adding SU002 -> SU003 is safe
    expect(wouldCreateCycle(adj, 'SU002', 'SU003')).toBeNull();
  });

  test('wouldCreateCycle returns cycle path when edge would create a loop', () => {
    const adj = {
      'SU001': ['SU002'],
      'SU002': ['SU003'],
      'SU003': []
    };
    // Adding SU003 -> SU001 would create SU001 -> SU002 -> SU003 -> SU001
    const path = wouldCreateCycle(adj, 'SU003', 'SU001');
    expect(path).not.toBeNull();
    expect(path![0]).toBe(path![path!.length - 1]);
  });

  test('wouldCreateCycle does not mutate the original adjacency list', () => {
    const adj = {
      'SU001': ['SU002'],
      'SU002': [],
    };
    const originalLength = adj['SU001'].length;
    wouldCreateCycle(adj, 'SU002', 'SU001');
    // Original should be unchanged
    expect(adj['SU001'].length).toBe(originalLength);
    expect(adj['SU002'].length).toBe(0);
  });

  // ── transitiveReduction ─────────────────────────────────────────────────

  test('transitiveReduction removes redundant paths', () => {
    const adj = {
      'A': ['B', 'C'], // A -> C is redundant because A -> B -> C
      'B': ['C']
    };
    
    const reduced = transitiveReduction(adj);
    
    expect(reduced['A']).toContain('B');
    expect(reduced['A']).not.toContain('C');
    expect(reduced['B']).toContain('C');
  });

  test('transitiveReduction handles complex stratigraphic jumps', () => {
    const adj = {
      '1': ['2', '3', '4'],
      '2': ['3', '5'],
      '3': ['4', '5'],
      '4': ['5'],
      '5': []
    };
    // 1 -> 2, 2 -> 3, 3 -> 4, 4 -> 5
    // 1 -> 3 (redundant)
    // 1 -> 4 (redundant)
    // 2 -> 5 (redundant)
    // 3 -> 5 (redundant)
    
    const reduced = transitiveReduction(adj);
    
    expect(reduced['1']).toEqual(['2']);
    expect(reduced['2']).toEqual(['3']);
    expect(reduced['3']).toEqual(['4']);
    expect(reduced['4']).toEqual(['5']);
  });
});
