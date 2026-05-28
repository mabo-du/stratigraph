import React, { useState, useEffect } from 'react';
import { Lightbulb, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { suggestRelationships } from '../../utils/suggestRelationships';
import type { Suggestion } from '../../utils/suggestRelationships';
import type { Context, Observation, Phase } from '../../models/hmdp';
import { RelationshipType } from '../../models/hmdp';

interface RelationshipSuggestionsProps {
  contexts: Context[];
  observations: Observation[];
  phases: Phase[];
  onAddObservation: (obs: Observation) => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'var(--success)',
  medium: '#d48b45',
  low: 'var(--text-3)',
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const results = suggestRelationships(contexts, observations);
    setSuggestions(results);
  }, [contexts, observations]);

  const handleAccept = (s: Suggestion, index: number) => {
    onAddObservation({
      id: crypto.randomUUID(),
      source: s.source,
      target: s.target,
      relationshipType: s.relationshipType,
    });
    // Mark as accepted using a unique key
    setAcceptedIds(prev => new Set(prev).add(`${s.source}|${s.target}|${s.relationshipType}|${index}`));
  };

  const handleAcceptAll = () => {
    suggestions.forEach((s, i) => {
      const key = `${s.source}|${s.target}|${s.relationshipType}|${i}`;
      if (!acceptedIds.has(key)) {
        onAddObservation({
          id: crypto.randomUUID(),
          source: s.source,
          target: s.target,
          relationshipType: s.relationshipType,
        });
      }
    });
    setAcceptedIds(new Set(suggestions.map((_, i) => `${suggestions[i].source}|${suggestions[i].target}|${suggestions[i].relationshipType}|${i}`)));
  };

  if (suggestions.length === 0) return null;

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
          <span className="sidebar-count">{suggestions.length - acceptedIds.size}</span>
        </div>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {/* Accept All button (when there are unaccepted items) */}
          {acceptedIds.size < suggestions.length && (
            <button
              className="btn btn--primary btn--sm"
              style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}
              onClick={handleAcceptAll}
            >
              <Plus size={13} style={{ marginRight: 4 }} />
              Accept All ({suggestions.length - acceptedIds.size})
            </button>
          )}

          {suggestions.length === acceptedIds.size && (
            <p style={{ fontSize: '0.78rem', color: 'var(--success)', textAlign: 'center', marginBottom: 8 }}>
              ✓ All suggestions accepted
            </p>
          )}

          {suggestions.map((s, i) => {
            const key = `${s.source}|${s.target}|${s.relationshipType}|${i}`;
            const accepted = acceptedIds.has(key);

            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 'var(--radius-sm)',
                  background: accepted ? 'rgba(74, 158, 111, 0.1)' : 'var(--surface-3)',
                  fontSize: '0.78rem',
                  opacity: accepted ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Confidence dot */}
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: CONFIDENCE_COLORS[s.confidence],
                    flexShrink: 0,
                  }}
                  title={`${s.confidence} confidence`}
                />

                {/* Relationship text */}
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                  <strong>{s.source}</strong>{' '}
                  <span style={{ color: 'var(--accent)', fontSize: '0.72rem' }}>
                    {RELATIONSHIP_LABELS[s.relationshipType]}
                  </span>{' '}
                  <strong>{s.target}</strong>
                  <div style={{ color: 'var(--text-3)', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.reason.slice(0, 100)}
                  </div>
                </div>

                {/* Action buttons */}
                {!accepted && (
                  <button
                    className="icon-btn"
                    onClick={() => handleAccept(s, i)}
                    title="Add this relationship"
                    style={{ flexShrink: 0 }}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
