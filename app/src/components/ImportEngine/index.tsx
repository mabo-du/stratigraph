import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { ColumnMapper } from './ColumnMapper';
import { parseCsvFile, applyContextMapping, applyObservationMapping, applyEventMapping } from '../../utils/csvParser';
import type { ContextMapping, ObservationMapping, EventMapping } from '../../utils/csvParser';
import type { Context, Observation, Event } from '../../models/hmdp';

interface ImportEngineProps {
  onDataLoaded: (contexts: Context[], observations: Observation[], events: Event[]) => void;
  onClose?: () => void;
}

type ImportStep = 'upload' | 'map-contexts' | 'map-observations' | 'map-events' | 'processing';

export const ImportEngine: React.FC<ImportEngineProps> = ({ onDataLoaded, onClose }) => {
  const [step, setStep] = useState<ImportStep>('upload');

  const [contextHeaders, setContextHeaders] = useState<string[]>([]);
  const [contextRows, setContextRows] = useState<Record<string, any>[]>([]);

  const [observationHeaders, setObservationHeaders] = useState<string[]>([]);
  const [observationRows, setObservationRows] = useState<Record<string, any>[]>([]);

  const [eventHeaders, setEventHeaders] = useState<string[]>([]);
  const [eventRows, setEventRows] = useState<Record<string, any>[]>([]);

  const [contexts, setContexts] = useState<Context[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleContextFileLoaded = async (file: File) => {
    try {
      setError(null);
      const result = await parseCsvFile(file);
      setContextHeaders(result.headers);
      setContextRows(result.rows);
      setStep('map-contexts');
    } catch (err: any) {
      setError(`Failed to parse Contexts CSV: ${err.message}`);
    }
  };

  const handleObservationFileLoaded = async (file: File) => {
    try {
      setError(null);
      const result = await parseCsvFile(file);
      setObservationHeaders(result.headers);
      setObservationRows(result.rows);
      setStep('map-observations');
    } catch (err: any) {
      setError(`Failed to parse Observations CSV: ${err.message}`);
    }
  };

  const handleEventFileLoaded = async (file: File) => {
    try {
      setError(null);
      const result = await parseCsvFile(file);
      setEventHeaders(result.headers);
      setEventRows(result.rows);
      setStep('map-events');
    } catch (err: any) {
      setError(`Failed to parse Events CSV: ${err.message}`);
    }
  };

  const handleContextMappingComplete = (mapping: ContextMapping) => {
    const parsedContexts = applyContextMapping(contextRows, mapping);
    setContexts(parsedContexts);
    setStep('upload');
  };

  const handleObservationMappingComplete = (mapping: ObservationMapping) => {
    const parsedObservations = applyObservationMapping(observationRows, mapping);
    setObservations(parsedObservations);
    setStep('upload');
  };

  const handleEventMappingComplete = (mapping: EventMapping) => {
    const parsedEvents = applyEventMapping(eventRows, mapping);
    setEvents(parsedEvents);
    setStep('upload');
  };

  const submitData = () => {
    setStep('processing');
    onDataLoaded(contexts, observations, events);
  };

  const stepLabel =
    step === 'map-contexts' ? 'Map Context Columns'
    : step === 'map-observations' ? 'Map Relationship Columns'
    : step === 'map-events' ? 'Map Event Columns'
    : 'Import Stratigraphic Data';

  return (
    <div style={{ padding: '1.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{stepLabel}</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
            {step === 'upload' && 'Upload your CSV data. Only Contexts and Observations are strictly required.'}
            {step === 'map-contexts' && 'Tell us which columns in your CSV correspond to Context fields.'}
            {step === 'map-observations' && 'Tell us which columns represent the stratigraphic relationship.'}
            {step === 'map-events' && 'Tell us which columns map to absolute radiocarbon dates/events.'}
            {step === 'processing' && 'Validating your data…'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-3)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-2)',
              width: 28, height: 28,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: 16,
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          backgroundColor: 'var(--error-dim)',
          border: '1px solid var(--error)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1.25rem',
          color: '#f4a09a',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Contexts */}
          <div>
            <h3 style={{
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              Step 1 — Contexts CSV
              {contexts.length > 0 && (
                <span style={{
                  color: 'var(--success)',
                  fontSize: '0.78rem',
                  padding: '1px 8px',
                  background: 'rgba(74, 158, 111, 0.15)',
                  border: '1px solid rgba(74, 158, 111, 0.3)',
                  borderRadius: 10,
                }}>
                  {contexts.length} loaded ✓
                </span>
              )}
            </h3>
            {contexts.length === 0 ? (
              <Dropzone onFileLoaded={handleContextFileLoaded} title="Contexts CSV (SU numbers, types)" />
            ) : (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                background: 'var(--surface-2)',
                border: '1px solid rgba(74, 158, 111, 0.3)',
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ color: 'var(--text)', fontSize: '0.85rem' }}>
                  {contexts.length} contexts loaded and mapped.
                </span>
                <button
                  onClick={() => setContexts([])}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-2)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-2)',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Observations */}
          <div style={{ opacity: contexts.length > 0 ? 1 : 0.4, transition: 'opacity 0.2s', pointerEvents: contexts.length > 0 ? 'auto' : 'none' }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Step 2 — Observations CSV
              {observations.length > 0 && (
                <span style={{ color: 'var(--success)', fontSize: '0.78rem', marginLeft: 8 }}>{observations.length} loaded ✓</span>
              )}
            </h3>
            {observations.length === 0 ? (
              <Dropzone onFileLoaded={handleObservationFileLoaded} title="Observations CSV (relationships between SUs)" />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid rgba(74, 158, 111, 0.3)', borderRadius: 'var(--radius)' }}>
                <span style={{ fontSize: '0.85rem' }}>{observations.length} relationships mapped.</span>
                <button onClick={() => setObservations([])} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Reset</button>
              </div>
            )}
          </div>

          <div style={{ opacity: observations.length > 0 ? 1 : 0.4, transition: 'opacity 0.2s', pointerEvents: observations.length > 0 ? 'auto' : 'none' }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Step 3 — Events CSV (Optional for Libby/OxCal)
              {events.length > 0 && (
                <span style={{ color: 'var(--success)', fontSize: '0.78rem', marginLeft: 8 }}>{events.length} loaded ✓</span>
              )}
            </h3>
            {events.length === 0 ? (
              <Dropzone onFileLoaded={handleEventFileLoaded} title="Events CSV (C14 Dates)" />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid rgba(74, 158, 111, 0.3)', borderRadius: 'var(--radius)' }}>
                <span style={{ fontSize: '0.85rem' }}>{events.length} events mapped.</span>
                <button onClick={() => setEvents([])} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Reset</button>
              </div>
            )}
          </div>

          {contexts.length > 0 && observations.length > 0 && (
            <button
              onClick={submitData}
              className="btn btn--primary"
              style={{ width: '100%', padding: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}
            >
              Generate Harris Matrix
            </button>
          )}

          {/* Quick-import tip */}
          <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text)' }}>Tip:</strong> The Observations CSV only needs two columns — one for the "above" unit and one for the "below" unit. Column names are flexible; you'll map them in the next step.
          </div>
        </div>
      )}

      {/* Step: Map contexts */}
      {step === 'map-contexts' && (
        <ColumnMapper
          type="context"
          headers={contextHeaders}
          onMappingComplete={handleContextMappingComplete}
          onCancel={() => setStep('upload')}
        />
      )}

      {/* Step: Map observations */}
      {step === 'map-observations' && (
        <ColumnMapper
          type="observation"
          headers={observationHeaders}
          onMappingComplete={handleObservationMappingComplete}
          onCancel={() => setStep('upload')}
        />
      )}

      {/* Step: Map events */}
      {step === 'map-events' && (
        <ColumnMapper
          type="event"
          headers={eventHeaders}
          onMappingComplete={handleEventMappingComplete}
          onCancel={() => setStep('upload')}
        />
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⛏</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Processing matrix…</h2>
          <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
            Checking for cycles and computing transitive reduction.
          </p>
        </div>
      )}
    </div>
  );
};
