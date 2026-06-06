/**
 * lstParser.ts — Parser for legacy BASP / ArchEd .LST format.
 *
 * The .LST (List) format is an extended ASCII text format used by the Bonn
 * Archaeological Software Package (BASP) and later by ArchEd. It encodes
 * stratigraphic units and their relationships as section-delimited text.
 *
 * exports: parseLstFile
 * used_by: ImportEngine (via import handler)
 *
 * Format variants supported:
 *   BASP classic:  *HEADING, *CONTEXT DEFINITIONS, *RELATIONS
 *   ArchEd ext:    *HEADER, *SU, *RELATION
 *   Stratify:      *HEADING, *CONTEXT, *ABOVE, *EQUAL
 *
 * Reference: stratigraphr read_lst() (R package by Joe Roe),
 *            Stratify manual (Irmela Herzog),
 *            Harris Matrix Generator Research Scope (this project)
 */

import type { Context, Observation } from '../models/hmdp';
import { ContextType, RelationshipType } from '../models/hmdp';

// ── Parse result ────────────────────────────────────────────────────────────

export interface LstParseResult {
  contexts: Context[];
  observations: Observation[];
  metadata: Record<string, string>;
  warnings: string[];
}

// ── Section types ───────────────────────────────────────────────────────────

type LstSection =
  | 'heading' | 'header'
  | 'context' | 'context_definitions' | 'su'
  | 'relations' | 'relation' | 'above' | 'equal' | 'phase'
  | 'unknown';

function detectSection(line: string): LstSection {
  const upper = line.toUpperCase().trim();
  if (upper === '*HEADING') return 'heading';
  if (upper === '*HEADER') return 'header';
  if (upper === '*CONTEXT DEFINITIONS') return 'context_definitions';
  if (upper === '*CONTEXT') return 'context';
  if (upper === '*SU') return 'su';
  if (upper === '*RELATIONS') return 'relations';
  if (upper === '*RELATION') return 'relation';
  if (upper === '*ABOVE') return 'above';
  if (upper === '*EQUAL' || upper === '*EQUALS') return 'equal';
  if (upper === '*PHASE') return 'phase';
  return 'unknown';
}

// ── Line parsing utilities ──────────────────────────────────────────────────

/**
 * Extract a quoted string: `123 "description"` → "description"
 * or the text after the ID if no quotes.
 */
function extractDescription(raw: string): string {
  const quoteMatch = raw.match(/"([^"]*)"/);
  if (quoteMatch) return quoteMatch[1].trim();

  // No quotes: take everything after the first whitespace-separated token
  const parts = raw.trim().split(/\s+/);
  if (parts.length > 1) return parts.slice(1).join(' ').trim();
  return '';
}

/**
 * Parse a JSON-like line from the ArchEd extended format.
 * e.g. {"id":"101","desc":"Topsoil"}
 */
function tryParseJsonLine(line: string): Record<string, string> | null {
  // Find JSON object in the line
  const jsonMatch = line.match(/\{.*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = String(v ?? '');
      }
      return result;
    }
  } catch {
    // Not valid JSON — try the other variant
  }
  return null;
}

/**
 * Parse a metadata line like "Key: Value" or "Key:Value"
 */
