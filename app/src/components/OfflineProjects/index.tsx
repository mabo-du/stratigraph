import React, { useState, useEffect } from 'react';
import { Save, Trash2, HardDrive, Download } from 'lucide-react';
import { listSavedProjects, loadProjectOffline, deleteProjectOffline, getProjectCount } from '../../utils/offlineStorage';

interface OfflineProjectsProps {
  onLoadProject: (data: any) => void;
  onClose: () => void;
}

export const OfflineProjects: React.FC<OfflineProjectsProps> = ({ onLoadProject, onClose }) => {
  const [projects, setProjects] = useState<{ id: string; name: string; siteName: string; savedAt: string }[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listSavedProjects();
      setProjects(list);
      setCount(await getProjectCount());
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSavedProjects();
        if (!cancelled) { setProjects(list); setCount(await getProjectCount()); }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLoad = async (id: string) => {
    const project = await loadProjectOffline(id);
    if (project) {
      onLoadProject(project.data);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProjectOffline(id);
    refresh();
  };

  const handleExportFile = async (id: string) => {
    const project = await loadProjectOffline(id);
    if (!project) return;
    const blob = new Blob([JSON.stringify(project.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.hmatrix.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '1.75rem', maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 4 }}>
            <HardDrive size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Offline Projects
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '0.82rem' }}>
            {count} project{count !== 1 ? 's' : ''} saved in browser storage
          </p>
        </div>
        <button onClick={onClose} className="icon-btn" title="Close">
          ✕
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Loading…</p>}

      {!loading && projects.length === 0 && (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-2)',
          fontSize: '0.85rem',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--radius)',
        }}>
          <Save size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>No projects saved offline yet.</p>
          <p style={{ marginTop: 6, fontSize: '0.78rem' }}>
            Projects are automatically saved to your browser when you click Save (Ctrl+S).
          </p>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map(p => (
            <div key={p.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0.75rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>{p.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                  {p.siteName || 'No site'} · {new Date(p.savedAt).toLocaleDateString()}
                </div>
              </div>
              <button className="icon-btn" onClick={() => handleLoad(p.id)} title="Load project">
                <Download size={14} />
              </button>
              <button className="icon-btn" onClick={() => handleExportFile(p.id)} title="Export as file">
                <Save size={14} />
              </button>
              <button className="icon-btn icon-btn--danger" onClick={() => handleDelete(p.id)} title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
