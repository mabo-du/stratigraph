import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Room } from '@stratigraph/sync';
import type { StatusEvent, AwarenessState } from '@stratigraph/sync';

interface SyncContextValue {
  room: Room | null;
  status: StatusEvent;
  connected: boolean;
  isLoaded: boolean;
  users: AwarenessState[];
}

const SyncContext = createContext<SyncContextValue>({
  room: null,
  status: { status: 'disconnected', pending: 0 },
  connected: false,
  isLoaded: false,
  users: [],
});

interface SyncProviderProps {
  room: Room | null;
  children: ReactNode;
}

export function SyncProvider({ room, children }: SyncProviderProps) {
  const [status, setStatus] = useState<StatusEvent>({ status: 'disconnected', pending: 0 });
  const [users, setUsers] = useState<AwarenessState[]>([]);

  useEffect(() => {
    if (!room) return;
    const unsubStatus = room.onStatus(setStatus);
    const unsubAwareness = room.awareness.onChange(setUsers);
    
    // Also init status immediately in case it changed before effect ran
    setStatus(room.status);
    
    return () => {
      unsubStatus();
      unsubAwareness();
    };
  }, [room]);

  const value = useMemo<SyncContextValue>(() => ({
    room,
    status,
    connected: status.status === 'connected' || status.status === 'synced',
    isLoaded: room ? room.isLoaded : false,
    users,
  }), [room, status, users]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook to access the sync context (room instance + status).
 * Throws if used outside SyncProvider.
 */
export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx.room) {
    console.warn('useSyncContext used outside SyncProvider');
  }
  return ctx;
}
