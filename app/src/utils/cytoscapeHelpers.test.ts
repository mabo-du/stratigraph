import { expect, test, describe } from 'vitest';
import { buildCytoscapeElements } from './cytoscapeHelpers';
import { ContextType, RelationshipType } from '../models/hmdp';
import type { Context, Observation, Phase } from '../models/hmdp';

describe('cytoscapeHelpers', () => {
  const phases: Phase[] = [
    { id: 'phase-1', name: 'Roman', color: '#c8952a' },
    { id: 'phase-2', name: 'Medieval', color: '#5b9bd5' },
  ];

  // ── buildCytoscapeElements ──────────────────────────────────────────────

  describe('buildCytoscapeElements', () => {
    test('creates node elements from contexts', () => {
      const contexts: Context[] = [
        { id: 'SU001', type: ContextType.Positive, description: 'Topsoil', phase: 'phase-1' },
        { id: 'SU002', type: ContextType.Negative, description: 'Pit cut' },
      ];
      const elements = buildCytoscapeElements(contexts, [], phases, {});
      const nodes = elements.filter(el => !el.data?.source);

      expect(nodes).toHaveLength(2);
      expect(nodes[0].data.id).toBe('SU001');
      expect(nodes[0].data.phaseColor).toBe('#c8952a');   // From phase-1
      expect(nodes[0].data.type).toBe(ContextType.Positive);
      expect(nodes[1].data.phaseColor).toBe('#2a3a4a');    // No phase → default
    });

    test('creates edge elements from observations', () => {
      const contexts: Context[] = [
        { id: 'A', type: ContextType.Positive },
        { id: 'B', type: ContextType.Positive },
      ];
      const observations: Observation[] = [
        { id: 'obs-1', source: 'A', target: 'B', relationshipType: RelationshipType.Above },
      ];
      const elements = buildCytoscapeElements(contexts, observations, [], {});
      const edges = elements.filter(el => el.data?.source);

      expect(edges).toHaveLength(1);
      expect(edges[0].data.source).toBe('A');
      expect(edges[0].data.target).toBe('B');
      expect(edges[0].data.edgeType).toBe('stratigraphic');
    });

    test('normalises Below relationships to reversed direction', () => {
      const contexts: Context[] = [
        { id: 'A', type: ContextType.Positive },
        { id: 'B', type: ContextType.Positive },
      ];
      const observations: Observation[] = [
        { id: 'obs-1', source: 'A', target: 'B', relationshipType: RelationshipType.Below },
      ];
      const elements = buildCytoscapeElements(contexts, observations, [], {});
      const edges = elements.filter(el => el.data?.source);

      // Below means A is below B, so edge should go B → A (B is above A)
      expect(edges[0].data.source).toBe('B');
      expect(edges[0].data.target).toBe('A');
    });

    test('classifies Equals edges correctly', () => {
      const contexts: Context[] = [
        { id: 'A', type: ContextType.Positive },
        { id: 'B', type: ContextType.Positive },
      ];
      const observations: Observation[] = [
        { id: 'obs-1', source: 'A', target: 'B', relationshipType: RelationshipType.Equals },
      ];
      const elements = buildCytoscapeElements(contexts, observations, [], {});
      const edges = elements.filter(el => el.data?.source);

      expect(edges[0].data.edgeType).toBe('equals');
    });

    test('classifies Contemporary edges correctly', () => {
      const contexts: Context[] = [
        { id: 'A', type: ContextType.Positive },
        { id: 'B', type: ContextType.Positive },
      ];
      const observations: Observation[] = [
        { id: 'obs-1', source: 'A', target: 'B', relationshipType: RelationshipType.Contemporary },
      ];
      const elements = buildCytoscapeElements(contexts, observations, [], {});
      const edges = elements.filter(el => el.data?.source);

      expect(edges[0].data.edgeType).toBe('contemporary');
    });

    test('applies saved positions to nodes', () => {
      const contexts: Context[] = [
        { id: 'SU001', type: ContextType.Positive },
      ];
      const positions = { 'SU001': { x: 150, y: 300 } };
      const elements = buildCytoscapeElements(contexts, [], [], positions);

      expect(elements[0].position).toEqual({ x: 150, y: 300 });
    });

    test('creates elements for empty inputs without errors', () => {
      const elements = buildCytoscapeElements([], [], [], {});
      expect(elements).toEqual([]);
    });
  });
});
