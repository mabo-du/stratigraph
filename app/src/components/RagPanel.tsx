/**
 * RagPanel.tsx — Semantic Graph RAG query interface.
 * Builds an in-browser CIDOC-CRM triple store (Oxigraph WASM) from HMDP data,
 * runs SPARQL queries, and displays results.
 */

import React, { useState, useCallback, useRef } from 'react';
import { buildStore, queryStore, clearStore, hmdpToTurtle, QUERY_TEMPLATES } from '../models/semanticGraph';
import type { Context, Observation, Phase, Event } from '../models/hmdp';

interface RagPanelProps {
  open: boolean;
  onClose: () => void;
  contexts: Context[];
  observations: Observation[];
  phases: Phase[];
  events: Event[];
}

export const RagPanel: React.FC<RagPanelProps> = ({
  open, onClose, contexts, observations, phases, events,
}) => {
  const [built, setBuilt] = useState(false);
  const [building, setBuilding] = useState(false);
  const [query, setQuery] = useState(QUERY_TEMPLATES['All contexts']);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowsAffected, setRowsAffected] = useState(0);
  const [turtleOutput, setTurtleOutput] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── Build triple store ───────────────────────────────────────────────
  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setError(null);
    try {
      await buildStore(contexts, observations, phases, events);
      setBuilt(true);
      setRowsAffected(contexts.length + observations.length);
    } catch (err: any) {
      setError(`Failed to build store: ${err.message}`);
    }
    setBuilding(false);
  }, [contexts, observations, phases, events]);

  // ── Run query ────────────────────────────────────────────────────────
  const handleQuery = useCallback(async () => {
    if (!built) return;
    setError(null);
    try {
      const rows = await queryStore(query);
      setResults(rows);
      setRowsAffected(rows.length);
    } catch (err: any) {
      setError(`SPARQL error: ${err.message}`);
      setResults([]);
    }
  }, [built, query]);

  // ── Show Turtle export ───────────────────────────────────────────────
  const handleShowTurtle = useCallback(() => {
    const turtle = hmdpToTurtle(contexts, observations, phases, events);
    setTurtleOutput(turtle);
  }, [contexts, observations, phases, events]);

  if (!open) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 60, left: 12,
      zIndex: 10,
      background: 'var(--surface)',
      border: '1px solid var(--border-2)',
      borderRadius: 'var(--radius)',
      width: 420,
      maxHeight: 'calc(100vh - 200px)',
      display: 'flex', flexDirection: 'column',
      fontSize: '0.78rem',
      color: 'var(--text-1)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid var(--border-1)',
      }}>
        <strong style={{ fontSize: '0.82rem' }}>
          Semantic Graph <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>CIDOC-CRM</span>
        </strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>✕</button>
      </div>

      {/* Build button */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-1)' }}>
        {!built ? (
          <button
            onClick={handleBuild}
            disabled={building || contexts.length === 0}
            style={{
              width: '100%', padding: '6px 12px',
              background: built || building ? 'var(--bg)' : 'var(--accent)',
              color: built || building ? 'var(--text-3)' : '#fff',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)', cursor: 'pointer',
              fontSize: '0.78rem',
            }}
          >
            {building ? 'Building triple store...' : 'Build CIDOC-CRM Triple Store'}
          </button>
        ) : (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textAlign: 'center' }}>
            Store built — {rowsAffected} triples loaded ·{' '}
            <button onClick={handleShowTurtle} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.72rem' }}>
              Show Turtle
            </button>
            {' · '}
            <button onClick={() => { clearStore(); setBuilt(false); setResults(null); }}
              style={{ background: 'none', border: 'none', color: '#c05c5c', cursor: 'pointer', fontSize: '0.72rem' }}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Query templates */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginBottom: 4 }}>Query template:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Object.keys(QUERY_TEMPLATES).map(name => (
            <button key={name}
              onClick={() => setQuery(QUERY_TEMPLATES[name])}
              style={{
                padding: '2px 8px', fontSize: '0.7rem',
                background: query === QUERY_TEMPLATES[name] ? 'var(--accent)' : 'var(--bg)',
                color: query === QUERY_TEMPLATES[name] ? '#fff' : 'var(--text-2)',
                border: '1px solid var(--border-2)', borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* SPARQL editor */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          rows={4}
          style={{
            width: '100%', resize: 'vertical', fontSize: '0.7rem',
            fontFamily: 'monospace',
            background: 'var(--bg)', color: 'var(--text-1)',
            border: '1px solid var(--border-2)', borderRadius: 'var(--radius)',
            padding: 6,
          }}
        />
        <button
          onClick={handleQuery}
          disabled={!built}
          style={{
            marginTop: 4, padding: '3px 16px',
            background: built ? 'var(--accent)' : 'var(--bg)',
            color: built ? '#fff' : 'var(--text-3)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
            cursor: built ? 'pointer' : 'default', fontSize: '0.76rem',
          }}
        >
          Run SPARQL
        </button>
      </div>

      {/* Results */}
      <div ref={resultRef} style={{
        flex: 1, overflow: 'auto', padding: '8px 14px',
        minHeight: 100,
      }}>
        {error && <div style={{ color: '#c05c5c', fontSize: '0.72rem' }}>{error}</div>}

        {turtleOutput && (
          <pre style={{
            fontSize: '0.62rem', lineHeight: 1.4,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            background: 'var(--bg)', padding: 8, borderRadius: 4,
            maxHeight: 200, overflow: 'auto',
          }}>
            {turtleOutput}
          </pre>
        )}

        {results !== null && !turtleOutput && (
          <>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginBottom: 4 }}>
              {results.length} row(s)
            </div>
            {results.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr>
                      {Object.keys(results[0]).map(key => (
                        <th key={key} style={{
                          textAlign: 'left', padding: '3px 6px',
                          borderBottom: '1px solid var(--border-2)',
                          color: 'var(--text-2)', fontWeight: 600,
                        }}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val: any, j) => (
                          <td key={j} style={{
                            padding: '2px 6px',
                            borderBottom: '1px solid var(--border-1)',
                            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {results === null && !turtleOutput && !error && (
          <div style={{ color: 'var(--text-4)', textAlign: 'center', paddingTop: 30, fontSize: '0.75rem' }}>
            Build the triple store, then run a SPARQL query
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 14px', borderTop: '1px solid var(--border-1)',
        fontSize: '0.62rem', color: 'var(--text-4)',
      }}>
        Oxigraph WASM · CIDOC-CRM + CRMarchaeo ontology
      </div>
    </div>
  );
};
