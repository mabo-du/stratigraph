import { Doc } from 'yjs';
import type { AwarenessState } from './types';

const COLORS = [
  '#5b9bd5', '#4a9e6f', '#d45c9a', '#c8952a',
  '#7c6fa0', '#d48b45', '#3fa8a8', '#c05c5c',
];

/**
 * Wraps Yjs awareness for managing connected user state.
 */
export function createAwareness(
  doc: Doc,
  userId: string,
  displayName: string,
  color?: string,
) {
  const localState: AwarenessState = {
    userId,
    displayName,
    color: color || COLORS[Math.floor(Math.random() * COLORS.length)],
  };

  const callbacks: Array<(users: AwarenessState[]) => void> = [];

  // Simple internal awareness store
  const states = new Map<string, AwarenessState>();
  states.set(userId, localState);

  const trigger = () => {
    const all = Array.from(states.values());
    callbacks.forEach((cb) => cb(all));
  };

  return {
    getLocal: (): AwarenessState => ({ ...localState }),
    setLocal: (field: keyof AwarenessState, value: any) => {
      (localState as any)[field] = value;
      trigger();
    },
    onChange: (cb: (users: AwarenessState[]) => void) => {
      callbacks.push(cb);
      // Fire immediately with current state
      cb(Array.from(states.values()));
    },
    /** Called when a remote awareness state arrives */
    receiveRemote: (userId: string, state: AwarenessState) => {
      states.set(userId, state);
      trigger();
    },
    removeRemote: (userId: string) => {
      states.delete(userId);
      trigger();
    },
    destroy: () => {
      callbacks.length = 0;
      states.clear();
    },
  };
}

export type AwarenessManager = ReturnType<typeof createAwareness>;
