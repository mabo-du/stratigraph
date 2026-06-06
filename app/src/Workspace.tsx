import { useRef, useCallback, useEffect, useState, startTransition } from 'react';
import { useMatrixStore } from './hooks/useMatrixStore';
import { MatrixCanvas } from './components/MatrixCanvas';
import type { MatrixCanvasHandle } from './components/MatrixCanvas';
import { Scene3D } from './components/Scene3D';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { ImportEngine } from './components/ImportEngine';
import { SearchOverlay } from './components/SearchOverlay';
import { Dashboard } from './components/Dashboard';
import { OfflineProjects } from './components/OfflineProjects';
import { saveProject, loadProject, buildGeoJSON, exportGeoJSON, loadDemoProject } from './utils/fileUtils';
import { generateTrowelEedp } from './utils/trowelExport';
import { exportArchesJson } from './utils/archesExporter';
import { isTauri, saveFileDialog } from './utils/tauriBridge';
import type { PublicationTemplate } from './utils/cytoscapeHelpers';
import { buildAdjacencyList, findCyclePath, wouldCreateCycle, transitiveReduction } from './models/graphLogic';
import { generateOxCalScript, generateLibbyPayload } from './models/bayesianLogic';
import { generateHoardMarkdown, generateHoardJson } from './models/hoardExport';
import { generateMatrixReport } from './models/hoardReport';
import { RelationshipType } from './models/hmdp';
import type { Context, Observation, Phase } from './models/hmdp';
import type { LayoutPosition } from './models/matrixState';
import { useConflictToast } from './components/ConflictToast';
import { loadCurve, calibrateDate } from './utils/calibration';
import type { CurvePoint } from './utils/calibration';
import { PaleoPanel } from './components/PaleoPanel';
export interface WorkspaceProps {
  collab: {
    isConnected: boolean;
    status: any;
    users: any[];
    shareableLink: string;
    startSession: () => void;
    leaveSession: () => void;
  };
}

