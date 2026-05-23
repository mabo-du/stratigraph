/**
 * csvParser.ts — Utilities for parsing raw archaeological CSV exports
 * exports: parseCsvFile, applyContextMapping, applyObservationMapping
 * used_by: ImportEngine UI
 * rules:
 * - Handle messy field data gracefully.
 * - Normalize mapped fields to HMDP standard.
 */

import Papa from 'papaparse';
import { ContextType, RelationshipType } from '../models/hmdp';
import type { Context, Observation } from '../models/hmdp';

export interface ParseResult {
  headers: string[];
  rows: Record<string, any>[];
}

/**
 * Reads a File object and parses it via PapaParse.
 * Expects the first row to be headers.
 */
export function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields || [],
          rows: results.data as Record<string, any>[]
        });
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

export interface ContextMapping {
  idColumn: string;
  typeColumn?: string;
  descriptionColumn?: string;
}

export interface ObservationMapping {
  sourceColumn: string;
  targetColumn: string;
  relationshipColumn?: string;
  // If relationshipColumn is not provided, we assume default 'Above' direction 
  // or that the file specifically only denotes one type of relation
  defaultRelationship?: RelationshipType;
}

/**
 * Normalizes an arbitrary string into a standard ContextType.
 * Examples: 'cut', 'pit', 'negative' -> ContextType.Negative
 */
function normalizeContextType(val: string): ContextType {
  const lower = (val || '').toLowerCase().trim();
  if (lower === 'cut' || lower === 'pit' || lower === 'negative' || lower === 'interface') {
    return ContextType.Negative;
  }
  if (lower === 'layer' || lower === 'fill' || lower === 'deposit' || lower === 'masonry' || lower === 'positive') {
    return ContextType.Positive;
  }
  return ContextType.Unknown;
}

/**
 * Normalizes an arbitrary string into a standard RelationshipType.
 */
function normalizeRelationshipType(val: string, fallback: RelationshipType): RelationshipType {
  const lower = (val || '').toLowerCase().trim();
  if (lower === 'above' || lower === 'over' || lower === 'later' || lower === 'cuts') {
    return RelationshipType.Above;
  }
  if (lower === 'below' || lower === 'under' || lower === 'earlier' || lower === 'cut by') {
    return RelationshipType.Below;
  }
  if (lower === 'equals' || lower === 'same as' || lower === 'equivalent') {
    return RelationshipType.Equals;
  }
  if (lower === 'contemporary' || lower === 'contemporary with' || lower === 'bonded') {
    return RelationshipType.Contemporary;
  }
  return fallback;
}

export function applyContextMapping(rows: Record<string, any>[], mapping: ContextMapping): Context[] {
  return rows.map((row) => ({
    id: String(row[mapping.idColumn] || '').trim(),
    type: mapping.typeColumn ? normalizeContextType(row[mapping.typeColumn]) : ContextType.Unknown,
    description: mapping.descriptionColumn ? row[mapping.descriptionColumn] : undefined
  })).filter(c => c.id); // Must have an ID
}

export function applyObservationMapping(rows: Record<string, any>[], mapping: ObservationMapping): Observation[] {
  return rows.map((row) => {
    const source = String(row[mapping.sourceColumn] || '').trim();
    const target = String(row[mapping.targetColumn] || '').trim();
    const relType = mapping.relationshipColumn 
      ? normalizeRelationshipType(row[mapping.relationshipColumn], mapping.defaultRelationship || RelationshipType.Above)
      : (mapping.defaultRelationship || RelationshipType.Above);

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      source,
      target,
      relationshipType: relType
    };
  }).filter(o => o.source && o.target); // Both ends of the edge must be present
}
