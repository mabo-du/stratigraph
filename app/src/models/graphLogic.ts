/**
 * graphLogic.ts — Pure functions for DAG validation and transitive reduction.
 * exports: buildAdjacencyList, hasCycle, findCyclePath, wouldCreateCycle, transitiveReduction
 * used_by: matrixStore.ts → validation, App.tsx → import validation, Sidebar → manual add
 * rules:
 * - Pure functions only, no state mutation.
 * - Adheres to DAG constraints for stratigraphic matrices.
 * - findCyclePath must return the full cycle path for user feedback.
 */

import { RelationshipType } from './hmdp';
import type { Observation } from './hmdp';

export type AdjacencyList = Record<string, string[]>;

/**
 * Builds a directed adjacency list from a list of observations.
 * Only considers "Above" / "Below" for the directed temporal graph.
 * If A is "Above" B, the edge is A -> B.
 * If A is "Below" B, the edge is B -> A.
 */
export function buildAdjacencyList(observations: Observation[]): AdjacencyList {
  const adj: AdjacencyList = {};

  const addEdge = (from: string, to: string) => {
    if (!adj[from]) adj[from] = [];
    if (!adj[to]) adj[to] = [];
    if (!adj[from].includes(to)) {
      adj[from].push(to);
    }
  };

  for (const obs of observations) {
    if (obs.relationshipType === RelationshipType.Above) {
      // Source is above Target: Source -> Target
      addEdge(obs.source, obs.target);
    } else if (obs.relationshipType === RelationshipType.Below) {
      // Source is below Target: Target -> Source
      addEdge(obs.target, obs.source);
    }
    // Equals and Contemporary are handled differently (typically as node clustering or horizontal alignment)
  }

  return adj;
}

/**
 * Detects if the graph contains any cycles using DFS.
 * Returns true if a cycle is found, false otherwise.
 */
export function hasCycle(adj: AdjacencyList): boolean {
  return findCyclePath(adj) !== null;
}

/**
 * Finds a cycle in the graph and returns the path as an array of node IDs.
 * Returns null if the graph is acyclic (a valid DAG).
 * The returned path forms a closed loop: [A, B, C, A] means A → B → C → A.
 *
 * Rules:
 * - Must return the shortest discoverable cycle path for clear user feedback.
 */
export function findCyclePath(adj: AdjacencyList): string[] | null {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const parent = new Map<string, string>(); // child → parent in DFS tree

  const dfs = (node: string): string[] | null => {
    visited.add(node);
    recStack.add(node);

    const neighbors = adj[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        parent.set(neighbor, node);
        const result = dfs(neighbor);
        if (result) return result;
      } else if (recStack.has(neighbor)) {
        // Found a cycle — reconstruct the path
        const cyclePath: string[] = [neighbor];
        let current = node;
        while (current !== neighbor) {
          cyclePath.push(current);
          current = parent.get(current)!;
        }
        cyclePath.push(neighbor); // close the loop
        cyclePath.reverse();
        return cyclePath;
      }
    }

    recStack.delete(node);
    return null;
  };

  for (const node of Object.keys(adj)) {
    if (!visited.has(node)) {
      const result = dfs(node);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Tests whether adding a candidate directed edge (from → to) would create a cycle.
 * Returns the cycle path if it would, or null if the edge is safe.
 *
 * Rules:
 * - Does NOT mutate the input adjacency list.
 * - Used for real-time validation before committing manual relationship additions.
 */
export function wouldCreateCycle(
  adj: AdjacencyList,
  from: string,
  to: string
): string[] | null {
  // Build a temporary adjacency list with the candidate edge
  const candidate: AdjacencyList = {};
  for (const node of Object.keys(adj)) {
    candidate[node] = [...adj[node]];
  }
  // Ensure both nodes exist
  if (!candidate[from]) candidate[from] = [];
  if (!candidate[to]) candidate[to] = [];
  // Add the candidate edge
  if (!candidate[from].includes(to)) {
    candidate[from].push(to);
  }

  return findCyclePath(candidate);
}

/**
 * Performs a transitive reduction on the DAG.
 * Removes edges A -> C if there is a path A -> B -> ... -> C.
 * Returns a new AdjacencyList.
 * Assumes the graph is a DAG (no cycles).
 */
export function transitiveReduction(adj: AdjacencyList): AdjacencyList {
  const reduced: AdjacencyList = {};
  const nodes = Object.keys(adj);

  // Initialize the reduced graph with empty arrays
  for (const node of nodes) {
    reduced[node] = [...(adj[node] || [])];
  }

  // Reachability test using DFS
  const isReachable = (start: string, target: string, skipImmediate: string): boolean => {
    const visited = new Set<string>();
    
    const dfs = (current: string): boolean => {
      if (current === target) return true;
      visited.add(current);
      
      for (const neighbor of adj[current] || []) {
        // Skip the immediate edge we are trying to test redundancy for
        if (start === current && neighbor === skipImmediate) continue;
        
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        }
      }
      return false;
    };
    
    return dfs(start);
  };

  for (const node of nodes) {
    const neighbors = [...(adj[node] || [])];
    for (const neighbor of neighbors) {
      // If target is reachable from node via some other path,
      // the direct edge node -> neighbor is redundant.
      if (isReachable(node, neighbor, neighbor)) {
        reduced[node] = reduced[node].filter(n => n !== neighbor);
      }
    }
  }

  return reduced;
}
