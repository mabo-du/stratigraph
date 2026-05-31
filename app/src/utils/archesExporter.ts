/**
 * archesExporter.ts — Export HMDP to ArchesDB CIDOC-CRM JSON.
 * exports: exportArchesJson
 * used_by: Toolbar/index.tsx
 */

import type { Context, Observation } from '../models/hmdp';
import { RelationshipType } from '../models/hmdp';

export function exportArchesJson(contexts: Context[], observations: Observation[]): string {
  const nodes = [];
  const edges = [];

  // Map Contexts to Arches CRM nodes (A8 Stratigraphic Unit)
  for (const ctx of contexts) {
    nodes.push({
      id: ctx.id,
      name: ctx.description || `SU ${ctx.id}`,
      type: 'A8_Stratigraphic_Unit',
      hmdp_type: ctx.type,
      properties: {
        description: ctx.description || '',
        spatial: ctx.spatial ? JSON.stringify(ctx.spatial) : null,
      }
    });
  }

  // Map Observations to CRM relationships (e.g., P73_has_translation/spatial relations)
  // For standard stratigraphic mappings:
  // Above -> 'P46_is_composed_of' or custom 'is_above'
  // In Arches, we often use generic CRM links or specific extensions. We'll output a structured relationship.
  for (const obs of observations) {
    let relLabel = '';
    switch (obs.relationshipType) {
      case RelationshipType.Above:
        relLabel = 'is_above';
        break;
      case RelationshipType.Below:
        relLabel = 'is_below';
        break;
      case RelationshipType.Contemporary:
        relLabel = 'is_contemporary_with';
        break;
      case RelationshipType.Equals:
        relLabel = 'is_equal_to';
        break;
    }

    edges.push({
      id: obs.id,
      source: obs.source,
      target: obs.target,
      relationship: relLabel,
    });
  }

  const payload = {
    graph_id: 'strati-graph-export',
    nodes,
    edges,
    exported_at: new Date().toISOString(),
  };

  return JSON.stringify(payload, null, 2);
}
