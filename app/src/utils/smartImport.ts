/**
 * smartImport.ts — Auto-detect field recording system and map columns.
 *
 * Analyzes CSV headers against known patterns from major archaeological
 * field recording systems and auto-suggests column mappings.
 *
 * exports: detectFieldSystem, suggestContextMapping, suggestObservationMapping
 * used_by: ImportEngine → ColumnMapper (auto-fill)
 */

// ── Known column aliases per system ──────────────────────────────────────────

interface PatternSet {
  id: string[];
  type: string[];
  description: string[];
  source: string[];
  target: string[];
  relationship: string[];
  centroidX: string[];
  centroidY: string[];
  /** Terms that uniquely identify this system (need at least 1 to trigger) */
  distinctive: string[];
}

interface SystemProfile {
  name: string;
  code: string;
  priority: number;
  patterns: PatternSet;
}

const FIELD_SYSTEMS: SystemProfile[] = [
  {
    name: 'Intrasis',
    code: 'intrasis',
    priority: 8,
    patterns: {
      id: ['us', 'usr', 'usrnr', 'unit_of_stratification'],
      type: ['us_type', 'context_type'],
      description: ['beskrivning', 'kommentar'],
      source: ['us_above', 'from_us', 'source_us'],
      target: ['us_below', 'to_us', 'target_us'],
      relationship: ['relation_type'],
      centroidX: ['ost', 'east'],
      centroidY: ['nord', 'north'],
      distinctive: ['us', 'usr', 'usrnr', 'beskrivning', 'ovan', 'under'],
    },
  },
  {
    name: 'ARK',
    code: 'ark',
    priority: 6,
    patterns: {
      id: ['contextnumber', 'context_no'],
      type: ['cut_or_deposit', 'feature_type'],
      description: ['interpretation', 'comments'],
      source: ['context_above', 'above_context', 'overlies'],
      target: ['context_below', 'below_context', 'underlies'],
      relationship: ['strat_relation', 'rel_type'],
      centroidX: ['eastings', 'x_coord'],
      centroidY: ['northings', 'y_coord'],
      distinctive: ['overlies', 'underlies', 'strat_relation', 'cut_or_deposit', 'contextnumber', 'context_no'],
    },
  },
  {
    name: 'FAIMS',
    code: 'faims',
    priority: 5,
    patterns: {
      id: ['record_id', 'unit_id'],
      type: ['unit_type', 'feature_type'],
      description: ['field_description', 'notes'],
      source: ['relation_above', 'strat_above'],
      target: ['relation_below', 'strat_below'],
      relationship: ['relation_type', 'rel_type'],
      centroidX: ['gps_x', 'point_x'],
      centroidY: ['gps_y', 'point_y'],
      distinctive: ['record_id', 'unit_type', 'field_description', 'relation_above', 'relation_below', 'strat_above', 'strat_below', 'gps_x', 'gps_y'],
    },
  },
  {
    name: 'iDig',
    code: 'idig',
    priority: 4,
    patterns: {
      id: ['su_id'],
      type: ['unit_type', 'kind'],
      description: ['unit_notes'],
      source: ['includes', 'parent'],
      target: ['included_in', 'child'],
      relationship: ['relation'],
      centroidX: ['latitude', 'gps_lat'],
      centroidY: ['longitude', 'gps_lon'],
      distinctive: ['su_id', 'unit_notes', 'includes', 'included_in', 'gps_lat', 'gps_lon'],
    },
  },
  {
    name: 'Heurist',
    code: 'heurist',
    priority: 5,
    patterns: {
      id: ['entity_id'],
      type: ['entity_type', 'classification'],
      description: ['full_text'],
      source: ['link_source', 'from_id'],
      target: ['link_target', 'to_id'],
      relationship: ['link_type'],
      centroidX: ['geom_x', 'longitude'],
      centroidY: ['geom_y', 'latitude'],
      distinctive: ['entity_id', 'entity_type', 'link_source', 'link_target', 'link_type', 'full_text', 'geom_x', 'geom_y'],
    },
  },
  {
    name: 'Trowel',
    code: 'trowel',
    priority: 7,
    patterns: {
      id: ['context_number', 'context_no', 'id'],
      type: ['context_type', 'type', 'feature_type'],
      description: ['description', 'interpretation'],
      source: ['cut_by', 'cuts'],
      target: ['fills', 'filled_by'],
      relationship: [],
      centroidX: ['easting', 'x', 'eastings'],
      centroidY: ['northing', 'y', 'northings'],
      distinctive: ['context_number', 'cut_by', 'filled_by'],
    },
  },
  {
    name: 'Generic CSV',
    code: 'generic',
    priority: 1,
    patterns: {
      id: ['id', 'context', 'su', 'unit', 'context_id', 'su_number', 'unit_id'],
      type: ['type', 'context_type', 'su_type', 'unit_type', 'feature_type', 'kind'],
      description: ['description', 'desc', 'notes', 'comments', 'remarks'],
      source: ['source', 'from', 'above', 'source_id', 'context_above', 'su_above', 'su_from'],
      target: ['target', 'to', 'below', 'target_id', 'context_below', 'su_below', 'su_to'],
      relationship: ['relationship', 'rel', 'relation', 'relationship_type', 'rel_type', 'type'],
      centroidX: ['x', 'easting', 'east', 'centroid_x', 'coord_x', 'gps_x'],
      centroidY: ['y', 'northing', 'north', 'centroid_y', 'coord_y', 'gps_y'],
      distinctive: [], // Generic has no distinctive terms — always fallback
    },
  },
];

