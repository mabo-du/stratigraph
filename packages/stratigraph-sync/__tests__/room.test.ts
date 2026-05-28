import { describe, it, expect } from 'vitest';
import { Doc } from 'yjs';
import { createRoom } from '../src/room';
import { generateEncryptionKey } from '../src/encryption';

describe('room', () => {
  it('creates a room with a Y.Doc and shared maps', () => {
    const room = createRoom({
      roomId: 'test-room-001',
      userId: 'alice',
      displayName: 'Alice',
      providers: [],
      encryptionKey: generateEncryptionKey(),
      persistence: false,
    });
    expect(room.doc).toBeInstanceOf(Doc);
    expect(room.maps.contexts).toBeTruthy();
    expect(room.maps.observations).toBeTruthy();
    expect(room.maps.phases).toBeTruthy();
    expect(room.maps.events).toBeTruthy();
    expect(room.maps.positions).toBeTruthy();
    expect(room.maps.meta).toBeTruthy();
    expect(room.maps.room).toBeTruthy();
    room.destroy();
  });

  it('generates a shareable link', () => {
    const room = createRoom({
      roomId: 'test-room-001',
      userId: 'alice',
      displayName: 'Alice',
      providers: [],
      encryptionKey: 'test-key',
      persistence: false,
    });
    const link = room.shareableLink();
    expect(link).toContain('stratigraph://join/');
    expect(link).toContain('test-room-001');
    expect(link).toContain('key=');
    room.destroy();
  });

  it('reports current sync status', () => {
    const room = createRoom({
      roomId: 'test-room-001',
      userId: 'alice',
      displayName: 'Alice',
      providers: [],
      persistence: false,
    });
    expect(typeof room.status).toBe('object');
    expect(room.status.status).toBe('disconnected');
    room.destroy();
  });
});
