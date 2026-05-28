/**
 * trowelExport.ts — Trowel-compatible EEDP export.
 *
 * Produces the exact JSON schema expected by Trowel's src/eedp.py
 * EedpDocument/EedpPath/EedpPathStep data classes.
 *
 * exports: generateTrowelEedp
 * used_by: App.tsx → Export menu
 */

import type { Context, Observation, Event } from '../models/hmdp';
import { RelationshipType, ContextType } from '../models/hmdp';
import { transitiveReduction } from '../models/graphLogic';

interface TrowelStep {
  context_number: string;
  type: string;
  description: string;
  period: string;
  depth_min: number | null;
  depth_max: number | null;
  dating_events: string[];
}

interface TrowelPath {
  path_id: string;
  steps: TrowelStep[];
}

interface TrowelDocument {
  version: string;
  site_name: string;
  paths: TrowelPath[];
}

/**
 * Generate a Trowel-compatible EEDP JSON string.
 * Schema matches Trowel's src/eedp.py EedpDocument dataclass.
 */
export function generateTrowelEedp(
  projectName: string,
  contexts: Context[],
  observations: Observation[],
  events: Event[] = [],
): string {
  // Build Youngest -> Oldest adjacency (Above = younger above older)
  const adj: Record<string, string[]> = {};
  contexts.forEach(c => { adj[c.id] = []; });

  const directionalObs = observations.filter(
    o => o.relationshipType === RelationshipType.Above || o.relationshipType === RelationshipType.Below,
  );
  directionalObs.forEach(obs => {
    if (obs.relationshipType === RelationshipType.Above) {
      if (adj[obs.source]) adj[obs.source].push(obs.target);
    } else if (obs.relationshipType === RelationshipType.Below) {
      if (adj[obs.target]) adj[obs.target].push(obs.source);
    }
  });

  const reducedAdj = transitiveReduction(adj);

  // Find roots (youngest — no incoming edges)
  const inDegree: Record<string, number> = {};
  contexts.forEach(c => { inDegree[c.id] = 0; });
  Object.keys(reducedAdj).forEach(node => {
    reducedAdj[node].forEach(child => {
      if (inDegree[child] !== undefined) inDegree[child]++;
    });
  });
  const roots = contexts.filter(c => inDegree[c.id] === 0);
  const ctxMap = new Map(contexts.map(c => [c.id, c]));

  const paths: TrowelPath[] = [];
  let pathCounter = 0;

  const eventMap = new Map<string, Event[]>();
  for (const e of events) {
    const key = String(e.contextId);
    if (!eventMap.has(key)) eventMap.set(key, []);
    eventMap.get(key)!.push(e);
  }

  const dfs = (currentId: string, currentPath: TrowelStep[], pathId: string) => {
    const context = ctxMap.get(currentId);
    if (!context) return;

    const ctxEvents = eventMap.get(currentId) || [];
    const depthMin = null;  // Not available in HMDP model
    const depthMax = null;

    currentPath.push({
      context_number: context.id,
      type: typeLabel(context.type),
      description: context.description || '',
      period: context.period || '',
      depth_min: depthMin,
      depth_max: depthMax,
      dating_events: ctxEvents.map(e => {
        if (e.rDate) return `${e.name} (${e.rDate})`;
        return e.name;
      }),
    });

    const children = reducedAdj[currentId] || [];
    if (children.length === 0) {
      paths.push({ path_id: pathId, steps: [...currentPath] });
    } else {
      children.forEach(childId => {
        dfs(childId, [...currentPath], pathId);
      });
    }
  };

  roots.forEach(root => {
    pathCounter++;
    dfs(root.id, [], `Sequence ${pathCounter}`);
  });

  const doc: TrowelDocument = {
    version: '1.0',
    site_name: projectName || 'Untitled Project',
    paths,
  };

  return JSON.stringify(doc, null, 2);
}

function typeLabel(type: ContextType): string {
  if (type === ContextType.Positive) return 'deposit';
  if (type === ContextType.Negative) return 'cut';
  return 'unknown';
}
