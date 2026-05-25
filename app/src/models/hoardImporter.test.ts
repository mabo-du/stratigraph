/**
 * hoardImporter.test.ts — Tests for HOARD Phase 1 JSON import.
 *
 * Uses real Pinn Brook Park context sheet data and synthetic edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  parseHoardContext,
  inferObservationsForContext,
  importHoardData,
  validateHoardContext,
  normalizeContextId,
} from './hoardImporter';
import type { HoardContextSheet } from './hoardImporter';
import { ContextType, RelationshipType } from './hmdp';

// ── Real HOARD Phase 1 output (ctx_sheet_050 — context 47023) ──────────────

const realPinnBrook_47023: HoardContextSheet = {
  source_file: 'ctx_sheet_050.png',
  model: 'glm-ocr',
  context_number: '47023',
  type: 'LAYER',
  cut_by: [],
  cuts: [],
  same_as: null,
  fills: [],
  filled_by: [],
  description: 'SITE CODE: PADIS\nLocation: AREA6\nGrid Ref: \nType: CONTEXT NO. 47023',
  interpretation: 'Upper fill of large circular pit [47049] appears to be redep\nnatural, fair few larger very degraded to sand stones\nsupposing deliberate deposit/back filling rather than\nlow action non-anthropogenic depositional sequence',
  period: 'Unknown',
  finds: [],
  samples: [],
  sketch_present: false,
  review_flags: [],
};

// ── Synthetic data with relationships ──────────────────────────────────────

const withCuts: HoardContextSheet = {
  context_number: '[101]',
  type: 'CUT',
  cuts: ['102', '103'],
  cut_by: ['100'],
  fills: ['104'],
  filled_by: [],
  same_as: null,
  description: 'Large pit cut',
  interpretation: 'Pit cut for storage',
  period: 'Roman',
  finds: [],
  samples: [],
  sketch_present: true,
  review_flags: [],
};

const withFill: HoardContextSheet = {
  context_number: '[104]',
  type: 'FILL',
  cuts: [],
  cut_by: [],
  fills: ['101'],
  filled_by: [],
  same_as: null,
  description: 'Dark silty fill of pit',
  interpretation: 'Secondary fill',
  period: 'Roman',
  finds: [{ type: 'pottery', qty: 12, period: 'Roman', notes: 'Samian ware' }],
  samples: [{ id: 'SAMP-001', type: 'bulk soil' }],
  sketch_present: false,
  review_flags: [],
};

const withEquals: HoardContextSheet = {
  context_number: '[200]',
  type: 'LAYER',
  cuts: [],
  cut_by: [],
  fills: [],
  filled_by: [],
  same_as: '201',
  description: 'Homogeneous subsoil layer',
  interpretation: 'Subsoil',
  period: 'Undated',
  finds: [],
  samples: [],
  sketch_present: false,
  review_flags: [],
};

const withFilledBy: HoardContextSheet = {
  context_number: '[105]',
  type: 'CUT',
  cuts: [],
  cut_by: [],
  fills: [],
  filled_by: ['106'],
  same_as: null,
  description: 'Small posthole',
  interpretation: 'Posthole',
  period: '',
  finds: [],
  samples: [],
  sketch_present: false,
  review_flags: [{ field: 'period', issue: 'empty value' }],
};

const bareNumber: HoardContextSheet = {
  context_number: '300',
  type: 'NATURAL',
  cuts: [],
  cut_by: [],
  fills: [],
  filled_by: [],
  same_as: null,
  description: 'Natural geology',
  interpretation: 'Natural',
  period: 'Unknown',
  finds: [],
  samples: [],
  sketch_present: false,
  review_flags: [],
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('normalizeContextId', () => {
  it('strips square brackets', () => {
    expect(normalizeContextId('[101]')).toBe('101');
    expect(normalizeContextId('[47023]')).toBe('47023');
  });

  it('returns bare numbers as-is', () => {
    expect(normalizeContextId('47023')).toBe('47023');
    expect(normalizeContextId('300')).toBe('300');
  });

  it('trims whitespace', () => {
    expect(normalizeContextId('  101  ')).toBe('101');
  });
});

describe('parseHoardContext', () => {
  it('parses a real Pinn Brook context sheet', () => {
    const ctx = parseHoardContext(realPinnBrook_47023);

    expect(ctx.id).toBe('47023');
    expect(ctx.type).toBe(ContextType.Positive);
    // interpretation comes first, then description
    expect(ctx.description).toContain('Upper fill of large circular pit');
    expect(ctx.description).toContain('SITE CODE: PADIS');
    expect(ctx.period).toBe('Unknown');
  });

  it('maps LAYER → Positive', () => {
    const ctx = parseHoardContext(realPinnBrook_47023);
    expect(ctx.type).toBe(ContextType.Positive);
  });

  it('maps CUT → Negative', () => {
    const ctx = parseHoardContext(withCuts);
    expect(ctx.id).toBe('101');
    expect(ctx.type).toBe(ContextType.Negative);
    expect(ctx.period).toBe('Roman');
  });

  it('maps FILL → Positive', () => {
    const ctx = parseHoardContext(withFill);
    expect(ctx.id).toBe('104');
    expect(ctx.type).toBe(ContextType.Positive);
  });

  it('maps NATURAL → Positive', () => {
    const ctx = parseHoardContext(bareNumber);
    expect(ctx.id).toBe('300');
    expect(ctx.type).toBe(ContextType.Positive);
  });

  it('maps unknown type → Unknown', () => {
    const ctx = parseHoardContext({ ...realPinnBrook_47023, type: 'BOGUS' });
    expect(ctx.type).toBe(ContextType.Unknown);
  });

  it('falls back from description to interpretation', () => {
    const noDesc: HoardContextSheet = {
      ...realPinnBrook_47023,
      description: '',
      interpretation: 'Fallback interpretation',
    };
    const ctx = parseHoardContext(noDesc);
    expect(ctx.description).toBe('Fallback interpretation');
  });

  it('handles empty description and interpretation', () => {
    const empty: HoardContextSheet = {
      ...realPinnBrook_47023,
      description: '',
      interpretation: '',
    };
    const ctx = parseHoardContext(empty);
    expect(ctx.description).toBe('');
  });
});

describe('inferObservationsForContext', () => {
  it('returns no observations for isolated context', () => {
    const obs = inferObservationsForContext(realPinnBrook_47023);
    expect(obs.length).toBe(0);
  });

  it('infers Above from cuts field', () => {
    const obs = inferObservationsForContext(withCuts);
    // cuts: ['102', '103'] → this (101) ABOVE 102, ABOVE 103
    const cutAbove = obs.filter(o => o.source === '101' && o.target === '102');
    expect(cutAbove.length).toBe(1);
    expect(cutAbove[0].relationshipType).toBe(RelationshipType.Above);
    const cutAbove2 = obs.filter(o => o.source === '101' && o.target === '103');
    expect(cutAbove2.length).toBe(1);
  });

  it('infers Above from cut_by field (reversed)', () => {
    const obs = inferObservationsForContext(withCuts);
    // cut_by: ['100'] → 100 ABOVE 101
    const cb = obs.filter(o => o.source === '100' && o.target === '101');
    expect(cb.length).toBe(1);
    expect(cb[0].relationshipType).toBe(RelationshipType.Above);
  });

  it('infers Above from fills field', () => {
    const obs = inferObservationsForContext(withCuts);
    // fills: ['104'] → this (101) ABOVE 104
    const f = obs.filter(o => o.source === '101' && o.target === '104');
    expect(f.length).toBe(1);
    expect(f[0].relationshipType).toBe(RelationshipType.Above);
  });

  it('infers Above from filled_by field (reversed)', () => {
    const obs = inferObservationsForContext(withFilledBy);
    // filled_by: ['106'] → 106 ABOVE 105
    const fb = obs.filter(o => o.source === '106' && o.target === '105');
    expect(fb.length).toBe(1);
    expect(fb[0].relationshipType).toBe(RelationshipType.Above);
  });

  it('infers Equals from same_as field', () => {
    const obs = inferObservationsForContext(withEquals);
    const eq = obs.filter(o =>
      o.source === '200' && o.target === '201' &&
      o.relationshipType === RelationshipType.Equals
    );
    expect(eq.length).toBe(1);
  });

  it('deduplicates edges (only one obs per src→tgt pair)', () => {
    // Mock a sheet that redundantly lists same relationship twice
    const dupe: HoardContextSheet = {
      context_number: '[1]',
      type: 'LAYER',
      cuts: ['2', '2'],  // same target twice
      cut_by: [],
      fills: [],
      filled_by: [],
      same_as: null,
      description: '',
      interpretation: '',
      period: '',
      finds: [],
      samples: [],
      sketch_present: false,
      review_flags: [],
    };
    const obs = inferObservationsForContext(dupe);
    const matches = obs.filter(o => o.source === '1' && o.target === '2');
    expect(matches.length).toBe(1);
  });

  it('skips self-referencing relationships', () => {
    const selfRef: HoardContextSheet = {
      context_number: '[1]',
      type: 'LAYER',
      cuts: ['1'],  // self-reference
      cut_by: [],
      fills: [],
      filled_by: [],
      same_as: null,
      description: '',
      interpretation: '',
      period: '',
      finds: [],
      samples: [],
      sketch_present: false,
      review_flags: [],
    };
    const obs = inferObservationsForContext(selfRef);
    expect(obs.length).toBe(0);
  });
});

describe('validateHoardContext', () => {
  it('passes validation for valid sheets', () => {
    const result = validateHoardContext(realPinnBrook_47023);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('fails on missing context_number', () => {
    const result = validateHoardContext({
      ...realPinnBrook_47023,
      context_number: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: context_number');
  });

  it('fails on missing type', () => {
    const result = validateHoardContext({
      ...realPinnBrook_47023,
      type: '',
    });
    expect(result.valid).toBe(false);
  });

  it('warns on empty description AND interpretation', () => {
    const result = validateHoardContext({
      ...realPinnBrook_47023,
      description: '',
      interpretation: '',
    });
    // valid still true (warning not error)
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('warns on invalid schema_version', () => {
    const result = validateHoardContext({
      ...realPinnBrook_47023,
      schema_version: 'bad',
    });
    expect(result.warnings.some(w => w.includes('schema_version'))).toBe(true);
  });
});

describe('importHoardData', () => {
  it('imports a single context sheet', () => {
    const { contexts, observations, validation } = importHoardData([realPinnBrook_47023]);

    expect(contexts.length).toBe(1);
    expect(contexts[0].id).toBe('47023');
    expect(observations.length).toBe(0);
    expect(validation.length).toBe(1);
    expect(validation[0].valid).toBe(true);
  });

  it('imports multiple sheets with relationships', () => {
    const { contexts, observations } = importHoardData([
      withCuts,         // 101 (CUT) cuts 102, 103; filled 104; cut_by 100
      withFill,         // 104 (FILL) fills 101
      withFilledBy,     // 105 (CUT) filled_by 106
      bareNumber,       // 300 (NATURAL) isolated
    ]);

    // Contexts: 101, 104, 105, 300 (+ stubs: 100, 102, 103, 106)
    // 100, 102, 103, 106 are referenced in relationships but not imported as sheets
    expect(contexts.length).toBe(8);

    // Check stubs were created
    const stub100 = contexts.find(c => c.id === '100');
    expect(stub100).toBeDefined();
    expect(stub100!.type).toBe(ContextType.Unknown);
    expect(stub100!.description).toContain('Referenced context');

    // Check all imported contexts exist
    expect(contexts.find(c => c.id === '101')!.type).toBe(ContextType.Negative);
    expect(contexts.find(c => c.id === '104')!.type).toBe(ContextType.Positive);
    expect(contexts.find(c => c.id === '300')!.type).toBe(ContextType.Positive);

    // withCuts: cuts(2) + cut_by(1) + fills(1) = 4
    // withFill: fills(1) = 1
    // withFilledBy: filled_by(1) = 1
    // Total = 6
    expect(observations.length).toBe(6);

    // Verify specific relationships
    expect(observations.filter(o => o.source === '100' && o.target === '101').length).toBe(1);
    expect(observations.filter(o => o.source === '101' && o.target === '102').length).toBe(1);
    expect(observations.filter(o => o.source === '101' && o.target === '103').length).toBe(1);
    expect(observations.filter(o => o.source === '101' && o.target === '104').length).toBe(1);
    expect(observations.filter(o => o.source === '106' && o.target === '105').length).toBe(1);

    // withFill says fills: ['101'] → 104 ABOVE 101
    expect(observations.filter(o => o.source === '104' && o.target === '101').length).toBe(1);

    // Also verify the fill relationship makes sense:
    // 104 fills 101 → 104 (fill) ABOVE 101 (cut) ✓
    // Stratigraphically correct: fill sits on top of the cut it fills
  });

  it('imports equals relationship', () => {
    const { contexts, observations } = importHoardData([withEquals]);

    // 200 + stub 201
    expect(contexts.length).toBe(2);
    expect(observations.length).toBe(1);
    expect(observations[0].relationshipType).toBe(RelationshipType.Equals);
  });

  it('creates deterministic observation IDs', () => {
    const result1 = importHoardData([withCuts]);
    const result2 = importHoardData([withCuts]);

    // IDs should be deterministic across calls (counter resets)
    expect(result1.observations[0].id).toBe(result2.observations[0].id);
  });

  it('handles empty input', () => {
    const { contexts, observations, validation } = importHoardData([]);
    expect(contexts.length).toBe(0);
    expect(observations.length).toBe(0);
    expect(validation.length).toBe(0);
  });
});