export function Workspace({ collab }: WorkspaceProps) {
  const { state, dispatch, canUndo, canRedo, isLoaded, undo, redo } = useMatrixStore();
  const canvasRef = useRef<MatrixCanvasHandle>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showOfflineProjects, setShowOfflineProjects] = useState(false);
  const [showPhaseGroups, setShowPhaseGroups] = useState(true);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [publicationMode, setPublicationMode] = useState(false);
  const [publicationTemplate, setPublicationTemplate] = useState<PublicationTemplate>('standard');
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [timelineMode, setTimelineMode] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const [showPaleo, setShowPaleo] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [curve, setCurve] = useState<CurvePoint[] | null>(null);
  const [showRag, setShowRag] = useState(false);

  // Load calibration curve for timeline mode
  useEffect(() => { loadCurve().then(c => setCurve(c)).catch(() => {}); }, []);

  // Sync theme to document body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Timeline mode: compute calibrated Y positions ──────────────────────
  const [timelinePositions, setTimelinePositions] = useState<Record<string, LayoutPosition>>({});
  const [timelineAxis, setTimelineAxis] = useState<{ minDate: number; maxDate: number } | null>(null);
  useEffect(() => {
    if (!timelineMode || !curve || state.events.length === 0) {
      if (timelinePositions && Object.keys(timelinePositions).length > 0) {
        Promise.resolve().then(() => { setTimelinePositions({}); setTimelineAxis(null); });
      }
      return;
    }
    const c14Events = state.events.filter(e => e.type === 'C14' && e.rDate);
    if (c14Events.length === 0) return;
    const contextDates: Record<string, number[]> = {};
    for (const event of c14Events) {
      const parts = event.rDate!.split(',').map(s => s.trim());
      if (parts.length !== 2) continue;
      const bp = parseInt(parts[0]);
      const sigma = parseInt(parts[1]);
      if (isNaN(bp) || isNaN(sigma)) continue;
      try {
        const result = calibrateDate(curve, bp, sigma);
        const ctxId = String(event.contextId);
        if (!contextDates[ctxId]) contextDates[ctxId] = [];
        contextDates[ctxId].push(result.median);
      } catch { /* skip bad dates */ }
    }
    if (Object.keys(contextDates).length === 0) return;
    const allMedians: number[] = [];
    const avgCtxDate: Record<string, number> = {};
    for (const [ctxId, medians] of Object.entries(contextDates)) {
      const avg = medians.reduce((a, b) => a + b, 0) / medians.length;
      avgCtxDate[ctxId] = avg;
      allMedians.push(avg);
    }
    if (allMedians.length < 2) return;
    const minDate = Math.min(...allMedians);
    const maxDate = Math.max(...allMedians);
    const range = maxDate - minDate || 1;
    const positions: Record<string, LayoutPosition> = {};
    for (const [ctxId, avg] of Object.entries(avgCtxDate)) {
      const y = 750 - ((avg - minDate) / range) * 650;
      positions[ctxId] = { x: 0, y: Math.round(y) };
    }

    startTransition(() => {
      setTimelinePositions(positions);
      setTimelineAxis({ minDate, maxDate });
    });
  }, [timelineMode, curve, state.events]);

  // ── Save handler (defined early for keyboard shortcut dependency) ─────
  const handleSave = useCallback(async () => {
    await saveProject(state);
  }, [state]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Ctrl+Z / Ctrl+Shift+Z — undo/redo (always active)
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); return; }

      // Ctrl+S — save project
      if (ctrl && e.key === 's') { e.preventDefault(); handleSave(); return; }

      // Ctrl+F — search
      if (ctrl && e.key === 'f') { e.preventDefault(); setShowSearch(true); return; }

      // Escape — deselect / close modal / close search
      if (e.key === 'Escape') {
        dispatch({ type: 'SELECT_CONTEXT', id: null });
        dispatch({ type: 'TOGGLE_IMPORT_MODAL', open: false });
        setShowSearch(false);
        return;
      }

      // Delete / Backspace — delete selected node (only when not typing in a form)
      if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace') && state.selectedContextId) {
        e.preventDefault();
        const id = state.selectedContextId;
        if (confirm(`Delete SU "${id}"? This will also remove all its relationships.`)) {
          dispatch({ type: 'DELETE_CONTEXT', id });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, dispatch, handleSave, state.selectedContextId]);

  // ── Import handler ──────────────────────────────────────────────────────
  const handleImportData = useCallback((contexts: Context[], observations: Observation[], events: import('./models/hmdp').Event[] = []) => {
    try {
      // Only validate/reduce directional edges (Above/Below)
      const directionalObs = observations.filter(
        o => o.relationshipType === RelationshipType.Above ||
             o.relationshipType === RelationshipType.Below
      );
      const nonDirectionalObs = observations.filter(
        o => o.relationshipType === RelationshipType.Equals ||
             o.relationshipType === RelationshipType.Contemporary
      );

      const adjList = buildAdjacencyList(directionalObs);

      const cyclePath = findCyclePath(adjList);

      if (cyclePath) {
        const loopDisplay = cyclePath.join(' → ');
        alert(
          'Stratigraphic cycle detected!\n\n' +
          `Impossible loop: ${loopDisplay}\n\n` +
          'This means the data contains a circular relationship where a context is both above and below another context through a chain of relationships.\n\n' +
          'Please fix this in your CSV and try again.'
        );
        return;
      }

      // Transitive reduction — remove edges implied by longer paths
      const reducedAdj = transitiveReduction(adjList);

      const reducedDirectional = directionalObs.filter(obs => {
        // Normalise direction for the adjacency list lookup
        const [src, tgt] = obs.relationshipType === RelationshipType.Below
          ? [obs.target, obs.source]
          : [obs.source, obs.target];
        const neighbors = reducedAdj[src] ?? [];
        return neighbors.includes(tgt);
      });

      // Combine: reduced directional + all non-directional
      const finalObs = [...reducedDirectional, ...nonDirectionalObs];

      if (state.contexts.length > 0) {
        if (!confirm('This will merge the imported data into your current project. Do you want to proceed?')) {
          return;
        }
      }

      dispatch({ type: 'IMPORT_DATA', contexts, observations: finalObs, events });
      dispatch({ type: 'TOGGLE_IMPORT_MODAL', open: false });
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    }
  }, [dispatch, state.contexts.length]);


  const handleLoadOfflineProject = useCallback((data: any) => {
    dispatch({
      type: 'LOAD_PROJECT',
      state: {
        meta: {
          projectName: data.projectName ?? 'Untitled Matrix',
          siteName: data.siteName ?? '',
          excavationYear: data.excavationYear ?? '',
          notes: data.notes ?? '',
        },
        contexts: data.contexts ?? [],
        observations: data.observations ?? [],
        events: data.events ?? [],
        phases: data.phases ?? [],
        positions: data.positions ?? {},
        dataVersion: 0,
        selectedContextId: null,
        showImportModal: false,
        sidebarTab: 'units',
        past: [],
        future: [],
      },
    });
  }, [dispatch]);

  const handleLoadDemo = useCallback(async () => {
    const data = await loadDemoProject();
    if (!data) {
      alert('Failed to load demo project. The demo file may not be available.');
      return;
    }
    dispatch({
      type: 'LOAD_PROJECT',
      state: {
        meta: data.meta,
        contexts: data.contexts ?? [],
        observations: data.observations ?? [],
        events: data.events ?? [],
        phases: data.phases ?? [],
        positions: data.positions ?? {},
        dataVersion: 0,
        selectedContextId: null,
        showImportModal: false,
        sidebarTab: 'units',
        past: [],
        future: [],
      },
    });
  }, [dispatch]);

  const handleLoadFile = useCallback(async (file: File) => {
    try {
      const loaded = await loadProject(file);
      dispatch({
        type: 'LOAD_PROJECT',
        state: {
          meta: loaded.meta,
          contexts: loaded.contexts ?? [],
          observations: loaded.observations ?? [],
          events: loaded.events ?? [],
          phases: loaded.phases ?? [],
          positions: loaded.positions ?? {},
          dataVersion: 0,
          selectedContextId: null,
          showImportModal: false,
          sidebarTab: 'units',
          past: [],
          future: [],
        },
      });
    } catch (err: any) {
      alert(`Failed to load project: ${err.message}`);
    }
  }, [dispatch]);

  // ── Position callbacks ──────────────────────────────────────────────────
  const handlePositionsChange = useCallback((positions: Record<string, LayoutPosition>) => {
    Object.entries(positions).forEach(([id, position]) => {
      dispatch({ type: 'UPDATE_POSITION', id, position });
    });
  }, [dispatch]);

  const handleLayoutComplete = useCallback((positions: Record<string, LayoutPosition>) => {
    dispatch({ type: 'SET_POSITIONS', positions });
  }, [dispatch]);

  // ── Graph mutators ──────────────────────────────────────────────────────
  const handleAddContext    = useCallback((ctx: Context)    => dispatch({ type: 'ADD_CONTEXT', context: ctx }),       [dispatch]);
  const handleUpdateContext = useCallback((ctx: Context)    => dispatch({ type: 'UPDATE_CONTEXT', context: ctx }),    [dispatch]);
  const handleDeleteContext = useCallback((id: string)      => dispatch({ type: 'DELETE_CONTEXT', id }),              [dispatch]);
  const handleDeleteObs     = useCallback((id: string)      => dispatch({ type: 'DELETE_OBSERVATION', id }),          [dispatch]);
  const handleAddPhase      = useCallback((p: Phase)        => dispatch({ type: 'ADD_PHASE', phase: p }),             [dispatch]);
  const handleUpdatePhase   = useCallback((p: Phase)        => dispatch({ type: 'UPDATE_PHASE', phase: p }),          [dispatch]);
  const handleDeletePhase   = useCallback((id: string)      => dispatch({ type: 'DELETE_PHASE', id }),                [dispatch]);

  const handleAddObservation = useCallback((obs: Observation) => {
    // Real-time cycle validation: check if adding this relationship would
    // create an impossible stratigraphic loop
    if (obs.relationshipType === RelationshipType.Above ||
        obs.relationshipType === RelationshipType.Below) {
      const directionalObs = state.observations.filter(
        o => o.relationshipType === RelationshipType.Above ||
             o.relationshipType === RelationshipType.Below
      );
      const adjList = buildAdjacencyList(directionalObs);

      // Normalise the candidate edge direction
      const [from, to] = obs.relationshipType === RelationshipType.Below
        ? [obs.target, obs.source]
        : [obs.source, obs.target];

      const cyclePath = wouldCreateCycle(adjList, from, to);
      if (cyclePath) {
        const loopDisplay = cyclePath.join(' → ');
        alert(
          'Cannot add this relationship!\n\n' +
          `It would create an impossible stratigraphic loop:\n${loopDisplay}\n\n` +
          'A context cannot be both above and below another context through a chain of relationships.'
        );
        return;
      }
    }

    dispatch({ type: 'ADD_OBSERVATION', observation: obs });
    // Reset positions so the auto-layout re-runs with the new edge
    dispatch({ type: 'SET_POSITIONS', positions: {} });
  }, [dispatch, state.observations]);

  // ── Bayesian Export ─────────────────────────────────────────────────────
  const handleExportLibbyJson = useCallback(() => {
    try {
      const payload = generateLibbyPayload(
        state.meta.projectName, state.contexts, state.observations, state.events,
      );
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(state.meta.projectName || 'matrix').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_libby.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate Libby payload: ${err.message}`);
    }
  }, [state]);

  const handleExportOxCal = useCallback(() => {
    try {
      const script = generateOxCalScript(state.contexts, state.observations, state.events);
      const blob = new Blob([script], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.meta.projectName || 'matrix'}.oxcal`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate OxCal script: ${err.message}`);
    }
  }, [state.contexts, state.observations, state.events, state.meta.projectName]);

  const handleExportHoardText = useCallback(() => {
    try {
      const text = generateHoardMarkdown(state.meta.projectName, state.contexts, state.observations, state.events);
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.meta.projectName || 'hoard_payload'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate HOARD Text Payload: ${err.message}`);
    }
  }, [state.contexts, state.observations, state.events, state.meta.projectName]);

  const handleExportHoardJson = useCallback(() => {
    try {
      const json = generateHoardJson(state.meta.projectName, state.contexts, state.observations, state.events);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.meta.projectName || 'hoard_payload'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate HOARD JSON Payload: ${err.message}`);
    }
  }, [state.contexts, state.observations, state.events, state.meta.projectName]);

  const handleExportTrowel = useCallback(() => {
    try {
      const json = generateTrowelEedp(
        state.meta.projectName, state.contexts, state.observations, state.events,
      );
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(state.meta.projectName || 'matrix').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_trowel_eedp.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate Trowel payload: ${err.message}`);
    }
  }, [state]);

  const handleExportReport = useCallback(() => {
    try {
      const report = generateMatrixReport(
        state.meta.projectName, state.contexts, state.observations, state.phases, state.events,
      );
      const blob = new Blob([report.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(state.meta.projectName || 'matrix').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate report: ${err.message}`);
    }
  }, [state]);

  const handleExportReportJson = useCallback(() => {
    try {
      const report = generateMatrixReport(
        state.meta.projectName, state.contexts, state.observations, state.phases, state.events,
      );
      const blob = new Blob([report.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(state.meta.projectName || 'matrix').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to generate report JSON: ${err.message}`);
    }
  }, [state]);

  const handleExportGeoJSON = useCallback((crs: 'EPSG:4326' | 'EPSG:3857') => {
    try {
      const result = buildGeoJSON(state, crs);
      if (result.featureCount === 0) {
        if (result.totalContexts === 0) {
          alert('No contexts in project. Add contexts first, then try again.');
        } else {
          alert(
            `No contexts with spatial coordinates found.\n\n` +
            `${result.totalContexts} contexts exist but none have spatial centroids.\n` +
            `Import contexts with centroid X/Y columns via CSV import, then try again.`
          );
        }
        return;
      }
      exportGeoJSON(state, crs);
    } catch (err: any) {
      alert(`Failed to export GeoJSON: ${err.message}`);
    }
  }, [state]);

  const handleExportArches = useCallback(async () => {
    try {
      const jsonStr = exportArchesJson(state.contexts, state.observations);
      const safeName = state.meta.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      const success = await saveFileDialog(jsonStr, {
        defaultName: `${safeName}_arches.json`,
        filters: [{ name: 'ArchesDB JSON', extensions: ['json'] }]
      });
      if (success && isTauri()) {
        alert('ArchesDB export saved successfully.');
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  }, [state]);

  // Workspace assumes collab is provided via props or Context, but we actually just use the MatrixStore!
  // We'll pass collab props from App for the Toolbar.
  // Wait, I need to pass collab status down! Let's add props to Workspace.

  // Conflict notifications
  const { toast: conflictToast, showConflict } = useConflictToast();
  const previousEdgesRef = useRef(state.observations.length);
  useEffect(() => {
    if (state.observations.length > previousEdgesRef.current) {
      // Check for cycles after each new edge
      const adj = buildAdjacencyList(state.observations);
      const cycle = findCyclePath(adj);
      if (cycle && cycle.length > 0) {
        showConflict(`⚠ Cycle detected — edge between ${cycle[0]} and ${cycle[cycle.length - 1]} creates an impossible stratigraphic relationship`);
      }
    }
    previousEdgesRef.current = state.observations.length;
  }, [state.observations, showConflict]);

  return (
    <div className="app-shell">
      <Toolbar
        projectName={state.meta.projectName}
        onProjectNameChange={name => dispatch({ type: 'SET_META', meta: { projectName: name } })}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onAutoLayout={() => canvasRef.current?.triggerAutoLayout()}
        onFitView={() => canvasRef.current?.fitView()}
        onImport={() => dispatch({ type: 'TOGGLE_IMPORT_MODAL', open: true })}
        onSave={handleSave}
        onLoad={() => loadInputRef.current?.click()}
        onShowOfflineProjects={() => setShowOfflineProjects(true)}
        onLoadDemo={handleLoadDemo}
        onExportPNG={() => canvasRef.current?.exportPNG()}
        onExportSVG={() => canvasRef.current?.exportSVG()}
        onExportPDF={() => canvasRef.current?.exportPDF()}
        onExportOxCal={handleExportOxCal}
        onExportLibbyJson={handleExportLibbyJson}
        onExportTrowel={handleExportTrowel}
        onExportHoardText={handleExportHoardText}
        onExportHoardJson={handleExportHoardJson}
        onExportReport={handleExportReport}
        onExportReportJson={handleExportReportJson}
        onExportGeoJSON={handleExportGeoJSON}
        onExportArches={handleExportArches}
        contextCount={state.contexts.length}
          showPhaseGroups={showPhaseGroups}
          onTogglePhaseGroups={() => setShowPhaseGroups(prev => !prev)}
          collapsedPhases={collapsedPhases}
          onCollapseAllPhases={() => setCollapsedPhases(new Set(state.phases.map(p => p.id)))}
          onExpandAllPhases={() => setCollapsedPhases(new Set())}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        publicationMode={publicationMode}
        onTogglePublicationMode={() => setPublicationMode(prev => !prev)}
        publicationTemplate={publicationTemplate}
        onPublicationTemplateChange={setPublicationTemplate}
        heatmapMode={heatmapMode}
        onToggleHeatmapMode={() => setHeatmapMode(prev => !prev)}
        timelineMode={timelineMode}
        onToggleTimelineMode={() => setTimelineMode(prev => !prev)}
        show3D={show3D}
        onToggle3D={() => setShow3D(prev => !prev)}
        showDashboard={showDashboard}
        onToggleDashboard={() => setShowDashboard(prev => !prev)}
        collabConnected={collab.isConnected}
        collabStatus={collab.status}
        collabUsers={collab.users.map(u => ({
          userId: u.userId,
          displayName: u.displayName,
          color: u.color,
          activity: u.activity,
        }))}
        collabPending={0}
        collabShareableLink={collab.shareableLink}
        onStartSession={collab.startSession}
        onLeaveSession={collab.leaveSession}
        showPaleo={showPaleo}
        onTogglePaleo={() => setShowPaleo(prev => !prev)}
        showRag={showRag}
        onToggleRag={() => setShowRag(prev => !prev)}
      />
      {conflictToast}
      <input ref={loadInputRef}
        type="file"
        accept=".json,.hmatrix.json"
        style={{ display: 'none' }}
        onChange={async e => {
          if (e.target.files?.[0]) await handleLoadFile(e.target.files[0]);
          e.target.value = '';
        }}
      />

      <div className="workspace">
        <Sidebar
          contexts={state.contexts}
          observations={state.observations}
          events={state.events}
          phases={state.phases}
          selectedId={state.selectedContextId}
          sidebarTab={state.sidebarTab}
          onSelectContext={id => dispatch({ type: 'SELECT_CONTEXT', id })}
          onAddContext={handleAddContext}
          onUpdateContext={handleUpdateContext}
          onDeleteContext={handleDeleteContext}
          onAddObservation={handleAddObservation}
          onDeleteObservation={handleDeleteObs}
          onAddPhase={handleAddPhase}
          onUpdatePhase={handleUpdatePhase}
          onDeletePhase={handleDeletePhase}
          onSetTab={tab => dispatch({ type: 'SET_SIDEBAR_TAB', tab })}
        />

        {showDashboard ? (
          <Dashboard />
        ) : show3D ? (
          <Scene3D
            contexts={state.contexts}
            phases={state.phases}
            selectedId={state.selectedContextId}
            onSelectContext={id => dispatch({ type: 'SELECT_CONTEXT', id })}
          />
        ) : !isLoaded ? (
          <div className="skeleton-loader" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
            <h2>Loading Matrix...</h2>
          </div>
        ) : (
          <MatrixCanvas
            ref={canvasRef}
            contexts={state.contexts}
            observations={state.observations}
            events={state.events}
            phases={state.phases}
            positions={state.positions}
            selectedContextId={state.selectedContextId}
            projectName={state.meta.projectName}
            showPhaseGroups={showPhaseGroups}
            collapsedPhases={collapsedPhases}
            dataVersion={state.dataVersion}
            theme={theme}
            publicationMode={publicationMode}
            publicationTemplate={publicationTemplate}
            heatmapMode={heatmapMode}
            timelineMode={timelineMode}
            timelinePositions={timelinePositions}
            timelineAxis={timelineAxis}
            onNodeSelect={id => dispatch({ type: 'SELECT_CONTEXT', id })}
            onPositionsChange={handlePositionsChange}
            onLayoutComplete={handleLayoutComplete}
          />
        )}
      </div>

      {/* Import Modal */}
      {state.showImportModal && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) {
              dispatch({ type: 'TOGGLE_IMPORT_MODAL', open: false });
            }
          }}
        >
          <div className="modal-panel">
            <ImportEngine
              onDataLoaded={handleImportData}
              onClose={() => dispatch({ type: 'TOGGLE_IMPORT_MODAL', open: false })}
            />
          </div>
        </div>
      )}

      {/* Offline Projects Modal */}
      {showOfflineProjects && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowOfflineProjects(false); }}
        >
          <div className="modal-panel" style={{ maxWidth: 520 }}>
            <OfflineProjects
              onLoadProject={handleLoadOfflineProject}
              onClose={() => setShowOfflineProjects(false)}
            />
          </div>
        </div>
      )}

      {/* Search Overlay */}
      {showSearch && (
        <SearchOverlay
          contexts={state.contexts}
          phases={state.phases}
          onClose={() => setShowSearch(false)}
          onSelect={(id) => {
            dispatch({ type: 'SELECT_CONTEXT', id });
            setShowSearch(false);
            // Small delay to ensure Canvas is ready after potential re-render
            setTimeout(() => canvasRef.current?.focusNode(id), 50);
          }}
        />
      )}
      <PaleoPanel
        open={showPaleo}
        onClose={() => setShowPaleo(false)}
        contexts={state.contexts}
      />
    </div>
  );
}


