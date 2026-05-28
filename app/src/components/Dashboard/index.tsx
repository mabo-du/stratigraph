import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, Search, X } from 'lucide-react';
import type { LoadedProject, DashboardStats } from '../../utils/crossMatrixQuery';
import { loadProjectFile, computeStats, queryContexts, buildCombinedGeoJSON } from '../../utils/crossMatrixQuery';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<LoadedProject[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [filterType, setFilterType] = useState('');
  const [filterPhase, setFilterPhase] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [queryResults, setQueryResults] = useState<Array<{ projectName: string; context: any }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const loaded: LoadedProject[] = [];
    for (let i = 0; i < files.length; i++) {
      loaded.push(await loadProjectFile(files[i]));
    }
    const all = [...projects, ...loaded];
    setProjects(all);
    setStats(computeStats(all));
  }, [projects]);

  const handleRemoveProject = useCallback((id: string) => {
    const filtered = projects.filter(p => p.id !== id);
    setProjects(filtered);
    setStats(filtered.length > 0 ? computeStats(filtered) : null);
  }, [projects]);

  const handleQuery = useCallback(() => {
    const results = queryContexts(projects, {
      type: filterType || undefined,
      phase: filterPhase || undefined,
      search: filterSearch || undefined,
    });
    setQueryResults(results);
  }, [projects, filterType, filterPhase, filterSearch]);

  const handleExportGeoJSON = useCallback(() => {
    const json = buildCombinedGeoJSON(projects);
    const blob = new Blob([json], { type: 'application/geo+json' });
    downloadBlob(blob, `combined_projects.geojson`);
  }, [projects]);

  // Extract unique types and phases for filter dropdowns
  const uniqueTypes = [...new Set(projects.flatMap(p => p.contexts.map(c => c.type).filter(Boolean)))];
  const uniquePhases = [...new Set(projects.flatMap(p => p.contexts.map(c => c.phase).filter(Boolean)))];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '1.4rem' }}>Multi-Site Dashboard</h2>

      {/* File input */}
      <div style={{ marginBottom: 20 }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".json,.hmatrix.json"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        <button
          className="tb-btn tb-btn--labeled tb-btn--accent"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={15} />
          <span>Load Projects</span>
        </button>
        {projects.length > 0 && (
          <span style={{ marginLeft: 12, fontSize: '0.85rem', color: '#888' }}>
            {projects.length} project{projects.length > 1 ? 's' : ''} loaded
          </span>
        )}
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Projects" value={stats.totalProjects} color="#5b9bd5" />
          <StatCard label="Contexts" value={stats.totalContexts} color="#4a9e6f" />
          <StatCard label="Relationships" value={stats.totalObservations} color="#d45c9a" />
          <StatCard label="Georeferenced" value={stats.contextsWithCoords} color="#c8952a" />
        </div>
      )}

      {/* Per-project breakdown */}
      {stats && stats.perProject.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Projects</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.perProject.map(p => (
              <div key={p.id} style={{
                background: '#f5f5f5', borderRadius: 6, padding: '8px 12px',
                fontSize: '0.85rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{p.name}</strong>
                    {p.siteName && <span style={{ color: '#888' }}> — {p.siteName}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span>{p.contextCount} ctx</span>
                    <span>{p.observationCount} rel</span>
                    <span>{p.phaseCount} phases</span>
                    <X
                      size={14}
                      onClick={() => handleRemoveProject(p.id)}
                      style={{ cursor: 'pointer', opacity: 0.4 }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Type distribution */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Contexts by Type</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <span key={type} style={{
                background: '#e3f0fa', color: '#5b9bd5',
                padding: '3px 10px', borderRadius: 12,
                fontSize: '0.8rem',
              }}>
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Phase distribution */}
      {stats && Object.keys(stats.byPhase).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Contexts by Phase</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(stats.byPhase).sort((a, b) => b[1] - a[1]).map(([phase, count]) => (
              <span key={phase} style={{
                background: '#e8f5e9', color: '#4a9e6f',
                padding: '3px 10px', borderRadius: 12,
                fontSize: '0.8rem',
              }}>
                {phase}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Query filters */}
      {projects.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Query</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem' }}
            >
              <option value="">All types</option>
              {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={filterPhase}
              onChange={e => setFilterPhase(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem' }}
            >
              <option value="">All phases</option>
              {uniquePhases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: 8, color: '#888' }} />
              <input
                placeholder="Search descriptions..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px 6px 28px', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem' }}
              />
            </div>
            <button className="tb-btn tb-btn--labeled" onClick={handleQuery}>
              <Search size={14} />
              <span>Search</span>
            </button>
            <button className="tb-btn tb-btn--labeled" onClick={handleExportGeoJSON} title="Export combined GeoJSON">
              <Download size={14} />
              <span>Export GeoJSON</span>
            </button>
          </div>
        </div>
      )}

      {/* Query results */}
      {queryResults.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>
            Results ({queryResults.length})
          </h3>
          <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
            {queryResults.map((r, i) => (
              <div key={i} style={{
                padding: '8px 12px', borderBottom: '1px solid #f0f0f0',
                fontSize: '0.85rem',
              }}>
                <div style={{ fontWeight: 500 }}>
                  {r.context.id}
                  <span style={{ color: '#888', fontWeight: 400, marginLeft: 8 }}>
                    [{r.context.type}] — {r.projectName}
                  </span>
                </div>
                {r.context.description && (
                  <div style={{ color: '#555', marginTop: 2 }}>{r.context.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>No projects loaded</p>
          <p style={{ fontSize: '0.85rem' }}>Click "Load Projects" to select .hmatrix.json files</p>
        </div>
      )}
    </div>
  );
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#faf9f6', borderRadius: 8, padding: 16,
      border: `1px solid ${color}20`,
    }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: '#888' }}>{label}</div>
    </div>
  );
}
