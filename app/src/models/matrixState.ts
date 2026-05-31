/**
 * matrixState.ts — Application-wide state types for the Matrix editor.
 * used_by: useMatrixStore.ts
 */

import type { Context, Observation, Phase, Event } from './hmdp';

export interface ProjectMeta {
  projectName: string;
  siteName: string;
  excavationYear: string;
  notes: string;
  /** Room ID for Yjs collaboration session */
  roomId?: string;
  /** Encryption key for Yjs collaboration session */
  roomKey?: string;
  /** Optional WebSocket sync server URL */
  syncServer?: string;
}

export interface LayoutPosition {
  x: number;
  y: number;
}

/** The slice of state that can be undone/redone */
export interface UndoableState {
  contexts: Context[];
  observations: Observation[];
  phases: Phase[];
  events: Event[];
  positions: Record<string, LayoutPosition>;
}

/** Full application state */
export interface MatrixState extends UndoableState {
  meta: ProjectMeta;
  selectedContextId: string | null;
  showImportModal: boolean;
  sidebarTab: 'units' | 'phases';
  dataVersion: number;
  past: UndoableState[];
  future: UndoableState[];
}

export const DEFAULT_PHASE_COLORS = [
  '#c8952a', '#5b9bd5', '#4a9e6f', '#d45c9a',
  '#7c6fa0', '#d48b45', '#3fa8a8', '#c05c5c',
];

export const INITIAL_STATE: MatrixState = {
  meta: {
    projectName: 'Untitled Matrix',
    siteName: '',
    excavationYear: new Date().getFullYear().toString(),
    notes: '',
  },
  contexts: [],
  observations: [],
  events: [],
  phases: [
    { id: 'phase-1', name: 'Phase 1', color: DEFAULT_PHASE_COLORS[0] },
  ],
  positions: {},
  selectedContextId: null,
  showImportModal: false,
  sidebarTab: 'units',
  dataVersion: 0,
  past: [],
  future: [],
};

// ─── Action types ───────────────────────────────────────────────────────────

export type MatrixAction =
  | { type: 'ADD_CONTEXT'; context: Context }
  | { type: 'UPDATE_CONTEXT'; context: Context }
  | { type: 'DELETE_CONTEXT'; id: string }
  | { type: 'ADD_OBSERVATION'; observation: Observation }
  | { type: 'DELETE_OBSERVATION'; id: string }
  | { type: 'ADD_PHASE'; phase: Phase }
  | { type: 'UPDATE_PHASE'; phase: Phase }
  | { type: 'DELETE_PHASE'; id: string }
  | { type: 'SET_POSITIONS'; positions: Record<string, LayoutPosition> }
  | { type: 'UPDATE_POSITION'; id: string; position: LayoutPosition }
  | { type: 'IMPORT_DATA'; contexts: Context[]; observations: Observation[]; events: Event[] }
  | { type: 'LOAD_PROJECT'; state: MatrixState }
  | { type: 'SET_META'; meta: Partial<ProjectMeta> }
  | { type: 'SELECT_CONTEXT'; id: string | null }
  | { type: 'TOGGLE_IMPORT_MODAL'; open: boolean }
  | { type: 'SET_SIDEBAR_TAB'; tab: 'units' | 'phases' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export interface MatrixStoreAPI {
  state: MatrixState;
  dispatch: React.Dispatch<MatrixAction>;
  canUndo: boolean;
  canRedo: boolean;
  isLoaded: boolean;
  undo: () => void;
  redo: () => void;
}
