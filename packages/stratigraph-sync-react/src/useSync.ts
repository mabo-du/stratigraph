import { useSyncExternalStore, useCallback, useRef } from 'react';
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
  const revisionRef = useRef(0);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const snapshotRef = useRef<{ revision: number; value: T } | null>(null);

  const getSnapshot = useCallback((): T => {
    if (!room) {
      // Return empty state when no room exists, cached to avoid React infinite loops
      if (!snapshotRef.current || snapshotRef.current.revision !== -1) {
        snapshotRef.current = {
          revision: -1,
          value: selectorRef.current({
            contexts: new Map() as any,
            observations: new Map() as any,
            phases: new Map() as any,
            events: new Map() as any,
            positions: new Map() as any,
            meta: new Map() as any,
            room: new Map() as any,
            quarantined_edges: new Map() as any,
          })
        };
      }
      return snapshotRef.current.value;
    }

    if (snapshotRef.current && snapshotRef.current.revision === revisionRef.current) {
      return snapshotRef.current.value;
    }

    const newValue = selectorRef.current(room.maps);
    snapshotRef.current = { revision: revisionRef.current, value: newValue };
    return newValue;
  }, [room]);

  const subscribe = useCallback((callback: () => void) => {
    if (!room) return () => {};
    // Yjs fires afterTransaction for any shared type change
    const handler = () => {
      revisionRef.current++;
      callback();
    };
    room.doc.on('afterTransaction', handler);
    return () => {
      room.doc.off('afterTransaction', handler);
    };
  }, [room]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
