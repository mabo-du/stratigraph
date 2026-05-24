import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import type { Context, Phase } from '../../models/hmdp';

interface SearchOverlayProps {
  contexts: Context[];
  phases: Phase[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ contexts, phases, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const phaseMap = new Map(phases.map(p => [p.id, p]));

  const results = React.useMemo(() => {
    return query.trim() === '' 
      ? [] 
      : contexts.filter(c => 
          c.id.toLowerCase().includes(query.toLowerCase()) || 
          (c.description ?? '').toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
  }, [query, contexts]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // prevent App level escape handling
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results.length > 0 && results[selectedIndex]) {
          onSelect(results[selectedIndex].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [results, selectedIndex, onClose, onSelect]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-palette">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search contexts by ID or description..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        {results.length > 0 && (
          <div className="search-results">
            {results.map((ctx, index) => {
              const phase = ctx.phase ? phaseMap.get(ctx.phase) : undefined;
              return (
                <div
                  key={ctx.id}
                  className={`search-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => onSelect(ctx.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span
                    className="unit-phase-dot"
                    style={{ backgroundColor: phase?.color ?? '#2a3a4a' }}
                  />
                  <span className="unit-id">{ctx.id}</span>
                  {ctx.description && (
                    <span className="unit-desc">{ctx.description}</span>
                  )}
                  <ChevronRight size={14} className="search-item-chevron" />
                </div>
              );
            })}
          </div>
        )}
        {query.trim() !== '' && results.length === 0 && (
          <div className="search-empty">No results found for "{query}"</div>
        )}
      </div>
    </div>
  );
};
