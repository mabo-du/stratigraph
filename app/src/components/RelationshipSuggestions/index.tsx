import React, { useState, useMemo, useCallback } from 'react';
import { Lightbulb, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { suggestRelationships } from '../../utils/suggestRelationships';
import type { Suggestion } from '../../utils/suggestRelationships';
import type { Context, Observation } from '../../models/hmdp';
import { RelationshipType } from '../../models/hmdp';

interface RelationshipSuggestionsProps {
  contexts: Context[];
  observations: Observation[];
  onAddObservation: (obs: Observation) => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'var(--success)',
  medium: '#d48b45',
  low: 'var(--text-3)',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'Certain — explicit stratigraphic term',
  medium: 'Probable — common archaeological phrasing',
  low: 'Possible — inferred from phase/temporal association',
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  [RelationshipType.Above]: 'Above',
  [RelationshipType.Below]: 'Below',
  [RelationshipType.Equals]: 'Equals',
  [RelationshipType.Contemporary]: 'Contemporary',
};

export const RelationshipSuggestions: React.FC<RelationshipSuggestionsProps> = ({
  contexts,
  observations,
  onAddObservation,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  // Derive suggestions from contexts + observations instead of effect
  const suggestions = useMemo(() => suggestRelationships(contexts, observations), [contexts, observations]);

  // Reset selections when data changes — key the list on suggestions version
  // so React re-mounts the interactive elements with fresh state
  const suggestionKey = useMemo(() => suggestions.length + '-' + contexts.length + '-' + observations.length, [suggestions, contexts, observations]);

  const makeKey = (s: Suggestion, i: number) =>
    `${s.source}|${s.target}|${s.relationshipType}|${i}`;

  const handleAccept = useCallback((s: Suggestion, index: number) => {
    onAddObservation({
      id: crypto.randomUUID(),
      source: s.source,
      target: s.target,
      relationshipType: s.relationshipType,
    });
    setAcceptedIds(prev => new Set(prev).add(makeKey(s, index)));
  }, [onAddObservation]);

  const handleAcceptSelected = useCallback(() => {
    suggestions.forEach((s, i) => {
      const key = makeKey(s, i);
      if (selected.has(key) && !acceptedIds.has(key)) {
        onAddObservation({
          id: crypto.randomUUID(),
          source: s.source,
          target: s.target,
          relationshipType: s.relationshipType,
        });
      }
    });
    setAcceptedIds(prev => {
      const next = new Set(prev);
      selected.forEach(k => next.add(k));
      return next;
    });
    setSelected(new Set());
  }, [suggestions, selected, acceptedIds, onAddObservation]);

  const handleAcceptAll = useCallback(() => {
    suggestions.forEach((s, i) => {
      const key = makeKey(s, i);
      if (!acceptedIds.has(key)) {
        onAddObservation({
          id: crypto.randomUUID(),
          source: s.source,
          target: s.target,
          relationshipType: s.relationshipType,
        });
      }
    });
    setAcceptedIds(new Set(suggestions.map((_, i) => makeKey(suggestions[i], i))));
    setSelected(new Set());
  }, [suggestions, acceptedIds, onAddObservation]);

  const toggleSelect = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  if (suggestions.length === 0) return null;

  const remaining = suggestions.length - acceptedIds.size;
  const selectedCount = selected.size;
  const highCount = suggestions.filter(s => s.confidence === 'high' && !acceptedIds.has(makeKey(s, suggestions.indexOf(s)))).length;
  const medCount = suggestions.filter(s => s.confidence === 'medium' && !acceptedIds.has(makeKey(s, suggestions.indexOf(s)))).length;

  return (
    <div className="sidebar-section">
      <div
        className="sidebar-header"
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lightbulb size={14} style={{ color: '#d48b45' }} />
          <span className="sidebar-header-title">Suggestions</span>
          {remaining > 0 && <span className="sidebar-count">{remaining}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {highCount > 0 && <span style={{ color: 'var(--success)' }}>{highCount}H</span>}
          {medCount > 0 && <span style={{ color: '#d48b45' }}>{medCount}M</span>}
        </div>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {/* Action buttons row */}
          {remaining > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button
                className="btn btn--primary btn--sm"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}
                onClick={handleAcceptAll}
              >
                <Plus size={11} style={{ marginRight: 3 }} />
                All ({remaining})
              </button>
              {selectedCount > 0 && (
                <button
                  className="btn btn--sm"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    background: 'var(--accent-dim)',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                  }}
                  onClick={handleAcceptSelected}
                >
                  <Plus size={11} style={{ marginRight: 3 }} />
                  Selected ({selectedCount})
                </button>
              )}
            </div>
          )}

          {remaining === 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--success)', textAlign: 'center', marginBottom: 8 }}>
              ✓ All suggestions accepted
            </p>
          )}

          <div key={suggestionKey}>
          {suggestions.map((s, i) => {
            const key = makeKey(s, i);
            const accepted = acceptedIds.has(key);
            const isSelected = selected.has(key);

            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 4,
                  padding: '5px 6px',
                  marginBottom: 3,
                  borderRadius: 'var(--radius-sm)',
                  background: accepted
                    ? 'rgba(74, 158, 111, 0.08)'
                    : isSelected
                    ? 'var(--accent-dim)'
                    : 'var(--surface-3)',
                  opacity: accepted ? 0.45 : 1,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={() => setTooltipId(key)}
                onMouseLeave={() => setTooltipId(null)}
              >
                {/* Checkbox for batch select */}
                {!accepted && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(key)}
                    style={{ marginTop: 3, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                  />
                )}

                {/* Confidence dot */}
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: CONFIDENCE_COLORS[s.confidence],
                    flexShrink: 0,
                    marginTop: 5,
                    cursor: 'help',
                  }}
                  title={CONFIDENCE_LABELS[s.confidence]}
                />

                {/* Relationship text */}
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4, position: 'relative' }}>
                  <strong>{s.source}</strong>{' '}
                  <span style={{ color: 'var(--accent)', fontSize: '0.72rem' }}>
                    {RELATIONSHIP_LABELS[s.relationshipType]}
                  </span>{' '}
                  <strong>{s.target}</strong>
                  <div style={{ color: 'var(--text-3)', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.reason.slice(0, 80)}
                  </div>

                  {/* Hover tooltip */}
                  {tooltipId === key && !accepted && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      background: 'var(--surface)',
                      border: '1px solid var(--border-2)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 8px',
                      fontSize: '0.72rem',
                      color: 'var(--text-2)',
                      lineHeight: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      pointerEvents: 'none',
                      marginBottom: 4,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Why?</div>
                      <div>{s.reason}</div>
                      <div style={{ marginTop: 3, color: CONFIDENCE_COLORS[s.confidence], fontWeight: 500 }}>
                        {s.confidence.charAt(0).toUpperCase() + s.confidence.slice(1)} confidence
                      </div>
                    </div>
                  )}
                </div>

                {/* Add button */}
                {!accepted && (
                  <button
                    className="icon-btn"
                    onClick={() => handleAccept(s, i)}
                    title="Add this relationship"
                    style={{ flexShrink: 0, marginTop: 1 }}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};
