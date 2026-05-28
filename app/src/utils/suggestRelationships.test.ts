import { describe, it, expect } from 'vitest';
import { suggestRelationships } from './suggestRelationships';
import type { Context, Observation } from '../models/hmdp';
import { ContextType, RelationshipType } from '../models/hmdp';

describe('Relationship Suggestions', () => {
  it('suggests fill-of from description text', () => {
    const contexts: Context[] = [
      { id: '101', type: ContextType.Positive, description: 'Fill of cut [102] — dark silty clay' },
      { id: '102', type: ContextType.Negative, description: 'Pit cut' },
    ];

    const suggestions = suggestRelationships(contexts, []);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const fillSuggestion = suggestions.find(s => s.reason.includes('fill-of'));
    expect(fillSuggestion).toBeDefined();
    expect(fillSuggestion!.source).toBe('101');
    expect(fillSuggestion!.target).toBe('102');
    expect(fillSuggestion!.relationshipType).toBe(RelationshipType.Above);
    expect(fillSuggestion!.confidence).toBe('high');
  });

  it('suggests cut-into from description text', () => {
    const contexts: Context[] = [
      { id: '201', type: ContextType.Negative, description: 'Cut into [202] for foundation trench' },
      { id: '202', type: ContextType.Positive, description: 'Natural gravel' },
    ];

    const suggestions = suggestRelationships(contexts, []);

    const cutSuggestion = suggestions.find(s => s.reason.includes('cut-into'));
    expect(cutSuggestion).toBeDefined();
    expect(cutSuggestion!.source).toBe('201');
    expect(cutSuggestion!.target).toBe('202');
  });

  it('detects cut-by relationships', () => {
    const contexts: Context[] = [
      { id: '301', type: ContextType.Positive, description: 'Truncated by [302] — upper surface eroded' },
      { id: '302', type: ContextType.Negative, description: 'Erosion cut' },
    ];

    const suggestions = suggestRelationships(contexts, []);

    const cutBySuggestion = suggestions.find(s => s.reason.includes('cut by'));
    expect(cutBySuggestion).toBeDefined();
    expect(cutBySuggestion!.source).toBe('302');
    expect(cutBySuggestion!.target).toBe('301');
  });

  it('excludes existing relationships', () => {
    const contexts: Context[] = [
      { id: 'A', type: ContextType.Positive, description: 'Fill of [B]' },
      { id: 'B', type: ContextType.Negative, description: 'Cut' },
    ];

    const existing: Observation[] = [
      { id: 'o1', source: 'A', target: 'B', relationshipType: RelationshipType.Above },
    ];

    const suggestions = suggestRelationships(contexts, existing);

    // Should not suggest the existing relationship
    const fillSuggestion = suggestions.find(s => s.reason.includes('fill-of'));
    expect(fillSuggestion).toBeUndefined();
  });

  it('handles contexts with no descriptions', () => {
    const contexts: Context[] = [
      { id: 'X', type: ContextType.Positive },
      { id: 'Y', type: ContextType.Negative },
    ];

    const suggestions = suggestRelationships(contexts, []);
    // Should not crash, should return low-confidence heuristics at most
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it('suggests same-as from description', () => {
    const contexts: Context[] = [
      { id: '200', type: ContextType.Positive, description: 'Same as [201] — homogeneous subsoil' },
      { id: '201', type: ContextType.Positive, description: 'Subsoil layer' },
    ];

    const suggestions = suggestRelationships(contexts, []);

    const eqSuggestion = suggestions.find(s => s.relationshipType === RelationshipType.Equals);
    expect(eqSuggestion).toBeDefined();
    expect(eqSuggestion!.source).toBe('200');
    expect(eqSuggestion!.target).toBe('201');
  });

  it('sorts high confidence before medium before low', () => {
    const contexts: Context[] = [
      { id: '101', type: ContextType.Positive, description: 'Fill of [102]' },
      { id: '102', type: ContextType.Negative, description: 'Cut — lies below [103]' },
      { id: '103', type: ContextType.Positive, description: 'Natural' },
      { id: '104', type: ContextType.Positive, description: 'Fill' },
      { id: '105', type: ContextType.Negative, description: 'Cut' },
    ];

    const suggestions = suggestRelationships(contexts, []);

    // All high-confidence should come before medium, before low
    let lastRank = -1;
    const rank = { high: 0, medium: 1, low: 2 };
    for (const s of suggestions) {
      expect(rank[s.confidence]).toBeGreaterThanOrEqual(lastRank);
      lastRank = rank[s.confidence];
    }
  });

  it('handles the demo Roman Villa dataset without crashing', () => {
    const contexts: Context[] = [
      { id: '106', type: ContextType.Positive, description: 'Occupation layer — dark grey-brown silty loam with charcoal flecks, animal bone, and Samian pottery' },
      { id: '107', type: ContextType.Positive, description: 'Hearth rake-out — bright orange-red burnt clay with abundant charcoal and vitrified material' },
      { id: '115', type: ContextType.Negative, description: 'Pit cut — sub-circular cut, 1.2m diameter, 0.8m deep, steep sides, flat base' },
      { id: '116', type: ContextType.Positive, description: 'Pit primary fill — dark grey organic silty clay with frequent charcoal, animal bone, and oyster shell' },
    ];

    const existing: Observation[] = [
      { id: 'o1', source: '106', target: '108', relationshipType: RelationshipType.Above },
    ];

    const suggestions = suggestRelationships(contexts, existing);
    expect(Array.isArray(suggestions)).toBe(true);
  });
});
