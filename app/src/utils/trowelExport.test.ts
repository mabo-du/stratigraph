import { describe, it, expect } from 'vitest';
import { generateTrowelEedp } from './trowelExport';
import type { Context, Observation, Event } from '../models/hmdp';
import { ContextType, RelationshipType } from '../models/hmdp';

describe('Trowel Export', () => {
  const contexts: Context[] = [
    { id: '1', type: ContextType.Positive, description: 'Topsoil' },
    { id: '2', type: ContextType.Positive, description: 'Pit fill' },
    { id: '3', type: ContextType.Negative, description: 'Pit cut' },
  ];

  const observations: Observation[] = [
    { id: 'o1', source: '1', target: '2', relationshipType: RelationshipType.Above },
    { id: 'o2', source: '2', target: '3', relationshipType: RelationshipType.Above },
  ];

  const events: Event[] = [
    { id: 'Beta-123', contextId: '2', name: 'Charcoal', rDate: '2050, 30', type: 'C14' },
  ];

  it('produces Trowel-compatible JSON structure', () => {
    const json = generateTrowelEedp('Test Site', contexts, observations, events);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe('1.0');
    expect(parsed.site_name).toBe('Test Site');
    expect(parsed.paths).toBeInstanceOf(Array);
  });

  it('correctly types contexts', () => {
    const json = generateTrowelEedp('Test', contexts, observations, events);
    const parsed = JSON.parse(json);

    // Paths should have youngest first
    const firstPath = parsed.paths[0];
    expect(firstPath.steps[0].context_number).toBe('1');
    expect(firstPath.steps[0].type).toBe('deposit');

    // Negative should be 'cut'
    const cutStep = firstPath.steps.find((s: any) => s.context_number === '3');
    expect(cutStep.type).toBe('cut');
  });

  it('includes dating events when present', () => {
    const json = generateTrowelEedp('Test', contexts, observations, events);
    const parsed = JSON.parse(json);

    const fillStep = parsed.paths[0].steps.find((s: any) => s.context_number === '2');
    expect(fillStep.dating_events).toHaveLength(1);
    expect(fillStep.dating_events[0]).toContain('Charcoal');
    expect(fillStep.dating_events[0]).toContain('2050');
  });

  it('handles empty data gracefully', () => {
    const json = generateTrowelEedp('Empty', [], [], []);
    const parsed = JSON.parse(json);

    expect(parsed.paths).toHaveLength(0);
  });

  it('has depth fields as null when unavailable', () => {
    const json = generateTrowelEedp('Test', contexts, observations, []);
    const parsed = JSON.parse(json);

    const step = parsed.paths[0].steps[0];
    expect(step.depth_min).toBeNull();
    expect(step.depth_max).toBeNull();
  });
});