function parseMetaLine(line: string): [string, string] | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const key = line.slice(0, colonIdx).trim();
  const value = line.slice(colonIdx + 1).trim();
  if (!key || !value) return null;
  return [key, value];
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseLstFile(content: string): LstParseResult {
  const observations: Observation[] = [];
  const metadata: Record<string, string> = {};
  const warnings: string[] = [];

  const lines = content.split(/\r?\n/);
  let currentSection: LstSection = 'unknown';
  let obsIdCounter = 0;

  const nextObsId = () => {
    obsIdCounter += 1;
    return `lst-obs-${obsIdCounter}`;
  };

  const contextMap = new Map<string, Context>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    // Check for section headers
    if (trimmed.startsWith('*')) {
      currentSection = detectSection(trimmed);
      continue;
    }

    // Parse according to the current section
    switch (currentSection) {
      // ── Heading / Header: metadata key:value pairs ──────────────────
      case 'heading':
      case 'header': {
        const meta = parseMetaLine(trimmed);
        if (meta) {
          metadata[meta[0].toLowerCase()] = meta[1];
        }
        // Also try JSON format headers
        const jsonMeta = tryParseJsonLine(trimmed);
        if (jsonMeta) {
          Object.assign(metadata, jsonMeta);
        }
        break;
      }

      // ── Context definitions ────────────────────────────────────────
      case 'context_definitions':
      case 'context':
      case 'su': {
        // Try ArchEd JSON format first: {"id":"101","desc":"Topsoil"}
        const jsonCtx = tryParseJsonLine(trimmed);
        if (jsonCtx && (jsonCtx.id || jsonCtx.context_number)) {
          const id = (jsonCtx.id || jsonCtx.context_number || '').replace(/^\[/, '').replace(/\]$/, '');
          if (id) {
            contextMap.set(id, {
              id,
              type: mapLstType(jsonCtx.type || jsonCtx.context_type || jsonCtx.kind || ''),
              description: jsonCtx.desc || jsonCtx.description || jsonCtx.interpretation || '',
              period: jsonCtx.period || '',
            });
          }
          break;
        }

        // Classic format: ID "description" or ID description
        const parts = trimmed.split(/\s+/);
        const rawId = parts[0].replace(/^\[/, '').replace(/\]$/, '');
        if (rawId && rawId.length > 0) {
          // IDs can be numeric ("101"), alphanumeric ("SU001"), or string
          // Only skip if the "ID" is clearly a known keyword
          if (!['project', 'site', 'date', 'context', 'heading', 'of', 'page'].includes(rawId.toLowerCase())) {
            const desc = extractDescription(trimmed);
            contextMap.set(rawId, {
              id: rawId,
              type: ContextType.Unknown,
              description: desc || undefined,
            });
          }
        }
        break;
      }

      // ── Relations / Above: edge definitions ────────────────────────
      case 'relations':
      case 'relation':
      case 'above': {
        // Try ArchEd JSON: {"from":"101","to":"102","type":"AB"}
        const jsonRel = tryParseJsonLine(trimmed);
        if (jsonRel) {
          const source = (jsonRel.from || jsonRel.source || '').replace(/^\[/, '').replace(/\]$/, '');
          const target = (jsonRel.to || jsonRel.target || '').replace(/^\[/, '').replace(/\]$/, '');
          const relType = (jsonRel.type || jsonRel.relationshipType || '').toUpperCase();

          if (source && target) {
            observations.push({
              id: nextObsId(),
              source,
              target,
              relationshipType: mapLstRelType(relType),
            });
            ensureContexts(contextMap, [source, target]);
          }
          break;
        }

        // Classic format: "from to" or "from to type"
        const relParts = trimmed.split(/\s+/);
        if (relParts.length >= 2) {
          const src = relParts[0].replace(/^\[/, '').replace(/\]$/, '');
          const tgt = relParts[1].replace(/^\[/, '').replace(/\]$/, '');
          const dir = relParts.length >= 3 ? relParts[2].toUpperCase() : 'AB';

          if (src && tgt) {
            const relationshipType = dir === 'EQ' || dir === 'EQUALS'
              ? RelationshipType.Equals
              : dir === 'CO' || dir === 'CONTEMPORARY'
              ? RelationshipType.Contemporary
              : dir === 'BE' || dir === 'BELOW'
              ? RelationshipType.Below
              : RelationshipType.Above;

            observations.push({ id: nextObsId(), source: src, target: tgt, relationshipType });
            ensureContexts(contextMap, [src, tgt]);
          }
        }
        break;
      }

      // ── Equal: "id1 id2" → Equals relationship ────────────────────
      case 'equal': {
        const eqParts = trimmed.split(/\s+/);
        if (eqParts.length >= 2) {
          const eqSrc = eqParts[0].replace(/^\[/, '').replace(/\]$/, '');
          const eqTgt = eqParts[1].replace(/^\[/, '').replace(/\]$/, '');
          if (eqSrc && eqTgt) {
            observations.push({
              id: nextObsId(),
              source: eqSrc,
              target: eqTgt,
              relationshipType: RelationshipType.Equals,
            });
            ensureContexts(contextMap, [eqSrc, eqTgt]);
          }
        }
        break;
      }

      // ── Phase definitions (ArchEd extended) ─────────────────────────
      case 'phase': {
        const jsonPhase = tryParseJsonLine(trimmed);
        if (jsonPhase && jsonPhase.id) {
          // Phases are handled later by assignment — just create the context
          // with a period hint if available
          const phaseId = jsonPhase.id;
          const phaseName = jsonPhase.name || phaseId;
          metadata[`phase:${phaseId}`] = phaseName;
        }
        break;
      }

      default: {
        // Unknown section — try to detect inline metadata
        const inlineMeta = parseMetaLine(trimmed);
        if (inlineMeta && !metadata[inlineMeta[0].toLowerCase()]) {
          metadata[inlineMeta[0].toLowerCase()] = inlineMeta[1];
        }
        break;
      }
    }
  }

  // Convert context map to array
  const allContexts = Array.from(contextMap.values());

  // Cross-reference: ensure all context IDs referenced in observations exist
  const referencedIds = new Set<string>();
  for (const obs of observations) {
    referencedIds.add(obs.source);
    referencedIds.add(obs.target);
  }
  for (const refId of referencedIds) {
    if (!contextMap.has(refId)) {
      allContexts.push({
        id: refId,
        type: ContextType.Unknown,
        description: 'Referenced context — imported via legacy .LST',
        period: 'Unknown',
      });
      warnings.push(`Created stub for referenced context "${refId}"`);
    }
  }

  return {
    contexts: allContexts,
    observations,
    metadata,
    warnings,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Ensure the listed context IDs exist in the context map.
 * Creates stubs for any that don't exist yet.
 */
function ensureContexts(contextMap: Map<string, Context>, ids: string[]) {
  for (const id of ids) {
    if (!contextMap.has(id)) {
      contextMap.set(id, {
        id,
        type: ContextType.Unknown,
        description: undefined,
      });
    }
  }
}

/**
 * Map LST type strings to HMDP ContextType.
 */
function mapLstType(type: string): ContextType {
  const lower = (type || '').toLowerCase().trim();
  if (['negative', 'cut', 'pit', 'ditch', 'posthole', 'interface', 'void'].includes(lower)) {
    return ContextType.Negative;
  }
  if (['positive', 'layer', 'fill', 'deposit', 'masonry', 'wall', 'floor', 'surface', 'natural'].includes(lower)) {
    return ContextType.Positive;
  }
  return ContextType.Unknown;
}

/**
 * Map LST relation type string to HMDP RelationshipType.
 */
function mapLstRelType(type: string): RelationshipType {
  const upper = (type || '').toUpperCase().trim();
  if (['EQ', 'EQUALS', 'EQUAL', 'SAME_AS'].includes(upper)) return RelationshipType.Equals;
  if (['CO', 'CONTEMPORARY', 'CONT'].includes(upper)) return RelationshipType.Contemporary;
  if (['BE', 'BELOW', 'UNDER'].includes(upper)) return RelationshipType.Below;
  // AB, ABOVE, OVER, CUTS, or default
  return RelationshipType.Above;
}
