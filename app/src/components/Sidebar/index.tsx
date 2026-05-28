/**
 * Sidebar/index.tsx — Left panel: SU list, node editor, phase management.
 */

import React, { useState } from 'react';
import { Plus, Trash2, ChevronRight, Link, Unlink, Layers, MapPin } from 'lucide-react';
import { RelationshipSuggestions } from '../RelationshipSuggestions';
import type { Context, Observation, Phase } from '../../models/hmdp';
import { ContextType, RelationshipType } from '../../models/hmdp';
import { DEFAULT_PHASE_COLORS } from '../../models/matrixState';

interface SidebarProps {
  contexts: Context[];
  observations: Observation[];
  phases: Phase[];
  selectedId: string | null;
  sidebarTab: 'units' | 'phases';
  onSelectContext: (id: string | null) => void;
  onAddContext: (ctx: Context) => void;
  onUpdateContext: (ctx: Context) => void;
  onDeleteContext: (id: string) => void;
  onAddObservation: (obs: Observation) => void;
  onDeleteObservation: (id: string) => void;
  onAddPhase: (phase: Phase) => void;
  onUpdatePhase: (phase: Phase) => void;
  onDeletePhase: (id: string) => void;
  onSetTab: (tab: 'units' | 'phases') => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Sidebar
// ────────────────────────────────────────────────────────────────────────────

export const Sidebar: React.FC<SidebarProps> = ({
  contexts,
  observations,
  phases,
  selectedId,
  sidebarTab,
  onSelectContext,
  onAddContext,
  onUpdateContext,
  onDeleteContext,
  onAddObservation,
  onDeleteObservation,
  onAddPhase,
  onUpdatePhase,
  onDeletePhase,
  onSetTab,
}) => {
  const selectedContext = contexts.find(c => c.id === selectedId) ?? null;

  return (
    <aside className="sidebar">
      {/* Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${sidebarTab === 'units' ? 'active' : ''}`}
          onClick={() => onSetTab('units')}
        >
          Units
        </button>
        <button
          className={`sidebar-tab ${sidebarTab === 'phases' ? 'active' : ''}`}
          onClick={() => onSetTab('phases')}
        >
          <Layers size={13} style={{ marginRight: 4 }} />
          Phases
        </button>
      </div>

      {sidebarTab === 'units' && (
        selectedContext
          ? <NodeEditor
              context={selectedContext}
              contexts={contexts}
              observations={observations}
              phases={phases}
              onUpdate={onUpdateContext}
              onDelete={onDeleteContext}
              onAddObservation={onAddObservation}
              onDeleteObservation={onDeleteObservation}
              onBack={() => onSelectContext(null)}
            />
          : <>
              <UnitList
                contexts={contexts}
                phases={phases}
                selectedId={selectedId}
                onSelect={onSelectContext}
                onAdd={onAddContext}
              />
              {contexts.length > 0 && (
                <RelationshipSuggestions
                  contexts={contexts}
                  observations={observations}
                  phases={phases}
                  onAddObservation={onAddObservation}
                />
              )}
            </>
      )}

      {sidebarTab === 'phases' && (
        <PhasePanel
          phases={phases}
          onAdd={onAddPhase}
          onUpdate={onUpdatePhase}
          onDelete={onDeletePhase}
        />
      )}
    </aside>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Unit List
// ────────────────────────────────────────────────────────────────────────────

interface UnitListProps {
  contexts: Context[];
  phases: Phase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (ctx: Context) => void;
}

const UnitList: React.FC<UnitListProps> = ({ contexts, phases, selectedId, onSelect, onAdd }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('');
  const [newId, setNewId] = useState('');
  const [newType, setNewType] = useState<ContextType>(ContextType.Positive);
  const [newDesc, setNewDesc] = useState('');
  const [newPhase, setNewPhase] = useState('');
  const [error, setError] = useState('');

  const phaseMap = new Map(phases.map(p => [p.id, p]));

  const filtered = filter
    ? contexts.filter(c =>
        c.id.toLowerCase().includes(filter.toLowerCase()) ||
        (c.description ?? '').toLowerCase().includes(filter.toLowerCase())
      )
    : contexts;

  const handleAdd = () => {
    const trimmed = newId.trim();
    if (!trimmed) { setError('SU identifier is required'); return; }
    if (contexts.some(c => c.id === trimmed)) {
      setError(`SU "${trimmed}" already exists`);
      return;
    }
    onAdd({
      id: trimmed,
      type: newType,
      description: newDesc.trim() || undefined,
      phase: newPhase || undefined,
    });
    setNewId('');
    setNewDesc('');
    setNewPhase('');
    setNewType(ContextType.Positive);
    setError('');
    setShowAdd(false);
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-header-title">
          Stratigraphic Units
          {contexts.length > 0 && <span className="sidebar-count">{contexts.length}</span>}
        </span>
        <button
          className="icon-btn icon-btn--accent"
          onClick={() => setShowAdd(v => !v)}
          title="Add stratigraphic unit"
        >
          <Plus size={15} />
        </button>
      </div>

      {showAdd && (
        <div className="add-form">
          <div className="form-row">
            <label>SU Identifier *</label>
            <input
              className="form-input"
              placeholder="e.g. SU001 or 1234"
              value={newId}
              onChange={e => { setNewId(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            {error && <span className="form-error">{error}</span>}
          </div>
          <div className="form-row">
            <label>Type</label>
            <select
              className="form-select"
              value={newType}
              onChange={e => setNewType(e.target.value as ContextType)}
            >
              <option value={ContextType.Positive}>Positive (layer/fill/masonry)</option>
              <option value={ContextType.Negative}>Negative (cut/pit)</option>
              <option value={ContextType.Unknown}>Unknown</option>
            </select>
          </div>
          <div className="form-row">
            <label>Phase</label>
            <select
              className="form-select"
              value={newPhase}
              onChange={e => setNewPhase(e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {phases.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Description</label>
            <input
              className="form-input"
              placeholder="Brief description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button className="btn btn--ghost" onClick={() => { setShowAdd(false); setError(''); }}>
              Cancel
            </button>
            <button className="btn btn--primary" onClick={handleAdd}>
              Add Unit
            </button>
          </div>
        </div>
      )}

      {contexts.length > 4 && (
        <div style={{ padding: '0 12px 8px' }}>
          <input
            className="form-input"
            placeholder="Filter units…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      )}

      <div className="unit-list">
        {filtered.length === 0 && (
          <p className="empty-hint">
            {contexts.length === 0
              ? 'No units yet. Add one above or import from CSV.'
              : 'No units match that filter.'}
          </p>
        )}
        {filtered.map(ctx => {
          const phase = ctx.phase ? phaseMap.get(ctx.phase) : undefined;
          return (
            <button
              key={ctx.id}
              className={`unit-row ${selectedId === ctx.id ? 'selected' : ''}`}
              onClick={() => onSelect(ctx.id)}
            >
              <span
                className="unit-phase-dot"
                style={{ backgroundColor: phase?.color ?? '#2a3a4a' }}
              />
              <span className="unit-id">{ctx.id}</span>
              {ctx.description && (
                <span className="unit-desc">{ctx.description}</span>
              )}
              <ChevronRight size={12} className="unit-chevron" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Node Editor (shown when a node is selected)
// ────────────────────────────────────────────────────────────────────────────

interface NodeEditorProps {
  context: Context;
  contexts: Context[];
  observations: Observation[];
  phases: Phase[];
  onUpdate: (ctx: Context) => void;
  onDelete: (id: string) => void;
  onAddObservation: (obs: Observation) => void;
  onDeleteObservation: (id: string) => void;
  onBack: () => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({
  context,
  contexts,
  observations,
  phases,
  onUpdate,
  onDelete,
  onAddObservation,
  onDeleteObservation,
  onBack,
}) => {
  const [desc, setDesc] = useState(context.description ?? '');
  const [type, setType] = useState(context.type);
  const [phase, setPhase] = useState(context.phase ?? '');
  const [isDirty, setIsDirty] = useState(false);

  // Reset when context changes
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesc(context.description ?? '');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setType(context.type);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(context.phase ?? '');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.id]);

  const [newRelTarget, setNewRelTarget] = useState('');
  const [newRelType, setNewRelType] = useState<RelationshipType>(RelationshipType.Above);
  const [relError, setRelError] = useState('');

  const relatedObs = observations.filter(
    o => o.source === context.id || o.target === context.id
  );

  const saveChanges = () => {
    onUpdate({ ...context, description: desc || undefined, type, phase: phase || undefined });
    setIsDirty(false);
  };

  const addRelationship = () => {
    const targetId = newRelTarget.trim();
    if (!targetId) { setRelError('Target SU is required'); return; }
    if (targetId === context.id) { setRelError('Cannot relate a unit to itself'); return; }
    if (!contexts.some(c => c.id === targetId)) {
      setRelError(`SU "${targetId}" does not exist`);
      return;
    }
    // Check for duplicate
    const duplicate = observations.find(
      o => (o.source === context.id && o.target === targetId) ||
           (o.source === targetId && o.target === context.id)
    );
    if (duplicate) { setRelError('This relationship already exists'); return; }

    onAddObservation({
      id: crypto.randomUUID(),
      source: context.id,
      target: targetId,
      relationshipType: newRelType,
    });
    setNewRelTarget('');
    setRelError('');
  };

  const typeLabel = (obs: Observation) => {
    const other = obs.source === context.id ? obs.target : obs.source;
    const direction = obs.source === context.id
      ? { [RelationshipType.Above]: '↑ above', [RelationshipType.Below]: '↓ below', [RelationshipType.Equals]: '= equals', [RelationshipType.Contemporary]: '≈ contemporary with' }[obs.relationshipType]
      : { [RelationshipType.Above]: '↓ below', [RelationshipType.Below]: '↑ above', [RelationshipType.Equals]: '= equals', [RelationshipType.Contemporary]: '≈ contemporary with' }[obs.relationshipType];
    return `${direction} ${other}`;
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <button className="icon-btn" onClick={onBack} title="Back to unit list">
          ← 
        </button>
        <span className="sidebar-header-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
          {context.id}
        </span>
        <button
          className="icon-btn icon-btn--danger"
          onClick={() => {
            if (confirm(`Delete SU "${context.id}"? This will also remove all its relationships.`)) {
              onDelete(context.id);
            }
          }}
          title="Delete this unit"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="editor-body">
        {/* Type */}
        <div className="form-row">
          <label>Type</label>
          <select
            className="form-select"
            value={type}
            onChange={e => { setType(e.target.value as ContextType); setIsDirty(true); }}
          >
            <option value={ContextType.Positive}>Positive (layer/fill)</option>
            <option value={ContextType.Negative}>Negative (cut/pit)</option>
            <option value={ContextType.Unknown}>Unknown</option>
          </select>
        </div>

        {/* Phase */}
        <div className="form-row">
          <label>Phase</label>
          <select
            className="form-select"
            value={phase}
            onChange={e => { setPhase(e.target.value); setIsDirty(true); }}
          >
            <option value="">— Unassigned —</option>
            {phases.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="form-row">
          <label>Description</label>
          <textarea
            className="form-input form-textarea"
            placeholder="Brief field description…"
            value={desc}
            onChange={e => { setDesc(e.target.value); setIsDirty(true); }}
            rows={3}
          />
        </div>

        {isDirty && (
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={saveChanges}>
            Save Changes
          </button>
        )}

        {/* Relationships */}
        <div className="rel-section">
          <h4 className="rel-title">
            <Link size={13} style={{ marginRight: 6 }} />
            Relationships
          </h4>

          {relatedObs.length === 0 && (
            <p className="empty-hint">No relationships yet.</p>
          )}

          {relatedObs.map(obs => (
            <div key={obs.id} className="rel-row">
              <span className="rel-label">{typeLabel(obs)}</span>
              <button
                className="icon-btn icon-btn--danger"
                onClick={() => onDeleteObservation(obs.id)}
                title="Remove relationship"
              >
                <Unlink size={12} />
              </button>
            </div>
          ))}

          {/* Add relationship */}
          <div className="add-rel-form">
            <div className="form-row">
              <label>This SU is…</label>
              <select
                className="form-select"
                value={newRelType}
                onChange={e => setNewRelType(e.target.value as RelationshipType)}
              >
                <option value={RelationshipType.Above}>Above</option>
                <option value={RelationshipType.Below}>Below</option>
                <option value={RelationshipType.Equals}>Equals</option>
                <option value={RelationshipType.Contemporary}>Contemporary with</option>
              </select>
            </div>
            <div className="form-row">
              <label>Target SU</label>
              <input
                className="form-input"
                placeholder="e.g. SU002"
                value={newRelTarget}
                list={`su-options-${context.id}`}
                onChange={e => { setNewRelTarget(e.target.value); setRelError(''); }}
                onKeyDown={e => e.key === 'Enter' && addRelationship()}
              />
              <datalist id={`su-options-${context.id}`}>
                {contexts.filter(c => c.id !== context.id).map(c => (
                  <option key={c.id} value={c.id} />
                ))}
              </datalist>
              {relError && <span className="form-error">{relError}</span>}
            </div>
            <button className="btn btn--ghost" style={{ width: '100%' }} onClick={addRelationship}>
              <Plus size={13} style={{ marginRight: 4 }} />
              Add Relationship
            </button>
          </div>
        </div>

        {/* Spatial Metadata */}
        {context.spatial?.centroid && (
          <div className="rel-section">
            <h4 className="rel-title">
              <MapPin size={13} style={{ marginRight: 6 }} />
              Spatial Metadata
            </h4>
            <div className="form-row" style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
              <div><strong>X:</strong> {context.spatial.centroid.x}</div>
              <div><strong>Y:</strong> {context.spatial.centroid.y}</div>
              {context.spatial.centroid.z !== undefined && (
                <div><strong>Z:</strong> {context.spatial.centroid.z}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Phase Panel
// ────────────────────────────────────────────────────────────────────────────

interface PhasePanelProps {
  phases: Phase[];
  onAdd: (phase: Phase) => void;
  onUpdate: (phase: Phase) => void;
  onDelete: (id: string) => void;
}

const PhasePanel: React.FC<PhasePanelProps> = ({ phases, onAdd, onUpdate, onDelete }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(
    DEFAULT_PHASE_COLORS[phases.length % DEFAULT_PHASE_COLORS.length]
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd({
      id: `phase-${Date.now()}`,
      name: newName.trim(),
      color: newColor,
    });
    setNewName('');
    setNewColor(DEFAULT_PHASE_COLORS[(phases.length + 1) % DEFAULT_PHASE_COLORS.length]);
    setShowAdd(false);
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span className="sidebar-header-title">
          Phases
          {phases.length > 0 && <span className="sidebar-count">{phases.length}</span>}
        </span>
        <button className="icon-btn icon-btn--accent" onClick={() => setShowAdd(v => !v)}>
          <Plus size={15} />
        </button>
      </div>

      {showAdd && (
        <div className="add-form">
          <div className="form-row">
            <label>Phase Name</label>
            <input
              className="form-input"
              placeholder="e.g. Roman, Medieval, Phase 1"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>Colour</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {DEFAULT_PHASE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 24, height: 24,
                    borderRadius: 4,
                    backgroundColor: c,
                    border: newColor === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                style={{ width: 28, height: 28, cursor: 'pointer', border: 'none', background: 'none' }}
                title="Custom colour"
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn--ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn--primary" onClick={handleAdd}>Add Phase</button>
          </div>
        </div>
      )}

      <div className="unit-list">
        {phases.length === 0 && (
          <p className="empty-hint">No phases defined yet.</p>
        )}
        {phases.map(phase => (
          <div key={phase.id} className="phase-row">
            {editingId === phase.id ? (
              <PhaseEditor
                phase={phase}
                onSave={(updated) => { onUpdate(updated); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <span
                  className="phase-swatch"
                  style={{ backgroundColor: phase.color }}
                />
                <span className="phase-name">{phase.name}</span>
                <div className="phase-actions">
                  <button className="icon-btn" onClick={() => setEditingId(phase.id)} title="Edit phase">
                    ✏
                  </button>
                  <button
                    className="icon-btn icon-btn--danger"
                    onClick={() => {
                      if (confirm(`Delete phase "${phase.name}"? Units will become unassigned.`)) {
                        onDelete(phase.id);
                      }
                    }}
                    title="Delete phase"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const PhaseEditor: React.FC<{
  phase: Phase;
  onSave: (phase: Phase) => void;
  onCancel: () => void;
}> = ({ phase, onSave, onCancel }) => {
  const [name, setName] = useState(phase.name);
  const [color, setColor] = useState(phase.color);

  return (
    <div style={{ width: '100%' }}>
      <div className="form-row">
        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
        {DEFAULT_PHASE_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 20, height: 20, borderRadius: 3,
              backgroundColor: c, padding: 0,
              border: color === c ? '2px solid white' : '2px solid transparent',
              cursor: 'pointer',
            }}
          />
        ))}
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          style={{ width: 24, height: 24, cursor: 'pointer', border: 'none', background: 'none' }}
        />
      </div>
      <div className="form-actions">
        <button className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary btn--sm" onClick={() => onSave({ ...phase, name: name.trim() || phase.name, color })}>Save</button>
      </div>
    </div>
  );
};
