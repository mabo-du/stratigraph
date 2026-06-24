import { useState, useCallback, useMemo, useEffect } from 'react';
import { createRoom, generateEncryptionKey } from '@stratigraph/sync';
import type { Room, RoomConfig, SyncStatus, AwarenessState } from '@stratigraph/sync';

interface UseCollaborationOptions {
  userId: string;
  displayName: string;
  projectId: string;
  existingRoomId?: string;
  existingKey?: string;
  syncServer?: string;
}

interface UseCollaborationReturn {
  room: Room | null;
  status: SyncStatus;
  users: AwarenessState[];
  shareableLink: string;
  startSession: () => void;
  joinSession: (roomId: string, key: string) => void;
  leaveSession: () => void;
  isConnected: boolean;
}

export function useCollaboration(options: UseCollaborationOptions): UseCollaborationReturn {
  // Create a local-only room immediately so the CRDT store has a Yjs Doc
  // to read from and write to even before any network session is started.
  // Network providers are added only when the user explicitly clicks
  // "Collaborate" or joins a session — satisfying P0-9 (informed consent).
  const [room, setRoom] = useState<Room | null>(() => {
    const key = options.existingKey || generateEncryptionKey();
    const config: RoomConfig = {
      roomId: options.projectId,
      userId: options.userId,
      displayName: options.displayName,
      providers: [],  // local-only — no network providers
      encryptionKey: key,
      persistence: true,
    };
    return createRoom(config);
  });
  const [status, setStatus] = useState<SyncStatus>('disconnected');
  const [users, setUsers] = useState<AwarenessState[]>([]);

  // Wire up status + awareness listeners, properly cleaning up on room change.
  useEffect(() => {
    if (!room) return;
    const unsubStatus = room.onStatus((e) => setStatus(e.status));
    const unsubUsers = room.awareness.onChange(setUsers);
    return () => { unsubStatus(); unsubUsers(); };
  }, [room]);

  const shareableLink = useMemo(() => {
    if (!room) return '';
    return room.shareableLink(options.syncServer);
  }, [room, options.syncServer]);

  const startSession = useCallback(() => {
    if (!room) return;
    // Add a WebSocket provider to the existing local room — this connects
    // it to the local relay (and through it, to discovered LAN peers).
    // The room ID and encryption key already set at mount time are preserved.
    if (options.syncServer) {
      room.addProvider({ type: 'websocket', url: options.syncServer });
    }
  }, [room, options.syncServer]);

  const joinSession = useCallback((joinRoomId: string, key: string) => {
    // Destroy the current local room and create a new one configured
    // to join the remote session.
    if (room) room.destroy();

    const config: RoomConfig = {
      roomId: joinRoomId,
      userId: options.userId,
      displayName: options.displayName,
      providers: options.syncServer
        ? [{ type: 'websocket', url: options.syncServer }]
        : [],
      encryptionKey: key,
      persistence: true,
    };

    const newRoom = createRoom(config);
    setRoom(newRoom);
  }, [room, options]);

  const leaveSession = useCallback(() => {
    if (room) {
      // room.leave() disconnects network providers but keeps the Yjs Doc
      // and IndexedDB persistence alive for offline use.
      room.leave();
    }
  }, [room]);

  // Collaboration sessions must be started explicitly by the user —
  // we removed the auto-start effect to require informed consent.
  // Callers should invoke startSession() or joinSession() from a user action.

  return {
    room,
    status,
    users,
    shareableLink,
    startSession,
    joinSession,
    leaveSession,
    isConnected: status === 'connected' || status === 'synced',
  };
}
