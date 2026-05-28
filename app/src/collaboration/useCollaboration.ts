import { useState, useCallback, useMemo } from 'react';
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
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<SyncStatus>('disconnected');
  const [users, setUsers] = useState<AwarenessState[]>([]);

  const shareableLink = useMemo(() => {
    if (!room) return '';
    return room.shareableLink(options.syncServer);
  }, [room, options.syncServer]);

  const startSession = useCallback(() => {
    const key = options.existingKey || generateEncryptionKey();
    const roomId = options.existingRoomId ||
      Array.from({ length: 16 }, () => Math.random().toString(16)[2]).join('');

    const config: RoomConfig = {
      roomId,
      userId: options.userId,
      displayName: options.displayName,
      providers: options.syncServer
        ? [{ type: 'websocket', url: options.syncServer }]
        : [{ type: 'webrtc' }],
      encryptionKey: key,
      persistence: true,
    };

    const newRoom = createRoom(config);
    newRoom.onStatus((e) => setStatus(e.status));
    newRoom.awareness.onChange(setUsers);
    setRoom(newRoom);
  }, [options]);

  const joinSession = useCallback((roomId: string, key: string) => {
    const config: RoomConfig = {
      roomId,
      userId: options.userId,
      displayName: options.displayName,
      providers: options.syncServer
        ? [{ type: 'websocket', url: options.syncServer }]
        : [{ type: 'webrtc' }],
      encryptionKey: key,
      persistence: true,
    };

    const newRoom = createRoom(config);
    newRoom.onStatus((e) => setStatus(e.status));
    newRoom.awareness.onChange(setUsers);
    setRoom(newRoom);
  }, [options]);

  const leaveSession = useCallback(() => {
    if (room) {
      room.leave();
      setRoom(null);
      setStatus('disconnected');
      setUsers([]);
    }
  }, [room]);

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
