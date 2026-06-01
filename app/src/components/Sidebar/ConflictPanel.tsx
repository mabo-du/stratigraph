import React from 'react';
import { useMatrixStore } from '../../hooks/useMatrixStore';
import { resolveQuarantine, type QuarantinedEdge } from '../../models/reconciliation';

export const ConflictPanel: React.FC = () => {
  const { doc, quarantinedEdges } = useMatrixStore();

  if (!quarantinedEdges || quarantinedEdges.size === 0) {
    return null;
  }

  // Convert map to array for rendering
  const edges = Array.from(quarantinedEdges.entries()).map(([id, edge]) => ({
    id,
    ...(edge as QuarantinedEdge)
  }));

  const handleResolve = (edgeId: string) => {
    if (!doc) return;
    
    // First resolution wins: we drop the specific edge clicked.
    // The other edges in the quarantine map should ideally be restored.
    // But since the schema only specifies dropping the quarantined edge and leaving the others to 
    // be restored, we pass edgeIdToDrop and the rest to be restored.
    const edgesToRestore = edges.filter(e => e.id !== edgeId).map(e => e.id);
    
    resolveQuarantine(doc, edgeId, edgesToRestore);
  };

  return (
    <div className="conflict-panel p-4 bg-red-900/20 border border-red-500 rounded-md mb-4">
      <h3 className="text-red-500 font-bold mb-2 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Graph Integrity Error
      </h3>
      
      <div className="text-sm text-red-200 mb-3 space-y-2">
        <p>
          A topological cycle was detected after merging remote edits. The affected relationships have been quarantined to preserve graph integrity.
        </p>
        <p className="font-bold border-l-2 border-red-500 pl-2">
          WARNING: Coordinate with your team before resolving. Simultaneous resolution by multiple peers could result in over-deletion of valid edges. First resolution wins.
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs uppercase tracking-wider text-red-400 font-semibold">Quarantined Edges</h4>
        <ul className="space-y-2">
          {edges.map((edge) => (
            <li key={edge.id} className="flex items-center justify-between bg-red-950/50 p-2 rounded">
              <span className="font-mono text-sm">
                {edge.source} <span className="text-red-400">→</span> {edge.target}
              </span>
              <button 
                onClick={() => handleResolve(edge.id)}
                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                title="Break cycle by deleting this relationship"
              >
                Break Cycle
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
