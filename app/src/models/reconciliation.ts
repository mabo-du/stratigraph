/**
 * reconciliation.ts — Conflict-Free Replicated Data Type (CRDT) DAG reconciliation.
 * exports: performPostMergeReduction, resolveQuarantine
 * used_by: room.ts → sync intercept, Sidebar/ConflictPanel.tsx
 * rules:
 * - Must wrap writes in `ydoc.transact(() => {}, 'post-merge-reduction')`.
 * - Uses Y.encodeStateVector for logical causality instead of Date.now().
 * - Adheres strictly to 'first resolution wins' for cycle breaking.
 */

import * as Y from 'yjs';
import type { Observation, RelationshipType } from './hmdp';
import { buildAdjacencyList, findCyclePath, transitiveReduction } from './graphLogic';

export interface QuarantinedEdge {
  source: string;
  target: string;
  relationshipType: RelationshipType;
  logicalClock: Uint8Array;
  peerId: string;
}

/**
 * Runs asynchronously/debounced after Yjs merges.
 * Performs a deterministic topology check and transitive reduction.
 */
export function performPostMergeReduction(ydoc: Y.Doc, localPeerId: string) {
  const observationsMap = ydoc.getMap<Observation>('observations');
  const quarantineMap = ydoc.getMap<QuarantinedEdge>('quarantined_edges');
  
  // Extract all active observations
  const observations = Array.from(observationsMap.values());
  
  // Build directed graph
  const adj = buildAdjacencyList(observations);
  
  // 1. Detect Cycles
  const cyclePath = findCyclePath(adj);
  if (cyclePath) {
    // We found a cycle. 
    // Quarantine the edge that closes the cycle (the last added observation? Or just all edges in the cycle?)
    // In a pure CRDT, we quarantine all edges in the cycle to let users resolve it, 
    // or we can just isolate the conflicting ones. Let's quarantine the entire cycle's edges
    // so the user can pick which one to break.
    
    const clockSnapshot = Y.encodeStateVector(ydoc);
    
    ydoc.transact(() => {
      for (let i = 0; i < cyclePath.length - 1; i++) {
        const u = cyclePath[i];
        const v = cyclePath[i+1];
        
        // Find observation id corresponding to this edge
        const obsEntry = Array.from(observationsMap.entries()).find(
          ([, obs]) => (obs.source === u && obs.target === v) || (obs.source === v && obs.target === u)
        );
        
        if (obsEntry) {
          const [obsId, obs] = obsEntry;
          const edgeId = `${obs.source}::${obs.target}`;
          
          if (!quarantineMap.has(edgeId)) {
            quarantineMap.set(edgeId, {
              source: obs.source,
              target: obs.target,
              relationshipType: obs.relationshipType,
              logicalClock: clockSnapshot,
              peerId: localPeerId
            });
            // Remove from active observations to break the cycle
            observationsMap.delete(obsId);
          }
        }
      }
    }, 'post-merge-reduction');
    
    // Stop here and wait for manual resolution. 
    // Don't run transitive reduction while the graph is structurally broken (in quarantine state).
    return;
  }
  
  // 2. Transitive Reduction (Dye & Buck)
  // Rebuild the adjacency list after potential quarantine
  const currentObservations = Array.from(observationsMap.values());
  const validAdj = buildAdjacencyList(currentObservations);
  
  const reducedAdj = transitiveReduction(validAdj);
  
  // Find which observations need to be removed
  // An observation is redundant if its directed edge exists in validAdj but NOT in reducedAdj.
  const redundantObsIds: string[] = [];
  
  for (const obs of currentObservations) {
    // Only Above/Below are directed edges we reduce
    let u, v;
    if (obs.relationshipType === 'Above') {
      u = obs.source; v = obs.target;
    } else if (obs.relationshipType === 'Below') {
      u = obs.target; v = obs.source;
    } else {
      continue;
    }
    
    // Check if edge (u -> v) exists in reducedAdj
    const isPresent = reducedAdj[u] && reducedAdj[u].includes(v);
    if (!isPresent) {
      redundantObsIds.push(obs.id);
    }
  }
  
  // Apply the deletion diff
  if (redundantObsIds.length > 0) {
    ydoc.transact(() => {
      for (const id of redundantObsIds) {
        observationsMap.delete(id);
      }
    }, 'post-merge-reduction');
  }
}

/**
 * Resolves a cycle conflict by deleting the quarantined edge.
 * WARNING: Coordinate with your team before resolving cycle conflicts.
 * Simultaneous resolution by multiple peers could result in over-deletion of valid edges.
 * First resolution wins.
 */
export function resolveQuarantine(ydoc: Y.Doc, edgeIdToDrop: string, edgesToRestore: string[]) {
  const quarantineMap = ydoc.getMap<QuarantinedEdge>('quarantined_edges');
  const observationsMap = ydoc.getMap<Observation>('observations');
  
  ydoc.transact(() => {
    // The edge to drop is simply removed from quarantine and NOT restored
    if (quarantineMap.has(edgeIdToDrop)) {
      quarantineMap.delete(edgeIdToDrop);
    }
    
    // Edges to restore are re-added to observations
    for (const edgeId of edgesToRestore) {
      const edge = quarantineMap.get(edgeId);
      if (edge) {
        const newObsId = crypto.randomUUID();
        observationsMap.set(newObsId, {
          id: newObsId,
          source: edge.source,
          target: edge.target,
          relationshipType: edge.relationshipType,
        });
        quarantineMap.delete(edgeId);
      }
    }
  }, 'post-merge-resolution');
}
