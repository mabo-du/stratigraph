import React, { useState } from 'react';
import type { ContextMapping, ObservationMapping } from '../../utils/csvParser';
import { RelationshipType } from '../../models/hmdp';

interface ColumnMapperProps {
  type: 'context' | 'observation';
  headers: string[];
  onMappingComplete: (mapping: any) => void;
  onCancel: () => void;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({ type, headers, onMappingComplete, onCancel }) => {
  const [contextMapping, setContextMapping] = useState<Partial<ContextMapping>>({});
  const [observationMapping, setObservationMapping] = useState<Partial<ObservationMapping>>({
    defaultRelationship: RelationshipType.Above
  });

  const handleSelect = (field: string, value: string) => {
    if (type === 'context') {
      setContextMapping(prev => ({ ...prev, [field]: value }));
    } else {
      setObservationMapping(prev => ({ ...prev, [field]: value }));
    }
  };

  const isReady = type === 'context'
    ? !!contextMapping.idColumn
    : !!(observationMapping.sourceColumn && observationMapping.targetColumn);

  const handleSubmit = () => {
    if (isReady) {
      onMappingComplete(type === 'context' ? contextMapping : observationMapping);
    }
  };

  const renderSelect = (label: string, field: string, required = false) => {
    const current = type === 'context'
      ? (contextMapping as any)[field] || ''
      : (observationMapping as any)[field] || '';

    return (
      <div className="form-row">
        <label>
          {label}
          {required && <span style={{ color: 'var(--error)', marginLeft: 4 }}>*</span>}
        </label>
        <select
          className="form-select"
          value={current}
          onChange={e => handleSelect(field, e.target.value)}
        >
          <option value="">— Select a column —</option>
          {headers.map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
        Match the columns from your CSV to the required fields below.
      </p>

      {type === 'context' && (
        <>
          {renderSelect('Context ID — unique identifier (e.g. SU number)', 'idColumn', true)}
          {renderSelect('Context Type — Positive / Negative / Cut / Layer (optional)', 'typeColumn')}
          {renderSelect('Description — free text field (optional)', 'descriptionColumn')}
        </>
      )}

      {type === 'observation' && (
        <>
          {renderSelect('Source Context — the "upper" or "earlier" unit', 'sourceColumn', true)}
          {renderSelect('Target Context — the "lower" or "later" unit', 'targetColumn', true)}
          {renderSelect('Relationship Type — Above / Below / Equals (optional if all rows are "Above")', 'relationshipColumn')}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={!isReady}
        >
          Confirm Mapping
        </button>
      </div>
    </div>
  );
};
