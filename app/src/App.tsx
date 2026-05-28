import { useRef, useCallback, useEffect, useState } from 'react';
import { useMatrixStore } from './hooks/useMatrixStore';
import { MatrixCanvas } from './components/MatrixCanvas';
import type { MatrixCanvasHandle } from './components/MatrixCanvas';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { ImportEngine } from './components/ImportEngine';
import { SearchOverlay } from './components/SearchOverlay';
import { saveProject, loadProject, buildGeoJSON, exportGeoJSON } from './utils/fileUtils';
import type { PublicationTemplate } from './utils/cytoscapeHelpers';
import { buildAdjacencyList, findCyclePath, wouldCreateCycle, transitiveReduction } from './models/graphLogic';
import { generateOxCalScript } from './models/bayesianLogic';
import { generateHoardMarkdown, generateHoardJson } from './models/hoardExport';
import { RelationshipType } from './models/hmdp';
import type { Context, Observation, Phase } from './models/hmdp';
import type { LayoutPosition } from './models/matrixState';

function App() {
  const { state, dispatch, canUndo, canRedo, undo, redo } = useMatrixStore();
  const canvasRef = useRef<MatrixCanvasHandle>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showPhaseGroups, setShowPhaseGroups] = useState(true);
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [publicationMode, setPublicationMode] = useState(false);
  const [publicationTemplate, setPublicationTemplate] = useState<PublicationTemplate>('standard');
  const [heatmapMode, setHeatmapMode] = useState(false);

  // Sync theme to document body
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Save handler (defined early for keyboard shortcut dependency) ─────
  const handleSave = useCallback(() => {
    saveProject(state);
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

      dispatch({ type: 'IMPORT_DATA', contexts, observations: finalObs, events });
      dispatch({ type: 'TOGGLE_IMPORT_MODAL', open: false });
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    }
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

  const handleExportGeoJSON = useCallback(() => {
    try {
      const result = buildGeoJSON(state);
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
      exportGeoJSON(state);
    } catch (err: any) {
      alert(`Failed to export GeoJSON: ${err.message}`);
    }
  }, [state]);

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
        onExportPNG={() => canvasRef.current?.exportPNG()}
        onExportSVG={() => canvasRef.current?.exportSVG()}
        onExportPDF={() => canvasRef.current?.exportPDF()}
        onExportOxCal={handleExportOxCal}
        onExportHoardText={handleExportHoardText}
        onExportHoardJson={handleExportHoardJson}
        onExportGeoJSON={handleExportGeoJSON}
        contextCount={state.contexts.length}
        showPhaseGroups={showPhaseGroups}
        onTogglePhaseGroups={() => setShowPhaseGroups(prev => !prev)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        publicationMode={publicationMode}
        onTogglePublicationMode={() => setPublicationMode(prev => !prev)}
        publicationTemplate={publicationTemplate}
        onPublicationTemplateChange={setPublicationTemplate}
        heatmapMode={heatmapMode}
        onToggleHeatmapMode={() => setHeatmapMode(prev => !prev)}
      />

      {/* Hidden file input for project load */}
      <input
        ref={loadInputRef}
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
          dataVersion={state.dataVersion}
          theme={theme}
          publicationMode={publicationMode}
          publicationTemplate={publicationTemplate}
          heatmapMode={heatmapMode}
          onNodeSelect={id => dispatch({ type: 'SELECT_CONTEXT', id })}
          onPositionsChange={handlePositionsChange}
          onLayoutComplete={handleLayoutComplete}
        />
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
    </div>
  );
}

export default App;
