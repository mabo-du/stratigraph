/**
 * archesImporter.ts — Import ArchesDB CIDOC-CRM JSON into HMDP.
 *
 * Parses ArchesDB CRM exports, extracting stratigraphic units (A8) and
 * their relationships (AP13, AP11, AP12) per the CIDOC-CRM extension
 * for archaeological stratigraphy (CRMarchaeo).
 *
 * exports: parseArchesJson
 * used_by: ImportEngine (via import handler)
 *
 * References:
 *   - CIDOC-CRM v7.1.1: http://www.cidoc-crm.org/
 *   - CRMarchaeo: http://www.cidoc-crm.org/crmarchaeo/
 *   - ArchesDB: https://www.archesproject.org/
 *   - Harris Matrix Research Scope §3 (this project)
 */

import type { Context, Observation } from '../models/hmdp';
import { ContextType, RelationshipType } from '../models/hmdp';

// ── Parse result ────────────────────────────────────────────────────────────

export interface ArchesParseResult {
  contexts: Context[];
  observations: Observation[];
  metadata: Record<string, string>;
  warnings: string[];
}

// ── CIDOC-CRM property constants ────────────────────────────────────────────

/** A8 Stratigraphic Unit (CRMarchaeo) */
const A8_STRATIGRAPHIC_UNIT = 'A8 Stratigraphic Unit';

/** AP13 has stratigraphic relation to (defines temporal sequence) */
const AP13_STRATIGRAPHIC_RELATION = 'AP13';

/** AP11 has physical relation to (contact without temporal assertion) */
const AP11_PHYSICAL_RELATION = 'AP11';

/** AP12 confines (interface defines boundary) */
const AP12_CONFINES = 'AP12';

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an ArchesDB CIDOC-CRM JSON export into HMDP contexts and observations.
 * Supports both flat JSON arrays and nested resource structures.
 */
