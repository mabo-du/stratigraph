/**
 * useMatrixStore.ts — Central state management with undo/redo.
 * exports: useMatrixStore
 * rules:
 * - Undoable actions push current state to 'past' and clear 'future'.
 * - UNDO/REDO swap between past/present/future stacks.
 * - UI actions (select, modal toggle) do NOT affect undo history.
 */

import { useReducer, useCallback } from 'react';
import type { MatrixState, MatrixAction, UndoableState, MatrixStoreAPI } from '../models/matrixState';
import { INITIAL_STATE } from '../models/matrixState';

const MAX_HISTORY = 50;

function extractUndoable(state: MatrixState): UndoableState {
  return {
    contexts: state.contexts,
    observations: state.observations,
    phases: state.phases,
    events: state.events,
    positions: state.positions,
  };
}

function applyUndoable(state: MatrixState, undoable: UndoableState): MatrixState {
  return {
    ...state,
    contexts: undoable.contexts,
    observations: undoable.observations,
    phases: undoable.phases,
    events: undoable.events,
    positions: undoable.positions,
  };
}

function matrixReducer(state: MatrixState, action: MatrixAction): MatrixState {
  const pushHistory = (): Pick<MatrixState, 'past' | 'future' | 'dataVersion'> => ({
    past: [...state.past.slice(-(MAX_HISTORY - 1)), extractUndoable(state)],
    future: [],
    dataVersion: state.dataVersion + 1,
  });

  switch (action.type) {
    case 'ADD_CONTEXT':
      return {
        ...state,
        ...pushHistory(),
        contexts: [...state.contexts, action.context],
      };

    case 'UPDATE_CONTEXT':
      return {
        ...state,
        ...pushHistory(),
        contexts: state.contexts.map(c => c.id === action.context.id ? action.context : c),
      };

    case 'DELETE_CONTEXT':
      return {
        ...state,
        ...pushHistory(),
        contexts: state.contexts.filter(c => c.id !== action.id),
        observations: state.observations.filter(
          o => o.source !== action.id && o.target !== action.id
        ),
        positions: Object.fromEntries(
          Object.entries(state.positions).filter(([k]) => k !== action.id)
        ),
        selectedContextId: state.selectedContextId === action.id ? null : state.selectedContextId,
      };

    case 'ADD_OBSERVATION':
      return {
        ...state,
        ...pushHistory(),
        observations: [...state.observations, action.observation],
      };

    case 'DELETE_OBSERVATION':
      return {
        ...state,
        ...pushHistory(),
        observations: state.observations.filter(o => o.id !== action.id),
      };

    case 'ADD_PHASE':
      return {
        ...state,
        ...pushHistory(),
        phases: [...state.phases, action.phase],
      };

    case 'UPDATE_PHASE':
      return {
        ...state,
        ...pushHistory(),
        phases: state.phases.map(p => p.id === action.phase.id ? action.phase : p),
      };

    case 'DELETE_PHASE':
      return {
        ...state,
        ...pushHistory(),
        phases: state.phases.filter(p => p.id !== action.id),
        contexts: state.contexts.map(c =>
          c.phase === action.id ? { ...c, phase: undefined } : c
        ),
      };

    case 'SET_POSITIONS':
      return {
        ...state,
        ...pushHistory(),
        positions: action.positions,
      };

    case 'UPDATE_POSITION':
      // Position drags update without adding to undo history (avoids spam)
      return {
        ...state,
        positions: { ...state.positions, [action.id]: action.position },
      };

    case 'IMPORT_DATA':
      return {
        ...state,
        ...pushHistory(),
        contexts: action.contexts,
        observations: action.observations,
        events: action.events,
        positions: {},
        selectedContextId: null,
      };

    case 'LOAD_PROJECT':
      return {
        ...action.state,
        past: [],
        future: [],
        dataVersion: state.dataVersion + 1,
      };

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return applyUndoable(
        {
          ...state,
          past: newPast,
          future: [extractUndoable(state), ...state.future],
          dataVersion: state.dataVersion + 1,
        },
        previous
      );
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return applyUndoable(
        {
          ...state,
          past: [...state.past, extractUndoable(state)],
          future: newFuture,
          dataVersion: state.dataVersion + 1,
        },
        next
      );
    }

    case 'SET_META':
      return { ...state, meta: { ...state.meta, ...action.meta } };

    case 'SELECT_CONTEXT':
      return { ...state, selectedContextId: action.id };

    case 'TOGGLE_IMPORT_MODAL':
      return { ...state, showImportModal: action.open };

    case 'SET_SIDEBAR_TAB':
      return { ...state, sidebarTab: action.tab };

    default:
      return state;
  }
}

export function useMatrixStoreReducer(): MatrixStoreAPI {
  const [state, dispatch] = useReducer(matrixReducer, INITIAL_STATE);

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  return {
    state,
    dispatch,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    isLoaded: true,
    undo,
    redo,
  };
}
