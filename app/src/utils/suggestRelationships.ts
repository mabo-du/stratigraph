/**
 * suggestRelationships.ts — AI-assisted relationship suggestion engine.
 *
 * Scans context descriptions against archaeological vocabulary patterns
 * to suggest stratigraphic relationships that may be missing from the
 * current observation set.
 *
 * exports: suggestRelationships, Suggestion
 * used_by: Sidebar → RelationshipSuggestions UI
 */

import type { Context, Observation } from '../models/hmdp';
import { RelationshipType } from '../models/hmdp';

// ── Exported types ──────────────────────────────────────────────────────────

export interface Suggestion {
  source: string;
  target: string;
  relationshipType: RelationshipType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// ── Archaeological keyword patterns ─────────────────────────────────────────

interface Pattern {
  regex: RegExp;
  mapTo: (match: string, ctxId: string, targetId: string) => { source: string; target: string; relationshipType: RelationshipType } | null;
  confidence: 'high' | 'medium' | 'low';
  label: string;
}

const PATTERNS: Pattern[] = [
  // "fill of [X]" → this context is Above X (fill sits in the cut)
  {
    regex: /fill\s+of\s+(?:cut\s+)?\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: ctxId, target: targetId, relationshipType: RelationshipType.Above }),
    confidence: 'high',
    label: 'Explicit fill-of relationship',
  },
  // "cut into [X]" → this context is Below X (the cutting happens later)
  {
    regex: /cut\s+(?:into|through)\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: ctxId, target: targetId, relationshipType: RelationshipType.Above }),
    confidence: 'high',
    label: 'Explicit cut-into relationship',
  },
  // "cut by [X]" → X cuts this context → X Above this
  {
    regex: /(?:cut|truncat)(?:\w+)?\s+by\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: targetId, target: ctxId, relationshipType: RelationshipType.Above }),
    confidence: 'high',
    label: 'Context is cut by another',
  },
  // "above [X]" → this is Above X
  {
    regex: /(?:lies?\s+)?above\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: ctxId, target: targetId, relationshipType: RelationshipType.Above }),
    confidence: 'medium',
    label: 'Described as above another context',
  },
  // "below [X]" → this is Below X
  {
    regex: /(?:lies?\s+)?below\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: targetId, target: ctxId, relationshipType: RelationshipType.Above }),
    confidence: 'medium',
    label: 'Described as below another context',
  },
  // "sealed by [X]" → X seals this context → X Above this
  {
    regex: /sealed\s+by\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: targetId, target: ctxId, relationshipType: RelationshipType.Above }),
    confidence: 'high',
    label: 'Sealed by another context',
  },
  // "same as [X]" → equals relationship
  {
    regex: /same\s+as\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: ctxId, target: targetId, relationshipType: RelationshipType.Equals }),
    confidence: 'high',
    label: 'Explicit same-as equivalence',
  },
  // "contemporary with [X]"
  {
    regex: /contemporary\s+with\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: ctxId, target: targetId, relationshipType: RelationshipType.Contemporary }),
    confidence: 'medium',
    label: 'Described as contemporary',
  },
  // "overlies [X]" → this is Above X
  {
    regex: /overlies?\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: ctxId, target: targetId, relationshipType: RelationshipType.Above }),
    confidence: 'high',
    label: 'Stratigraphically overlies another context',
  },
  // "underlies [X]" → X is Above this
  {
    regex: /underlies?\s+\[?(\w+)\]?/i,
    mapTo: (_m, ctxId, targetId) => ({ source: targetId, target: ctxId, relationshipType: RelationshipType.Above }),
    confidence: 'high',
    label: 'Stratigraphically underlies another context',
  },
];

// ── Heuristic suggestions (non-pattern based) ───────────────────────────────

/**
 * Heuristic: if two contexts share the same phase and period, and one is
 * described as a cut and the other as a fill, suggest they may be related.
 * Only suggests if no observation exists between them.
 */
function heuristicCutFill(
  ctxA: Context,
  ctxB: Context,
  existingKeys: Set<string>,
): Suggestion | null {
  const aIsCut = ctxA.type === 'Negative' || ctxA.description?.toLowerCase().includes('cut');
  const bIsCut = ctxB.type === 'Negative' || ctxB.description?.toLowerCase().includes('cut');
  const aIsFill = ctxA.type === 'Positive' && (ctxA.description?.toLowerCase().includes('fill') ?? false);
  const bIsFill = ctxB.type === 'Positive' && (ctxB.description?.toLowerCase().includes('fill') ?? false);

  // Cut-fill pair within same phase
  if (aIsCut && bIsFill && ctxA.phase && ctxA.phase === ctxB.phase) {
    const key = [ctxA.id, ctxB.id, RelationshipType.Above].join('|');
    if (!existingKeys.has(key)) {
      return {
        source: ctxB.id, // fill
        target: ctxA.id, // cut
        relationshipType: RelationshipType.Above,
        confidence: 'low',
        reason: `"${ctxB.id}" (fill) and "${ctxA.id}" (cut) in same phase "${ctxA.phase}"`,
      };
    }
  }
  if (bIsCut && aIsFill && ctxB.phase && ctxB.phase === ctxA.phase) {
    const key = [ctxA.id, ctxB.id, RelationshipType.Above].join('|');
    if (!existingKeys.has(key)) {
      return {
        source: ctxA.id, // fill
        target: ctxB.id, // cut
        relationshipType: RelationshipType.Above,
        confidence: 'low',
        reason: `"${ctxA.id}" (fill) and "${ctxB.id}" (cut) in same phase "${ctxA.phase}"`,
      };
    }
  }
  return null;
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Analyse all contexts and suggest missing relationships.
 * Returns suggestions sorted by confidence (high → low).
 */
export function suggestRelationships(
  contexts: Context[],
  observations: Observation[],
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const existingKeys = new Set<string>();

  // Build a set of existing relationship keys for dedup
  for (const obs of observations) {
    existingKeys.add([obs.source, obs.target, obs.relationshipType].join('|'));
    existingKeys.add([obs.target, obs.source, obs.relationshipType].join('|'));
  }

  const ctxMap = new Map(contexts.map(c => [c.id, c]));

  // Phase 1: Pattern-matching on descriptions
  for (const ctx of contexts) {
    const desc = ctx.description || '';
    if (!desc) continue;

    for (const pattern of PATTERNS) {
      const match = desc.match(pattern.regex);
      if (!match) continue;

      const targetId = match[1];
      if (!targetId || targetId === ctx.id) continue;
      if (!ctxMap.has(targetId)) continue;

      const result = pattern.mapTo(match[0], ctx.id, targetId);
      if (!result) continue;

      const key = [result.source, result.target, result.relationshipType].join('|');
      if (existingKeys.has(key)) continue;

      suggestions.push({
        source: result.source,
        target: result.target,
        relationshipType: result.relationshipType,
        confidence: pattern.confidence,
        reason: pattern.label + ` (found in "${ctx.id}": "${desc.slice(0, 80)}")`,
      });
    }
  }

  // Phase 2: Heuristic cut-fill pairing within phases
  for (let i = 0; i < contexts.length; i++) {
    for (let j = i + 1; j < contexts.length; j++) {
      const heur = heuristicCutFill(contexts[i], contexts[j], existingKeys);
      if (heur) suggestions.push(heur);
    }
  }

  // Sort: high confidence first, then medium, then low
  const rank = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => rank[a.confidence] - rank[b.confidence]);

  return suggestions;
}