export function parseArchesJson(json: string, _filename?: string): ArchesParseResult {
  const observations: Observation[] = [];
  const metadata: Record<string, string> = {};
  const warnings: string[] = [];

  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return { contexts: [], observations: [], metadata, warnings: ['Invalid JSON'] };
  }

  // Normalise: handle both resource arrays and single-resource objects
  const resources = Array.isArray(data) ? data : (data.resources ?? data.results ?? [data].filter(r => r?.['@type']));

  const ctxMap = new Map<string, Context>();
  let obsCounter = 0;
  const nextId = () => `arches-obs-${++obsCounter}`;

  // Phase 1: Extract contexts from A8 Stratigraphic Unit resources
  for (const resource of resources) {
    const ctx = extractContext(resource);
    if (ctx) {
      ctxMap.set(ctx.id, ctx);
    }
  }

  // Phase 2: Extract observations from relationship properties
  for (const resource of resources) {
    const sourceId = extractIdentifier(resource);
    if (!sourceId || !ctxMap.has(sourceId)) continue;

    // AP13 stratigraphic relations
    const ap13 = getRelations(resource, AP13_STRATIGRAPHIC_RELATION);
    for (const rel of ap13) {
      const targetId = normalizeId(rel.target ?? rel['@id'] ?? '');
      if (!targetId) continue;
      ensureCtx(ctxMap, targetId);

      const dir = (rel.relation_type ?? rel.type ?? '').toLowerCase();
      const relType = dir === 'below' ? RelationshipType.Below : RelationshipType.Above;

      observations.push({ id: nextId(), source: sourceId, target: targetId, relationshipType: relType });
    }

    // AP11 physical relations (treated as Contemporary by default)
    const ap11 = getRelations(resource, AP11_PHYSICAL_RELATION);
    for (const rel of ap11) {
      const targetId = normalizeId(rel.target ?? rel['@id'] ?? '');
      if (!targetId) continue;
      ensureCtx(ctxMap, targetId);

      const dir = (rel.relation_type ?? rel.type ?? '').toLowerCase();
      const relType = dir === 'above' ? RelationshipType.Above
        : dir === 'below' ? RelationshipType.Below
        : RelationshipType.Contemporary;

      observations.push({ id: nextId(), source: sourceId, target: targetId, relationshipType: relType });
    }

    // AP12 confines (interface = negative, target = the feature it bounds)
    const ap12 = getRelations(resource, AP12_CONFINES);
    for (const rel of ap12) {
      const targetId = normalizeId(rel.target ?? rel['@id'] ?? '');
      if (!targetId) continue;
      ensureCtx(ctxMap, targetId);

      // The interface (this context) bounds the target — interface is later
      observations.push({
        id: nextId(),
        source: sourceId,
        target: targetId,
        relationshipType: RelationshipType.Above,
      });
    }
  }

  // Phase 3: Create stubs for referenced IDs not in source data
  const referencedIds = new Set<string>();
  for (const obs of observations) {
    referencedIds.add(obs.source);
    referencedIds.add(obs.target);
  }
  for (const refId of referencedIds) {
    if (!ctxMap.has(refId)) {
      ctxMap.set(refId, {
        id: refId,
        type: ContextType.Unknown,
        description: 'Referenced context — from ArchesDB relationship',
        period: 'Unknown',
      });
      warnings.push(`Created stub for ArchesDB-referenced "${refId}"`);
    }
  }

  return {
    contexts: Array.from(ctxMap.values()),
    observations,
    metadata,
    warnings,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract an HMDP Context from a CIDOC-CRM resource, or null if it's not
 * an A8 Stratigraphic Unit.
 */
function extractContext(resource: any): Context | null {
  const type = getType(resource);
  if (!type || !type.includes(A8_STRATIGRAPHIC_UNIT)) return null;

  const id = extractIdentifier(resource);
  if (!id) return null;

  return {
    id,
    type: mapCrmContextType(resource),
    description: extractDescription(resource),
    period: extractPeriod(resource),
  };
}

/** Get the resource type(s) — handles @type, type, or classified_as */
function getType(resource: any): string {
  if (!resource) return '';
  const t = resource['@type'] ?? resource.type ?? resource.classified_as ?? '';
  return Array.isArray(t) ? t.join(' ') : String(t);
}

/** Extract a stable identifier from a CRM resource */
function extractIdentifier(resource: any): string {
  const id = resource.identifier ?? resource['@id']
    ?? resource.id ?? resource.context_number
    ?? resource.label ?? '';
  return normalizeId(String(id));
}

/** Extract description from a CRM resource */
function extractDescription(resource: any): string {
  return resource.description ?? resource.dc_description
    ?? resource.interpretation ?? resource.summary
    ?? '';
}

/** Extract chronological period */
function extractPeriod(resource: any): string {
  return resource.period ?? resource.chronological_unit
    ?? resource.dc_subject ?? '';
}

/** Normalise a string ID: strip URL prefixes, brackets, whitespace */
function normalizeId(raw: string): string {
  // Strip URL prefix like "http://data.example.com/"
  const stripped = raw.replace(/^https?:\/\/[^\/]+\//, '')
    .replace(/^\[/, '').replace(/\]$/, '')
    .trim();
  return stripped;
}

/** Map CRM context type to HMDP ContextType */
function mapCrmContextType(resource: any): ContextType {
  // Check the CRM type first
  const crmType = getType(resource).toLowerCase();
  if (crmType.includes('cut') || crmType.includes('negative') || crmType.includes('interface') || crmType.includes('void')) {
    return ContextType.Negative;
  }
  if (crmType.includes('layer') || crmType.includes('fill') || crmType.includes('deposit') || crmType.includes('positive') || crmType.includes('masonry')) {
    return ContextType.Positive;
  }

  // Also check the user-defined type field (used in Arches data exports)
  const userType = String(resource.type ?? '').toLowerCase();
  if (['cut', 'pit', 'ditch', 'posthole', 'negative', 'interface', 'void'].includes(userType)) {
    return ContextType.Negative;
  }
  if (['layer', 'fill', 'deposit', 'positive', 'masonry', 'wall', 'floor', 'surface', 'natural'].includes(userType)) {
    return ContextType.Positive;
  }

  return ContextType.Unknown;
}

/** Extract relationship arrays from a CRM resource's property fields */
function getRelations(resource: any, propName: string): any[] {
  // CIDOC-CRM properties use formats like:
  // "AP13_has_stratigraphic_relation_to": [{"target": "id", "type": "above"}]
  // or: "AP13": [{"@id": "resource_id"}]
  // or nested under P2/P3 predicates
  const direct = resource[propName] ?? resource[`${propName}_has_stratigraphic_relation_to`]
    ?? resource[`${propName.toLowerCase()}`] ?? [];

  if (Array.isArray(direct)) return direct;

  // Try alternate naming: "AP13 (has stratigraphic relation to)"
  for (const key of Object.keys(resource ?? {})) {
    if (key.startsWith(propName) || key.includes(propName)) {
      const val = resource[key];
      if (Array.isArray(val)) return val;
    }
  }

  return [];
}

/** Ensure a context ID exists in the map, creating a stub if not */
function ensureCtx(map: Map<string, Context>, id: string) {
  if (!map.has(id)) {
    map.set(id, {
      id,
      type: ContextType.Unknown,
      description: undefined,
    });
  }
}
