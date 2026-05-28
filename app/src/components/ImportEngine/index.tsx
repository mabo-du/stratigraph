import React, { useState, useRef } from 'react';
import { X, Archive } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { ColumnMapper } from './ColumnMapper';
import { parseCsvFile, applyContextMapping, applyObservationMapping, applyEventMapping } from '../../utils/csvParser';
import { importHoardData } from '../../models/hoardImporter';
import { parseLstFile } from '../../utils/lstParser';
import { detectFieldSystem, suggestMappings } from '../../utils/smartImport';
import type { HoardContextSheet } from '../../models/hoardImporter';
import type { ContextMapping, ObservationMapping, EventMapping } from '../../utils/csvParser';
import type { Context, Observation, Event } from '../../models/hmdp';

interface ImportEngineProps {
  onDataLoaded: (contexts: Context[], observations: Observation[], events: Event[]) => void;
  onClose?: () => void;
}

type ImportStep = 'upload' | 'map-contexts' | 'map-observations' | 'map-events' | 'processing';
type ImportMode = 'csv' | 'hoard' | 'lst';

export const ImportEngine: React.FC<ImportEngineProps> = ({ onDataLoaded, onClose }) => {
  const [mode, setMode] = useState<ImportMode>('csv');
  const [step, setStep] = useState<ImportStep>('upload');
  const [error, setError] = useState<string | null>(null);

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [contextHeaders, setContextHeaders] = useState<string[]>([]);
  const [contextRows, setContextRows] = useState<Record<string, any>[]>([]);
  const [observationHeaders, setObservationHeaders] = useState<string[]>([]);
  const [observationRows, setObservationRows] = useState<Record<string, any>[]>([]);
  const [eventHeaders, setEventHeaders] = useState<string[]>([]);
  const [eventRows, setEventRows] = useState<Record<string, any>[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  // ── Smart import state ────────────────────────────────────────────────────
  const [detectedSystem, setDetectedSystem] = useState<string | null>(null);
  const [contextSuggestions, setContextSuggestions] = useState<any>(null);
  const [observationSuggestions, setObservationSuggestions] = useState<any>(null);

  // ── HOARD state ────────────────────────────────────────────────────────────
  const [hoardFiles, setHoardFiles] = useState<{ name: string; status: 'loaded' | 'error'; errors?: string }[]>([]);
  const [hoardResult, setHoardResult] = useState<{ contexts: Context[]; observations: Observation[] } | null>(null);
  const [hoardWarnings, setHoardWarnings] = useState<string[]>([]);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // ── CSV handlers ───────────────────────────────────────────────────────────

  const handleContextFileLoaded = async (file: File) => {
    try {
      setError(null);
      const result = await parseCsvFile(file);
      setContextHeaders(result.headers);
      setContextRows(result.rows);

      // Smart import: detect system and suggest mappings
      const system = detectFieldSystem(result.headers);
      setDetectedSystem(system?.name ?? null);
      const suggestions = suggestMappings(result.headers);
      setContextSuggestions(suggestions);

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

      // Smart import: detect system and suggest mappings
      const system = detectFieldSystem(result.headers);
      setDetectedSystem(system?.name ?? null);
      const suggestions = suggestMappings(result.headers);
      setObservationSuggestions(suggestions);

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

  const submitCsvData = () => {
    setStep('processing');
    onDataLoaded(contexts, observations, events);
  };

  // ── HOARD handlers ─────────────────────────────────────────────────────────

  const handleHoardFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setHoardFiles([]);
    setHoardResult(null);
    setHoardWarnings([]);

    const sheets: HoardContextSheet[] = [];
    const fileStatuses: { name: string; status: 'loaded' | 'error'; errors?: string }[] = [];
    const allWarnings: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const json = JSON.parse(text) as HoardContextSheet;

        // Basic sanity check — must have context_number to be HOARD output
        if (!json.context_number) {
          fileStatuses.push({ name: file.name, status: 'error', errors: 'Missing context_number — not a HOARD JSON?' });
          continue;
        }

        sheets.push(json);
        fileStatuses.push({ name: file.name, status: 'loaded' });
      } catch (err: any) {
        fileStatuses.push({ name: file.name, status: 'error', errors: err.message });
      }
    }

    setHoardFiles(fileStatuses);

    if (sheets.length === 0) {
      setError('No valid HOARD JSON files could be parsed.');
      return;
    }

    const result = importHoardData(sheets);
    setHoardResult({ contexts: result.contexts, observations: result.observations });

    // Collect validation warnings
    for (const v of result.validation) {
      if (v.warnings.length > 0) {
        allWarnings.push(...v.warnings);
      }
      if (!v.valid) {
        allWarnings.push(...v.errors.map((e: string) => `Validation error: ${e}`));
      }
    }
    setHoardWarnings([...new Set(allWarnings)]);
  };

  const submitHoardData = () => {
    if (!hoardResult) return;
    setStep('processing');
    onDataLoaded(hoardResult.contexts, hoardResult.observations, []);
  };

  // ── Shared helpers ─────────────────────────────────────────────────────────

  // ── LST handlers ────────────────────────────────────────────────────────────

  const handleLstFileLoaded = async (file: File) => {
    try {
      setError(null);
      const text = await file.text();
      const result = parseLstFile(text, file.name);

      setLstFileName(file.name);
      setLstResult({
        contexts: result.contexts,
        observations: result.observations,
        warnings: result.warnings,
        metadata: result.metadata,
      });
    } catch (err: any) {
      setError(`Failed to parse .LST file: ${err.message}`);
    }
  };

  const submitLstData = () => {
    if (!lstResult) return;
    setStep('processing');
    onDataLoaded(lstResult.contexts, lstResult.observations, []);
  };

  const switchMode = (newMode: ImportMode) => {
    setMode(newMode);
    setStep('upload');
    setError(null);
    setLstResult(null);
    setLstFileName('');
  };

  const [lstResult, setLstResult] = useState<{ contexts: Context[]; observations: Observation[]; warnings: string[]; metadata: Record<string, string> } | null>(null);
  const [lstFileName, setLstFileName] = useState('');

  const stepLabel =
    step === 'map-contexts' ? 'Map Context Columns'
    : step === 'map-observations' ? 'Map Relationship Columns'
    : step === 'map-events' ? 'Map Event Columns'
    : mode === 'hoard' ? 'Import HOARD Phase 1 Output'
    : mode === 'lst' ? 'Import Legacy .LST File'
    : 'Import Stratigraphic Data';

  return (
    <div style={{ padding: '1.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{stepLabel}</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
            {step === 'upload' && mode === 'csv' && 'Upload your CSV data. Only Contexts and Observations are strictly required.'}
            {step === 'upload' && mode === 'hoard' && 'Select one or more HOARD Phase 1 JSON files (ctx_sheet_NNN.json).'}
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

      {/* Mode tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: '1.25rem',
        borderBottom: '1px solid var(--border-2)',
      }}>
        <button
          onClick={() => switchMode('csv')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: mode === 'csv' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: mode === 'csv' ? 'var(--text)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-body)',
            fontWeight: mode === 'csv' ? 600 : 400,
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          CSV Import
        </button>
        <button
          onClick={() => switchMode('hoard')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: mode === 'hoard' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: mode === 'hoard' ? 'var(--text)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-body)',
            fontWeight: mode === 'hoard' ? 600 : 400,
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          HOARD JSON
        </button>
        <button
          onClick={() => switchMode('lst')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderBottom: mode === 'lst' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: mode === 'lst' ? 'var(--text)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-body)',
            fontWeight: mode === 'lst' ? 600 : 400,
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          <Archive size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Legacy .LST
        </button>
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

      {/* ── CSV Import Step ───────────────────────────────────────────────── */}
      {mode === 'csv' && step === 'upload' && (
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
              onClick={submitCsvData}
              className="btn btn--primary"
              style={{ width: '100%', padding: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}
            >
              Generate Harris Matrix
            </button>
          )}

          <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text)' }}>Tip:</strong> The Observations CSV only needs two columns — one for the "above" unit and one for the "below" unit. Column names are flexible; you'll map them in the next step.
          </div>
        </div>
      )}

      {/* ── HOARD JSON Import Step ─────────────────────────────────────────── */}
      {mode === 'hoard' && step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Hidden file input */}
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            multiple
            style={{ display: 'none' }}
            onChange={handleHoardFilesSelected}
          />

          {/* Dropzone */}
          {(hoardFiles.length === 0) ? (
            <div
              onClick={() => jsonInputRef.current?.click()}
              style={{ cursor: 'pointer' }}
            >
              <Dropzone onFileLoaded={() => {}} title="HOARD Phase 1 JSON files" accept=".json" />
            </div>
          ) : (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}>
              <div>
                <button
                  onClick={() => jsonInputRef.current?.click()}
                  style={{
                    background: 'var(--surface-3)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text)',
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    marginRight: '0.75rem',
                  }}
                >
                  Add more files
                </button>
                <button
                  onClick={() => {
                    setHoardFiles([]);
                    setHoardResult(null);
                    setHoardWarnings([]);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-2)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-2)',
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Reset all
                </button>
              </div>
            </div>
          )}

          {/* File status list */}
          {hoardFiles.length > 0 && (
            <div style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '0.75rem',
              maxHeight: '200px',
              overflowY: 'auto',
            }}>
              <h4 style={{ fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--text-2)' }}>
                Files ({hoardFiles.filter(f => f.status === 'loaded').length}/{hoardFiles.length} loaded)
              </h4>
              {hoardFiles.map((f, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '3px 0',
                  fontSize: '0.8rem',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: f.status === 'loaded' ? 'var(--success)' : 'var(--error)',
                  }} />
                  <span style={{ color: 'var(--text)' }}>{f.name}</span>
                  {f.errors && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>— {f.errors}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {hoardWarnings.length > 0 && (
            <div style={{
              background: 'rgba(212, 139, 69, 0.12)',
              border: '1px solid rgba(212, 139, 69, 0.4)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem',
              fontSize: '0.8rem',
              color: 'var(--text-2)',
            }}>
              <strong style={{ color: '#d48b45' }}>Validation warnings:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                {hoardWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Summary + import button */}
          {hoardResult && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              padding: '1rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Contexts</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
                    {hoardResult.contexts.length}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Relationships</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
                    {hoardResult.observations.length}
                  </div>
                </div>
                {hoardResult.observations.length === 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--warning)', alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>
                    No relationships found — GLM-OCR may not have extracted the matrix diagram
                  </div>
                )}
              </div>

              <button
                onClick={submitHoardData}
                className="btn btn--primary"
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
              >
                Generate Harris Matrix from {hoardResult.contexts.length} contexts
              </button>
            </div>
          )}

          {/* Tip */}
          <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text)' }}>Tip:</strong> HOARD Phase 1 outputs are saved as <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>ctx_sheet_NNN.json</code> files in the <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>01_digitised/</code> directory. Select as many as you need — hold Shift or Ctrl to multi-select. Stub contexts are automatically created for referenced contexts that weren't imported.
          </div>
        </div>
      )}

      {/* ── Legacy .LST Import Step ───────────────────────────────────────── */}
      {mode === 'lst' && step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!lstResult ? (
            <Dropzone onFileLoaded={handleLstFileLoaded} title="BASP / ArchEd .LST file" accept=".lst,.txt" />
          ) : (
            <>
              {/* Summary */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                padding: '1rem',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Archive size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lstFileName}</span>
                </div>

                {Object.keys(lstResult.metadata).length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
                    {Object.entries(lstResult.metadata).map(([k, v]) => (
                      <div key={k}><strong>{k}:</strong> {v}</div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Contexts</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
                      {lstResult.contexts.length}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Relationships</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
                      {lstResult.observations.length}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Format</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
                      {lstResult.observations.length > 0 ? 'BASP / ArchEd' : 'Metadata only'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {lstResult.warnings.length > 0 && (
                <div style={{
                  background: 'rgba(212, 139, 69, 0.12)',
                  border: '1px solid rgba(212, 139, 69, 0.4)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-2)',
                }}>
                  <strong style={{ color: '#d48b45' }}>Import notices:</strong>
                  <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                    {lstResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Re-upload button */}
              <button
                onClick={() => { setLstResult(null); setLstFileName(''); }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-2)',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  alignSelf: 'flex-start',
                }}
              >
                Choose a different file
              </button>

              <button
                onClick={submitLstData}
                className="btn btn--primary"
                style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}
              >
                Generate Harris Matrix from {lstResult.contexts.length} contexts
              </button>
            </>
          )}

          {/* Tip */}
          <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--text)' }}>Tip:</strong> The .LST (List) format was used by BASP (Bonn Archaeological Software Package) and ArchEd. Select a .lst or .txt file exported from these programs. Supports classic <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>*HEADING</code> / <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>*CONTEXT DEFINITIONS</code> / <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>*RELATIONS</code> format, ArchEd JSON extended format, and Stratify-compatible <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>*ABOVE</code> / <code style={{ background: 'var(--surface-3)', padding: '1px 4px', borderRadius: 3 }}>*EQUAL</code> sections. Stub contexts are created for referenced IDs not defined in the file.
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
          initialMapping={contextSuggestions}
          detectedSystem={detectedSystem ?? undefined}
        />
      )}

      {/* Step: Map observations */}
      {step === 'map-observations' && (
        <ColumnMapper
          type="observation"
          headers={observationHeaders}
          onMappingComplete={handleObservationMappingComplete}
          onCancel={() => setStep('upload')}
          initialMapping={observationSuggestions}
          detectedSystem={detectedSystem ?? undefined}
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
