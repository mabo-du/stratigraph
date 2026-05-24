/**
 * Toolbar/index.tsx — Top application toolbar.
 */

import React, { useRef, useState } from 'react';
import {
  Undo2, Redo2, LayoutDashboard, Upload, Save, FolderOpen,
  Download, ChevronDown, Maximize2, BoxSelect, Moon, Sun, 
  Grid3X3, Flame
} from 'lucide-react';

interface ToolbarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onImport: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onExportPDF: () => void;
  onExportOxCal: () => void;
  onExportHoardText: () => void;
  onExportHoardJson: () => void;
  contextCount: number;
  showPhaseGroups: boolean;
  onTogglePhaseGroups: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  publicationMode: boolean;
  onTogglePublicationMode: () => void;
  heatmapMode: boolean;
  onToggleHeatmapMode: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  projectName,
  onProjectNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  onFitView,
  onImport,
  onSave,
  onLoad,
  onExportPNG,
  onExportSVG,
  onExportPDF,
  onExportOxCal,
  onExportHoardText,
  onExportHoardJson,
  contextCount,
  showPhaseGroups,
  onTogglePhaseGroups,
  theme,
  onToggleTheme,
  publicationMode,
  onTogglePublicationMode,
  heatmapMode,
  onToggleHeatmapMode
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(projectName);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const commitName = () => {
    setEditingName(false);
    if (nameVal.trim()) onProjectNameChange(nameVal.trim());
    else setNameVal(projectName);
  };

  return (
    <header className="toolbar">
      {/* Brand */}
      <div className="toolbar-brand">
        <span className="toolbar-logo">⛏</span>
        <span className="toolbar-title">StratiGraph</span>
        {contextCount > 0 && (
          <span className="toolbar-badge">{contextCount} SU</span>
        )}
      </div>

      {/* Project name */}
      <div className="toolbar-project-name">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="toolbar-name-input"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setNameVal(projectName);
                setEditingName(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button
            className="toolbar-name-btn"
            onClick={() => { setEditingName(true); setNameVal(projectName); }}
            title="Click to rename project"
          >
            {projectName}
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="toolbar-controls">
        {/* Undo / Redo */}
        <div className="toolbar-group">
          <button
            className="tb-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="tb-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Layout */}
        <div className="toolbar-group">
          <button
            className={`tb-btn tb-btn--labeled ${publicationMode ? 'tb-btn--accent' : ''}`}
            onClick={onTogglePublicationMode}
            disabled={contextCount === 0}
            title="Publication Mode (Free layout)"
          >
            <Grid3X3 size={15} />
            <span>Pub Mode</span>
          </button>
          <button
            className={`tb-btn tb-btn--labeled ${showPhaseGroups ? 'tb-btn--accent' : ''}`}
            onClick={onTogglePhaseGroups}
            disabled={contextCount === 0}
            title="Toggle Phase Grouping Boxes"
          >
            <BoxSelect size={15} />
            <span>Groups</span>
          </button>
          <button className="tb-btn tb-btn--labeled" onClick={onAutoLayout} title="Auto-layout matrix">
            <LayoutDashboard size={15} />
            <span>Auto Layout</span>
          </button>
          <button className="tb-btn" onClick={onFitView} title="Fit view" aria-label="Fit view">
            <Maximize2 size={15} />
          </button>
        </div>

        <div className="toolbar-divider" />
        
        {/* Visuals */}
        <div className="toolbar-group">
          <button
            className={`tb-btn ${heatmapMode ? 'tb-btn--accent' : ''}`}
            onClick={onToggleHeatmapMode}
            disabled={contextCount === 0}
            title="Toggle Heatmap Mode (Finds Density)"
          >
            <Flame size={15} />
          </button>
          <button className="tb-btn" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Import */}
        <button className="tb-btn tb-btn--labeled tb-btn--accent" onClick={onImport} title="Import CSV data">
          <Upload size={15} />
          <span>Import CSV</span>
        </button>

        <div className="toolbar-divider" />

        {/* Save / Load */}
        <div className="toolbar-group">
          <button className="tb-btn" onClick={onSave} title="Save project (Ctrl+S)" aria-label="Save project">
            <Save size={15} />
          </button>
          <button
            className="tb-btn"
            title="Load project"
            aria-label="Load project"
            onClick={() => loadInputRef.current?.click()}
          >
            <FolderOpen size={15} />
          </button>
          <input
            ref={loadInputRef}
            type="file"
            accept=".json,.hmatrix.json"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files?.[0]) onLoad();
              e.target.value = '';
            }}
          />
        </div>

        <div className="toolbar-divider" />

        {/* Export */}
        <div style={{ position: 'relative' }} ref={exportMenuRef}>
          <button
            className="tb-btn tb-btn--labeled"
            onClick={() => setShowExportMenu(v => !v)}
            title="Export matrix"
          >
            <Download size={15} />
            <span>Export</span>
            <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <>
              <div
                style={{
                  position: 'fixed', inset: 0, zIndex: 99
                }}
                onClick={() => setShowExportMenu(false)}
              />
              <div className="dropdown-menu">
                <button
                  className="dropdown-item"
                  onClick={() => { onExportPNG(); setShowExportMenu(false); }}
                >
                  Export as PNG
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => { onExportSVG(); setShowExportMenu(false); }}
                >
                  Export as SVG
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => { onExportPDF(); setShowExportMenu(false); }}
                >
                  Export as PDF
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => { onExportOxCal(); setShowExportMenu(false); }}
                >
                  Export for Libby (.oxcal)
                </button>
                <div style={{ height: 1, background: 'var(--border-2)', margin: '4px 0' }} />
                <button
                  className="dropdown-item"
                  onClick={() => { onExportHoardText(); setShowExportMenu(false); }}
                >
                  Export HOARD Prompt (.txt)
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => { onExportHoardJson(); setShowExportMenu(false); }}
                >
                  Export HOARD Payload (.json)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
