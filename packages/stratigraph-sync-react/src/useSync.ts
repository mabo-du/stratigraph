import { useSyncExternalStore, useCallback } from 'react';
import { useSyncContext } from './SyncProvider';
import type { RoomMaps } from '@stratigraph/sync';

/**
 * Subscribe to a derived slice of the shared Yjs document state.
 * Uses useSyncExternalStore for tear-free concurrent rendering.
 * Re-renders only when the selected data changes.
 *
 * @param selector - Function that picks the slice of state to subscribe to
 * @returns The derived state
 *
 * @example
 * const contexts = useSync(state => state.contexts)
 */
export function useSync<T>(selector: (maps: RoomMaps) => T): T {
  const { room } = useSyncContext();

  const getSnapshot = useCallback((): T => {
    if (!room) {
      // Return empty state when no room exists
      return selector({
        contexts: new Map(),
        observations: new Map(),
        phases: new Map(),
        events: new Map(),
        positions: new Map(),
        meta: new Map(),
        room: new Map(),
      });
    }
    return selector(room.maps);
  }, [room, selector]);

  const subscribe = useCallback((callback: () => void) => {
    if (!room) return () => {};
    // Yjs fires afterTransaction for any shared type change
    room.doc.on('afterTransaction', callback);
    return () => {
      room.doc.off('afterTransaction', callback);
    };
  }, [room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
