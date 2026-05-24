/**
 * hoardExport.ts — End-to-End DAG-Path (EEDP) extraction for AI payload generation.
 * exports: extractEEDPPaths, generateHoardMarkdown, generateHoardJson
 * rules:
 * - Pure functions.
 * - Extracts all linear paths from roots (youngest) to leaves (oldest).
 */

import type { Context, Observation, Event } from './hmdp';
import { RelationshipType } from './hmdp';
import { transitiveReduction } from './graphLogic';

export interface EEDPPath {
  nodes: Context[];
  events: Event[][]; // events[i] corresponds to nodes[i]
}

export function extractEEDPPaths(
  contexts: Context[],
  observations: Observation[],
  events: Event[] = []
): EEDPPath[] {
  // 1. Build strict Youngest -> Oldest adjacency list
  // Only consider directional edges to form the DAG
  const directionalObs = observations.filter(
    o => o.relationshipType === RelationshipType.Above || o.relationshipType === RelationshipType.Below
  );
  
  // Create an adjacency list where A -> B means A is Above B (A is younger)
  const adj: Record<string, string[]> = {};
  contexts.forEach(c => adj[c.id] = []);
  
  directionalObs.forEach(obs => {
    if (obs.relationshipType === RelationshipType.Above) {
      if (adj[obs.source]) adj[obs.source].push(obs.target);
    } else if (obs.relationshipType === RelationshipType.Below) {
      if (adj[obs.target]) adj[obs.target].push(obs.source);
    }
  });

  // 2. Perform transitive reduction to simplify the paths to only direct physical relationships
  const reducedAdj = transitiveReduction(adj);

  // 3. Find Roots (nodes with in-degree 0)
  const inDegree: Record<string, number> = {};
  contexts.forEach(c => inDegree[c.id] = 0);
  
  Object.keys(reducedAdj).forEach(node => {
    reducedAdj[node].forEach(child => {
      if (inDegree[child] !== undefined) {
        inDegree[child]++;
      }
    });
  });

  const roots = contexts.filter(c => inDegree[c.id] === 0);
  
  // Context lookup map
  const ctxMap = new Map<string, Context>(contexts.map(c => [c.id, c]));
  
  // 4. DFS to extract all paths
  const paths: EEDPPath[] = [];
  
  const dfs = (currentId: string, currentPath: Context[], currentEvents: Event[][]) => {
    const context = ctxMap.get(currentId);
    if (!context) return;
    
    currentPath.push(context);
    const ctxEvents = events.filter(e => String(e.contextId) === String(context.id));
    currentEvents.push(ctxEvents);
    
    const children = reducedAdj[currentId] || [];
    if (children.length === 0) {
      // Leaf node reached — store the completed path
      paths.push({
        nodes: [...currentPath],
        events: [...currentEvents]
      });
    } else {
      // Continue down the branches
      children.forEach(childId => {
        dfs(childId, [...currentPath], [...currentEvents]);
      });
    }
  };

  roots.forEach(root => {
    dfs(root.id, [], []);
  });

  return paths;
}

export function generateHoardMarkdown(
  projectName: string,
  contexts: Context[],
  observations: Observation[],
  events: Event[] = []
): string {
  const paths = extractEEDPPaths(contexts, observations, events);
  
  let md = `# Stratigraphic Matrix: ${projectName || 'Untitled Project'}\n\n`;
  md += `Below is the End-to-End DAG-Path (EEDP) representation of the stratigraphic matrix.\n`;
  md += `Each path represents a strictly linear chronological sequence from youngest (top) to oldest (bottom).\n\n`;
  
  paths.forEach((path, index) => {
    md += `## Path ${index + 1}\n`;
    path.nodes.forEach((node, i) => {
      const typeLabel = node.type !== 'Unknown' ? ` [${node.type}]` : '';
      const descLabel = node.description ? ` - ${node.description}` : '';
      
      let eventStr = '';
      const nodeEvents = path.events[i];
      if (nodeEvents && nodeEvents.length > 0) {
        const eStrs = nodeEvents.map(e => {
          let s = `Event: ${e.name}`;
          if (e.rDate) s += ` (${e.rDate})`;
          return s;
        });
        eventStr = ` { ${eStrs.join(', ')} }`;
      }
      
      md += `${i + 1}. SU ${node.id}${typeLabel}${descLabel}${eventStr}\n`;
    });
    md += `\n`;
  });
  
  return md;
}

export function generateHoardJson(
  projectName: string,
  contexts: Context[],
  observations: Observation[],
  events: Event[] = []
): string {
  const paths = extractEEDPPaths(contexts, observations, events);
  
  const payload = {
    project: projectName || 'Untitled Project',
    schema: "EEDP-v1",
    paths: paths.map(p => ({
      sequence: p.nodes.map((n, i) => ({
        id: n.id,
        type: n.type,
        description: n.description,
        events: p.events[i].map(e => ({
          id: e.id,
          name: e.name,
          date: e.rDate,
          type: e.type
        }))
      }))
    }))
  };
  
  return JSON.stringify(payload, null, 2);
}
