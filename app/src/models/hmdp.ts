/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * hmdp.ts — Core Harris Matrix Data Package (HMDP) definitions.
 * exports: Context, Observation, DataPackage, RelationshipType, ContextType, Phase
 * used_by: csvParser.ts → mappings, graphLogic.ts → DAG generation
 * rules:
 * - Must adhere to Frictionless Data HMDP standard.
 */

export const RelationshipType = {
  Above: 'Above',
  Below: 'Below',
  Equals: 'Equals',
  Contemporary: 'Contemporary'
} as const;

export type RelationshipType = typeof RelationshipType[keyof typeof RelationshipType];

export const ContextType = {
  Positive: 'Positive', // layers, fills, masonry
  Negative: 'Negative', // cuts, pits
  Unknown: 'Unknown'
} as const;

export type ContextType = typeof ContextType[keyof typeof ContextType];

export interface SpatialMetadata {
  crs?: string;         // e.g. "EPSG:4326"
  centroid?: { x: number; y: number; z?: number };
  boundingBox?: { minX: number; minY: number; minZ?: number; maxX: number; maxY: number; maxZ?: number };
  geoJSON?: any;        // e.g. FeatureCollection
}

export interface Context {
  id: string;          // The unique unit identifier (SU_number)
  type: ContextType;
  description?: string;
  period?: string;
  phase?: string;      // Phase ID reference
  spatial?: SpatialMetadata;
  photoUrl?: string;   // Optional image URL for node display
}

export interface Observation {
  id: string;          // Generated uuid or observation ID
  source: string;      // Context ID (Unit 1)
  target: string;      // Context ID (Unit 2)
  relationshipType: RelationshipType;
}

export interface Phase {
  id: string;
  name: string;
  color: string;
}

export interface Event {
  id: string;          // e.g. Lab Number "Beta-12345"
  contextId: string;   // The context it belongs to
  name: string;        // Human readable name (e.g. "Charcoal Lens")
  rDate?: string;      // Optional radiocarbon date string "1000, 25"
  type?: string;       // "C14", "Coin", "TL"
}

export interface DataPackage {
  name: string;
  created: string;
  contexts: Context[];
  observations: Observation[];
  phases: Phase[];
  events: Event[];
}
