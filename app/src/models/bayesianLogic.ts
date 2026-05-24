/**
 * bayesianLogic.ts — Implements the Dye and Buck algorithm for Bayesian prior generation.
 * exports: generateOxCalScript
 * rules:
 * - Pure function: takes contexts/observations, returns OxCal CQL string.
 * - Must use transitiveReduction to prevent over-constraining the MCMC model.
 * - Edges represent chronological flow: Older -> Younger.
 */

import type { Context, Observation, Event } from './hmdp';
import { RelationshipType } from './hmdp';
import { transitiveReduction } from './graphLogic';

export function generateOxCalScript(contexts: Context[], observations: Observation[], events: Event[] = []): string {
  // 1. Build Adjacency List representing chronological flow (Older -> Younger)
  const adj: Record<string, string[]> = {};
  contexts.forEach(c => {
    adj[c.id] = [];
  });

  observations.forEach(obs => {
    if (obs.relationshipType === RelationshipType.Above) {
      // source is above target (target is older than source)
      if (adj[obs.target]) {
        adj[obs.target].push(obs.source);
      }
    } else if (obs.relationshipType === RelationshipType.Below) {
      // source is below target (source is older than target)
      if (adj[obs.source]) {
        adj[obs.source].push(obs.target);
      }
    }
  });

  // 2. Apply Transitive Reduction (Dye & Buck Algorithm Step 5)
  // This removes redundant chronological paths (e.g., A->C if A->B->C exists)
  const reducedAdj = transitiveReduction(adj);

  // 3. Serialize to OxCal CQL
  let script = `Plot("StratiGraph Bayesian Export") {\n`;
  script += `  // Generated via Dye & Buck Algorithm (Transitively Reduced)\n\n`;

  // Step 3a: Define all contexts as bounded duration Sequences
  script += `  // --- CONTEXT DEFINITIONS ---\n`;
  contexts.forEach(c => {
    // Sanitize context ID for OxCal compatibility (alphanumeric and underscores)
    const safeId = c.id.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Find associated events for this context
    const ctxEvents = events.filter(e => String(e.contextId) === String(c.id));
    
    script += `  Sequence("Context_${safeId}") {\n`;
    script += `    Boundary("Start_${safeId}");\n`;
    script += `    Phase("Events_${safeId}") {\n`;
    
    if (ctxEvents.length > 0) {
      ctxEvents.forEach(e => {
        const safeName = e.name.replace(/[^a-zA-Z0-9_ -]/g, '');
        if (e.rDate) {
          // Check if it's a standard C14 date "1000, 25"
          const rDateParts = e.rDate.split(',').map(s => s.trim());
          if (rDateParts.length === 2 && !isNaN(Number(rDateParts[0])) && !isNaN(Number(rDateParts[1]))) {
            script += `      R_Date("${safeName}", ${rDateParts[0]}, ${rDateParts[1]});\n`;
          } else {
            script += `      // Unknown Date format: ${e.rDate}\n`;
            script += `      Date("${safeName}", ${e.rDate});\n`;
          }
        } else {
          // If no date, just drop it as an empty Item
          script += `      Item("${safeName}");\n`;
        }
      });
    } else {
      script += `      // (No radiocarbon events for ${c.id})\n`;
    }
    
    script += `    };\n`;
    script += `    Boundary("End_${safeId}");\n`;
    script += `  };\n\n`;
  });

  // Step 3b: Define Topological Constraints
  script += `  // --- STRATIGRAPHIC RELATIONSHIPS (Older -> Younger) ---\n`;
  let hasRelationships = false;

  Object.keys(reducedAdj).forEach(olderId => {
    const safeOlderId = olderId.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // De-duplicate targets just in case
    const uniqueYounger = Array.from(new Set(reducedAdj[olderId]));
    
    uniqueYounger.forEach(youngerId => {
      const safeYoungerId = youngerId.replace(/[^a-zA-Z0-9_]/g, '_');
      hasRelationships = true;
      
      // In OxCal, cross-referencing boundaries in a Sequence enforces temporal order
      script += `  Sequence() {\n`;
      script += `    Boundary("=End_${safeOlderId}");\n`;
      script += `    Boundary("=Start_${safeYoungerId}");\n`;
      script += `  };\n`;
    });
  });

  if (!hasRelationships) {
    script += `  // No stratigraphic relationships found.\n`;
  }

  script += `};\n`;

  return script;
}