// ── Detection ────────────────────────────────────────────────────────────────

export interface SystemMatch {
  code: string;
  name: string;
  score: number;
}

/**
 * Detect which field recording system the CSV headers are from.
 * Scores each system based on how many of its patterns match the headers.
 */
export function detectFieldSystem(headers: string[]): SystemMatch | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  let best: { code: string; name: string; score: number } | null = null;

  for (const system of FIELD_SYSTEMS) {
    // Require at least one distinctive term for non-generic systems
    const hasDistinctive = system.patterns.distinctive.length === 0
      || system.patterns.distinctive.some((p: string) => lowerHeaders.includes(p));

    if (!hasDistinctive) continue;

    let matchedCategories = 0;
    let totalCategories = 0;

    for (const [key, patterns] of Object.entries(system.patterns)) {
      if (key === 'distinctive') continue;
      totalCategories++;
      const patArr = patterns as string[];
      if (patArr.some((p: string) => lowerHeaders.includes(p))) {
        matchedCategories++;
      }
    }

    const categoryRatio = matchedCategories / Math.max(totalCategories, 1);
    const score = categoryRatio * system.priority * 100;

    if (matchedCategories > 0 && (!best || score > best.score)) {
      best = { code: system.code, name: system.name, score: Math.round(score) };
    }
  }

  return best;
}

// ── Auto-suggest column mappings ─────────────────────────────────────────────

export interface SuggestedMapping {
  idColumn: string;
  typeColumn?: string;
  descriptionColumn?: string;
  sourceColumn?: string;
  targetColumn?: string;
  relationshipColumn?: string;
  centroidXColumn?: string;
  centroidYColumn?: string;
}

/**
 * Suggest column mappings by matching headers against known system patterns.
 * Returns the best-fit mapping for the given headers.
 */
export function suggestMappings(headers: string[]): SuggestedMapping {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  // Find the best matching pattern set across all systems
  const result: SuggestedMapping = { idColumn: '' };
  const fieldKeys: (keyof SuggestedMapping)[] = [
    'idColumn', 'typeColumn', 'descriptionColumn',
    'sourceColumn', 'targetColumn', 'relationshipColumn',
    'centroidXColumn', 'centroidYColumn',
  ];

  // Map field keys to pattern keys (skip 'distinctive')
  const patternKeyMap: Record<string, keyof PatternSet> = {
    idColumn: 'id',
    typeColumn: 'type',
    descriptionColumn: 'description',
    sourceColumn: 'source',
    targetColumn: 'target',
    relationshipColumn: 'relationship',
    centroidXColumn: 'centroidX',
    centroidYColumn: 'centroidY',
  };

  for (const fieldKey of fieldKeys) {
    const patternKey = patternKeyMap[fieldKey];
    let bestHeader = '';
    let bestScore = 0;

    for (const system of FIELD_SYSTEMS) {
      const patterns = system.patterns[patternKey];
      for (let pi = 0; pi < patterns.length; pi++) {
        const pattern = patterns[pi];
        const headerIndex = lowerHeaders.indexOf(pattern);
        if (headerIndex !== -1) {
          // Score: earlier patterns in the list rank higher
          const patternScore = (patterns.length - pi) * system.priority * 10;
          if (patternScore > bestScore) {
            bestScore = patternScore;
            bestHeader = headers[headerIndex];
          }
        }
      }
    }

    if (bestHeader) {
      (result as any)[fieldKey] = bestHeader;
    }
  }

  return result;
}

/**
 * Summarise column detection confidence for the UI.
 */
export function mappingConfidence(mapping: SuggestedMapping): number {
  let filled = 0;
  if (mapping.idColumn) filled++;
  if (mapping.sourceColumn) filled++;
  if (mapping.targetColumn) filled++;
  return filled / 3; // 3 core fields: id, source, target
}
