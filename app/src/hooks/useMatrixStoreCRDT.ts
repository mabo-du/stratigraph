import { useCallback, useState, useMemo, useEffect } from 'react';
import type { MatrixState, MatrixAction, MatrixStoreAPI, ProjectMeta } from '../models/matrixState';
import { INITIAL_STATE } from '../models/matrixState';
import { useSync, useSyncContext } from '@stratigraph/sync-react';
import type { Context, Observation, Phase, Event } from '../models/hmdp';

export function useMatrixStoreCRDT(): MatrixStoreAPI {
  const { room, isLoaded } = useSyncContext();

  const contexts = useSync(maps => Array.from(maps.contexts.values()) as Context[]);
  const observations = useSync(maps => Array.from(maps.observations.values()) as Observation[]);
  const phases = useSync(maps => Array.from(maps.phases.values()) as Phase[]);
  const events = useSync(maps => Array.from(maps.events.values()) as Event[]);
  const positions = useSync(maps => Object.fromEntries(maps.positions.entries()));
  const metaMap = useSync(maps => Object.fromEntries(maps.meta.entries()) as Partial<ProjectMeta>);

  // Local UI state
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<'units' | 'phases'>('units');

  const state: MatrixState = useMemo(() => ({
    contexts,
    observations,
    phases,
    events,
    positions,
    meta: { ...INITIAL_STATE.meta, ...metaMap },
    selectedContextId,
    showImportModal,
    sidebarTab,
    dataVersion: 0,
    past: [],
    future: [],
  }), [contexts, observations, phases, events, positions, metaMap, selectedContextId, showImportModal, sidebarTab]);

  const dispatch = useCallback((action: MatrixAction) => {
    if (!room) return;

    room.doc.transact(() => {
      switch (action.type) {
        case 'ADD_CONTEXT':
        case 'UPDATE_CONTEXT':
          room.maps.contexts.set(action.context.id, action.context);
          break;

        case 'DELETE_CONTEXT':
          room.maps.contexts.delete(action.id);
          // Delete associated observations
          for (const [key, obs] of room.maps.observations.entries()) {
            if ((obs as Observation).source === action.id || (obs as Observation).target === action.id) {
              room.maps.observations.delete(key);
            }
          }
          room.maps.positions.delete(action.id);
          if (selectedContextId === action.id) setSelectedContextId(null);
          break;

        case 'ADD_OBSERVATION':
          room.maps.observations.set(action.observation.id, action.observation);
          break;

        case 'DELETE_OBSERVATION':
          room.maps.observations.delete(action.id);
          break;

        case 'ADD_PHASE':
        case 'UPDATE_PHASE':
          room.maps.phases.set(action.phase.id, action.phase);
          break;

        case 'DELETE_PHASE':
          room.maps.phases.delete(action.id);
          // Remove phase from contexts
          for (const [key, ctx] of room.maps.contexts.entries()) {
            if ((ctx as Context).phase === action.id) {
              room.maps.contexts.set(key, { ...(ctx as Context), phase: undefined });
            }
          }
          break;

        case 'SET_POSITIONS':
          for (const [id, pos] of Object.entries(action.positions)) {
            room.maps.positions.set(id, pos);
          }
          break;

        case 'UPDATE_POSITION':
          room.maps.positions.set(action.id, action.position);
          break;

        case 'IMPORT_DATA':
          room.maps.contexts.clear();
          room.maps.observations.clear();
          room.maps.events.clear();
          room.maps.positions.clear();
          action.contexts.forEach(c => room.maps.contexts.set(c.id, c));
          action.observations.forEach(o => room.maps.observations.set(o.id, o));
          action.events.forEach(e => room.maps.events.set(e.id, e));
          setSelectedContextId(null);
          break;

        case 'LOAD_PROJECT':
          room.maps.contexts.clear();
          room.maps.observations.clear();
          room.maps.phases.clear();
          room.maps.events.clear();
          room.maps.positions.clear();
          action.state.contexts.forEach(c => room.maps.contexts.set(c.id, c));
          action.state.observations.forEach(o => room.maps.observations.set(o.id, o));
          action.state.phases.forEach(p => room.maps.phases.set(p.id, p));
          action.state.events.forEach(e => room.maps.events.set(e.id, e));
          Object.entries(action.state.positions).forEach(([id, p]) => room.maps.positions.set(id, p));
          setSelectedContextId(null);
          break;

        case 'SET_META':
          for (const [k, v] of Object.entries(action.meta)) {
            if (v !== undefined) room.maps.meta.set(k, v);
          }
          break;

        case 'SELECT_CONTEXT':
          setSelectedContextId(action.id);
          break;

        case 'TOGGLE_IMPORT_MODAL':
          setShowImportModal(action.open);
          break;

        case 'SET_SIDEBAR_TAB':
          setSidebarTab(action.tab);
          break;

        case 'UNDO':
          room.undoManager.undo();
          break;

        case 'REDO':
          room.undoManager.redo();
          break;
      }
    });
  }, [room, selectedContextId]);

  // Expose undo/redo status
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!room) return;
    const updateUndoRedoState = () => {
      setCanUndo(room.undoManager.undoStack.length > 0);
      setCanRedo(room.undoManager.redoStack.length > 0);
    };
    room.undoManager.on('stack-item-added', updateUndoRedoState);
    room.undoManager.on('stack-item-popped', updateUndoRedoState);
    return () => {
      room.undoManager.off('stack-item-added', updateUndoRedoState);
      room.undoManager.off('stack-item-popped', updateUndoRedoState);
    };
  }, [room]);

  return {
    state,
    dispatch,
    canUndo,
    canRedo,
    isLoaded,
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
  };
}
