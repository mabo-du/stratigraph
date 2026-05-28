import { describe, it, expect } from 'vitest';
import { generateMatrixReport } from './hoardReport';
import type { Context, Observation, Phase, Event } from './hmdp';
import { ContextType, RelationshipType } from './hmdp';

describe('Matrix Report', () => {
  const phases: Phase[] = [
    { id: 'p1', name: 'Roman', color: '#c8952a' },
    { id: 'p2', name: 'Medieval', color: '#5b9bd5' },
  ];

  const contexts: Context[] = [
    { id: '1', type: ContextType.Positive, description: 'Topsoil', phase: 'p1', period: 'Modern' },
    { id: '2', type: ContextType.Positive, description: 'Pit fill', phase: 'p1' },
    { id: '3', type: ContextType.Negative, description: 'Pit cut' },
  ];

  const observations: Observation[] = [
    { id: 'o1', source: '1', target: '2', relationshipType: RelationshipType.Above },
    { id: 'o2', source: '2', target: '3', relationshipType: RelationshipType.Above },
    { id: 'o3', source: '1', target: '3', relationshipType: RelationshipType.Equals },
  ];

  const events: Event[] = [
    { id: 'Beta-123', contextId: '1', name: 'Charcoal', rDate: '1000, 25', type: 'C14' },
  ];

  it('generates markdown with correct sections', () => {
    const report = generateMatrixReport('Test Site', contexts, observations, phases, events);

    expect(report.markdown).toContain('Harris Matrix Report: Test Site');
    expect(report.markdown).toContain('## 1. Summary');
    expect(report.markdown).toContain('## 2. Context Catalogue');
    expect(report.markdown).toContain('## 3. Phases');
    expect(report.markdown).toContain('## 4. Stratigraphic Sequence');
    expect(report.markdown).toContain('## 5. Relationships');
  });

  it('computes correct statistics', () => {
    const report = generateMatrixReport('Test', contexts, observations, phases, events);

    expect(report.stats.totalContexts).toBe(3);
    expect(report.stats.positive).toBe(2);
    expect(report.stats.negative).toBe(1);
    expect(report.stats.totalRelationships).toBe(3);
    expect(report.stats.directionalEdges).toBe(2);
    expect(report.stats.equalsEdges).toBe(1);
    expect(report.stats.phases).toBe(2);
    expect(report.stats.events).toBe(1);
  });

  it('generates JSON payload', () => {
    const report = generateMatrixReport('Test', contexts, observations, phases, events);
    const payload = JSON.parse(report.json);

    expect(payload.report.project).toBe('Test');
    expect(payload.contexts).toHaveLength(3);
    expect(payload.phases).toHaveLength(2);
    expect(payload.stats.totalContexts).toBe(3);
  });

  it('handles empty data gracefully', () => {
    const report = generateMatrixReport('Empty', [], [], [], []);

    expect(report.markdown).toContain('No stratigraphic relationships defined');
    expect(report.stats.totalContexts).toBe(0);
    expect(report.stats.totalRelationships).toBe(0);
    expect(JSON.parse(report.json).contexts).toHaveLength(0);
  });

  it('includes EEDP paths in the stratigraphic sequence section', () => {
    const report = generateMatrixReport('Paths', contexts, observations, [], []);

    expect(report.markdown).toContain('Path 1');
    expect(report.markdown).toContain('| 1 | 1 | Deposit | Topsoil');
  });
});
