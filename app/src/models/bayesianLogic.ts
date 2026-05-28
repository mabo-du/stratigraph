/**
 * bayesianLogic.ts — Implements the Dye and Buck algorithm for Bayesian prior generation.
 * exports: generateOxCalScript, generateLibbyPayload
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

// ── Libby JSON Export ────────────────────────────────────────────────────────

/**
 * Generate a structured JSON payload for Libby's calibration API.
 * Includes phases with stratigraphic constraints, radiocarbon events,
 * and metadata. Designed for direct POST to Libby's /api/calibrate endpoint.
 */
export function generateLibbyPayload(
  projectName: string,
  contexts: Context[],
  observations: Observation[],
  events: Event[] = [],
): string {
  // 1. Build Older -> Younger adjacency
  const adj: Record<string, string[]> = {};
  contexts.forEach(c => { adj[c.id] = []; });

  observations.forEach(obs => {
    if (obs.relationshipType === RelationshipType.Above) {
      if (adj[obs.target]) adj[obs.target].push(obs.source);
    } else if (obs.relationshipType === RelationshipType.Below) {
      if (adj[obs.source]) adj[obs.source].push(obs.target);
    }
  });

  const reducedAdj = transitiveReduction(adj);

  // 2. Build phase groups with constraints
  const contextPhases = new Map<string, string>();
  contexts.forEach(c => {
    if (c.phase) contextPhases.set(c.id, c.phase);
  });

  // Collect constraints as older -> younger boundary pairs
  type Constraint = { older: string; younger: string };
  const constraints: Constraint[] = [];
  Object.keys(reducedAdj).forEach(olderId => {
    const unique = Array.from(new Set(reducedAdj[olderId]));
    unique.forEach(youngerId => {
      constraints.push({ older: olderId, younger: youngerId });
    });
  });

  // 3. Pack C14 events
  const c14Dates = events
    .filter(e => e.rDate && e.type === 'C14')
    .map(e => {
      const parts = e.rDate!.split(',').map(s => s.trim());
      if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
        return {
          labId: e.id,
          contextId: e.contextId,
          name: e.name,
          bp: Number(parts[0]),
          sigma: Number(parts[1]),
        };
      }
      // Unstructured date string
      return { labId: e.id, contextId: e.contextId, name: e.name, raw: e.rDate };
    });

  const payload = {
    libby: {
      version: '1.0',
      project: projectName || 'Untitled',
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      totalContexts: contexts.length,
      totalRelationships: observations.length,
      totalEvents: events.length,
      totalConstraints: constraints.length,
    },
    contexts: contexts.map(c => ({
      id: c.id,
      type: c.type,
      phase: c.phase || null,
      period: c.period || null,
    })),
    phases: extractPhases(contexts),
    constraints,
    dates: c14Dates,
    oxcal: generateOxCalScript(contexts, observations, events),
  };

  return JSON.stringify(payload, null, 2);
}

function extractPhases(contexts: Context[]): { id: string; contexts: string[] }[] {
  const phaseMap = new Map<string, string[]>();
  for (const ctx of contexts) {
    if (!ctx.phase) continue;
    if (!phaseMap.has(ctx.phase)) phaseMap.set(ctx.phase, []);
    phaseMap.get(ctx.phase)!.push(ctx.id);
  }
  return Array.from(phaseMap.entries()).map(([id, ctxIds]) => ({ id, contexts: ctxIds }));
}
