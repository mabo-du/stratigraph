import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Room, createRoom } from '@stratigraph/sync';
import type { RoomConfig, StatusEvent, SyncStatus, AwarenessState } from '@stratigraph/sync';

interface SyncContextValue {
  room: Room | null;
  status: StatusEvent;
  connected: boolean;
  users: AwarenessState[];
}

const SyncContext = createContext<SyncContextValue>({
  room: null,
  status: { status: 'disconnected', pending: 0 },
  connected: false,
  users: [],
});

interface SyncProviderProps {
  config: RoomConfig;
  children: ReactNode;
}

export function SyncProvider({ config, children }: SyncProviderProps) {
  const [status, setStatus] = useState<StatusEvent>({ status: 'connecting', pending: 0 });
  const [users, setUsers] = useState<AwarenessState[]>([]);

  const room = useMemo(() => createRoom(config), [
    config.roomId,
    config.userId,
    config.displayName,
  ]);

  useEffect(() => {
    const unsubStatus = room.onStatus(setStatus);
    const unsubAwareness = room.awareness.onChange(setUsers);
    return () => {
      unsubStatus();
      unsubAwareness();
    };
  }, [room]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      room.destroy();
    };
  }, [room]);

  const value = useMemo<SyncContextValue>(() => ({
    room,
    status,
    connected: status.status === 'connected' || status.status === 'synced',
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
