/**
 * semanticGraph.ts — HMDP → CIDOC-CRM triple converter + Oxigraph store.
 *
 * Uses Oxigraph WASM to create an in-browser RDF triple store from the
 * Harris Matrix Data Package, enabling SPARQL queries and LLM ingestion.
 *
 * exports: buildStore(), hmdpToTurtle(), queryStore(), extractRelations()
 */

import type { Context, Observation, Phase, Event } from './hmdp';

// CIDOC-CRM / CRMarchaeo namespaces
const CRM = 'http://www.cidoc-crm.org/cidoc-crm/';
const CRMARCH = 'http://www.cidoc-crm.org/crmarchaeo/';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

/** Prefix declarations for Turtle output */
export const PREFIXES = `\
@prefix crm: <${CRM}> .
@prefix archaeo: <${CRMARCH}> .
@prefix rdfs: <${RDFS}> .
@prefix xsd: <${XSD}> .
@prefix site: <http://stratigraph.app/site/> .
`;

function iri(suffix: string): string {
  return `site:${suffix}`;
}

function escapeTurtle(s: string): string {
  return `"${s.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/**
 * Convert HMDP contexts, observations, phases, and events into Turtle RDF.
 * Uses CRMarchaeo for stratigraphic relationships.
 */
export function hmdpToTurtle(
  contexts: Context[],
  observations: Observation[],
  phases: Phase[],
  events: Event[]
): string {
  const triples: string[] = [PREFIXES];

  // ── Phases ───────────────────────────────────────────────────────────
  for (const p of phases) {
    triples.push(`${iri(p.id)} a crm:E4_Period ;`);
    triples.push(`  rdfs:label ${escapeTurtle(p.name)} .\n`);
  }

  // ── Contexts ─────────────────────────────────────────────────────────
  for (const ctx of contexts) {
    triples.push(`${iri(ctx.id)} a archaeo:A8_Stratigraphic_Unit ;`);
    triples.push(`  rdfs:label ${escapeTurtle(ctx.id)} ;`);
    triples.push(`  crm:P2_has_type ${escapeTurtle(ctx.type || 'Unknown')} ;`);

    if (ctx.description) {
      triples.push(`  crm:P3_has_note ${escapeTurtle(ctx.description)} ;`);
    }
    if (ctx.phase) {
      triples.push(`  crm:P89_falls_within ${iri(ctx.phase)} ;`);
    }
    if (ctx.period) {
      triples.push(`  crm:P78_is_identified_by ${escapeTurtle(ctx.period)} ;`);
    }
    if (ctx.spatial?.centroid) {
      const { x, y, z } = ctx.spatial.centroid;
      triples.push(`  crm:P168i_is_defined_by "${x},${y}${z !== undefined ? ',' + z : ''}"^^xsd:string ;`);
    }
    // End with period instead of semicolon
    triples.push(`  .\n`);
  }

  // ── Observations (Stratigraphic Relations) ───────────────────────────
  for (const obs of observations) {
    const relType = obs.relationshipType;
    triples.push(`${iri(obs.id)} a archaeo:A9_Stratigraphic_Relation ;`);
    triples.push(`  crm:P3_has_note ${escapeTurtle(`${obs.source} ${relType} ${obs.target}`)} ;`);

    // Map relationship type to CRM property
    if (relType === 'Above' || relType === 'Below') {
      if (relType === 'Above') {
        triples.push(`  crm:P9_forms_part_of ${iri(obs.source)} ;`);
        triples.push(`  crm:P10i_contains ${iri(obs.target)} ;`);
      } else {
        triples.push(`  crm:P9_forms_part_of ${iri(obs.target)} ;`);
        triples.push(`  crm:P10i_contains ${iri(obs.source)} ;`);
      }
    } else if (relType === 'Equals') {
      triples.push(`  crm:P48_has_preferred_identifier ${iri(obs.source)} ;`);
      triples.push(`  crm:P48_has_preferred_identifier ${iri(obs.target)} ;`);
    } else if (relType === 'Contemporary') {
      triples.push(`  crm:P9i_forms_part_of ${iri(obs.source)} ;`);
      triples.push(`  crm:P9_forms_part_of ${iri(obs.target)} ;`);
    }

    triples.push(`  .\n`);
  }

  // ── Events (C14 dates, observations) ─────────────────────────────────
  for (const ev of events) {
    const ctxId = String(ev.contextId);
    triples.push(`${iri(ev.id)} a crm:S4_Observation ;`);
    triples.push(`  rdfs:label ${escapeTurtle(ev.name || ev.id)} ;`);
    if (ev.rDate) {
      triples.push(`  crm:P3_has_note ${escapeTurtle(`C14: ${ev.rDate} BP`)} ;`);
    }
    triples.push(`  crm:P25i_measured ${iri(ctxId)} ;`);
    triples.push(`  .\n`);
  }

  return triples.join('\n');
}

/**
 * Pre-built SPARQL query templates for common stratigraphic questions.
 */
export const QUERY_TEMPLATES: Record<string, string> = {
  'All contexts': `
    SELECT ?context ?label ?type WHERE {
      ?context a archaeo:A8_Stratigraphic_Unit .
      OPTIONAL { ?context rdfs:label ?label . }
      OPTIONAL { ?context crm:P2_has_type ?type . }
    } ORDER BY ?context
  `,

  'Stratigraphic relationships': `
    SELECT ?source ?target ?note WHERE {
      ?rel a archaeo:A9_Stratigraphic_Relation .
      ?rel crm:P3_has_note ?note .
      ?rel crm:P9_forms_part_of ?source .
      ?rel crm:P10i_contains ?target .
    } ORDER BY ?source
  `,

  'Phases and their contexts': `
    SELECT ?phase ?phaseName ?context WHERE {
      ?phase a crm:E4_Period .
      OPTIONAL { ?phase rdfs:label ?phaseName . }
      ?context crm:P89_falls_within ?phase .
    } ORDER BY ?phase ?context
  `,

  'C14 dated contexts': `
    SELECT ?context ?event ?note WHERE {
      ?event a crm:S4_Observation .
      ?event crm:P25i_measured ?context .
      OPTIONAL { ?event crm:P3_has_note ?note . }
    } ORDER BY ?context
  `,
};

/**
 * Extract all unique entities and their labels from the triple store
 * for LLM context injection.
 */
export function extractRelations(
  contexts: Context[],
  observations: Observation[],
): { summary: string; adjacency: string } {
  const adj = new Map<string, string[]>();
  for (const ctx of contexts) adj.set(ctx.id, []);

  for (const obs of observations) {
    if (obs.relationshipType === 'Above') {
      adj.get(obs.source)?.push(`above:${obs.target}`);
      adj.get(obs.target)?.push(`below:${obs.source}`);
    } else if (obs.relationshipType === 'Below') {
      adj.get(obs.source)?.push(`below:${obs.target}`);
      adj.get(obs.target)?.push(`above:${obs.source}`);
    }
  }

  const lines: string[] = ['Stratigraphic Graph Summary:', ''];
  for (const [id, rels] of adj) {
    if (rels.length > 0) {
      lines.push(`  ${id}: ${rels.join(', ')}`);
    }
  }

  return {
    summary: lines.join('\n'),
    adjacency: JSON.stringify(Object.fromEntries(adj), null, 0),
  };
}

/**
 * Build an in-memory Oxigraph store from HMDP data and execute a SPARQL query.
 * Returns the raw result as JSON for display.
 */
let _store: any = null;

export async function buildStore(
  contexts: Context[],
  observations: Observation[],
  phases: Phase[],
  events: Event[]
): Promise<any> {
  const oxigraph = await import('oxigraph');
  const store = new oxigraph.Store();
  
  const turtle = hmdpToTurtle(contexts, observations, phases, events);
  store.load(turtle, { format: 'text/turtle' });
  
  _store = store;
  return store;
}

export async function queryStore(sparql: string): Promise<any[]> {
  if (!_store) return [];
  const results = _store.query(sparql);
  const bindings: any[] = [];
  
  for (const binding of results) {
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(binding) as [string, any][]) {
      row[key] = value?.value || String(value);
    }
    bindings.push(row);
  }
  
  return bindings;
}

export function clearStore(): void {
  _store = null;
}
