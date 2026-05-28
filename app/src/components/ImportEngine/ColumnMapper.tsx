import React, { useState } from 'react';
import type { ContextMapping, ObservationMapping } from '../../utils/csvParser';
import { RelationshipType } from '../../models/hmdp';
import { mappingConfidence } from '../../utils/smartImport';

interface ColumnMapperProps {
  type: 'context' | 'observation' | 'event';
  headers: string[];
  onMappingComplete: (mapping: any) => void;
  onCancel: () => void;
  /** Optional pre-filled suggestions from smart import */
  initialMapping?: Partial<ContextMapping | ObservationMapping>;
  /** Detected system name for info display */
  detectedSystem?: string;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({
  type,
  headers,
  onMappingComplete,
  onCancel,
  initialMapping,
  detectedSystem,
}) => {
  const [contextMapping, setContextMapping] = useState<Partial<ContextMapping>>(
    (initialMapping as Partial<ContextMapping>) ?? {},
  );
  const [observationMapping, setObservationMapping] = useState<Partial<ObservationMapping>>(
    (initialMapping as Partial<ObservationMapping>) ?? { defaultRelationship: RelationshipType.Above },
  );
  const [eventMapping, setEventMapping] = useState<Partial<import('../../utils/csvParser').EventMapping>>({});

  const handleSelect = (field: string, value: string) => {
    if (type === 'context') {
      setContextMapping(prev => ({ ...prev, [field]: value }));
    } else if (type === 'observation') {
      setObservationMapping(prev => ({ ...prev, [field]: value }));
    } else {
      setEventMapping(prev => ({ ...prev, [field]: value }));
    }
  };

  const isReady = type === 'context'
    ? !!contextMapping.idColumn
    : type === 'observation'
    ? !!(observationMapping.sourceColumn && observationMapping.targetColumn)
    : !!(eventMapping.idColumn && eventMapping.contextIdColumn);

  const handleSubmit = () => {
    if (isReady) {
      if (type === 'context') onMappingComplete(contextMapping);
      else if (type === 'observation') onMappingComplete(observationMapping);
      else onMappingComplete(eventMapping);
    }
  };

  const renderSelect = (label: string, field: string, required = false) => {
    const current = type === 'context'
      ? (contextMapping as any)[field] || ''
      : type === 'observation'
      ? (observationMapping as any)[field] || ''
      : (eventMapping as any)[field] || '';

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

  const confidence = type === 'context'
    ? mappingConfidence(contextMapping as any)
    : type === 'observation'
    ? mappingConfidence({ idColumn: '', sourceColumn: observationMapping.sourceColumn || '', targetColumn: observationMapping.targetColumn || '' })
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {detectedSystem && (
        <div style={{
          padding: '0.5rem 0.75rem',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>Detected:</span>
          <strong>{detectedSystem}</strong>
          <span style={{ color: 'var(--text-2)', marginLeft: 'auto' }}>
            {confidence >= 0.66 ? '✓ Columns pre-filled' : 'Partial match'}
          </span>
        </div>
      )}
      <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
        Match the columns from your CSV to the required fields below.
      </p>

      {type === 'context' && (
        <>
          {renderSelect('Context ID — unique identifier (e.g. SU number)', 'idColumn', true)}
          {renderSelect('Context Type — Positive / Negative / Cut / Layer (optional)', 'typeColumn')}
          {renderSelect('Description — free text field (optional)', 'descriptionColumn')}
          <div style={{ height: 1, background: 'var(--border-2)', margin: '8px 0' }} />
          <p style={{ color: 'var(--text-2)', fontSize: '0.8rem', marginBottom: -8 }}>Spatial Metadata (Optional for GIS mapping)</p>
          {renderSelect('Centroid X (Easting)', 'centroidXColumn')}
          {renderSelect('Centroid Y (Northing)', 'centroidYColumn')}
          {renderSelect('Centroid Z (Elevation)', 'centroidZColumn')}
        </>
      )}

      {type === 'observation' && (
        <>
          {renderSelect('Source Context — the "upper" or "earlier" unit', 'sourceColumn', true)}
          {renderSelect('Target Context — the "lower" or "later" unit', 'targetColumn', true)}
          {renderSelect('Relationship Type — Above / Below / Equals (optional if all rows are "Above")', 'relationshipColumn')}
        </>
      )}

      {type === 'event' && (
        <>
          {renderSelect('Event ID / Lab Number — unique identifier (e.g. Beta-12345)', 'idColumn', true)}
          {renderSelect('Context ID — the layer this event dates', 'contextIdColumn', true)}
          {renderSelect('Name / Material — (e.g. Charcoal Lens)', 'nameColumn')}
          {renderSelect('Radiocarbon Date — (e.g. "1000, 25")', 'rDateColumn')}
          {renderSelect('Dating Type — (e.g. C14, Coin)', 'typeColumn')}
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
