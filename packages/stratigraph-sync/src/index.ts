// packages/stratigraph-sync/src/index.ts
export { createRoom, Room } from './room';
export { generateEncryptionKey, encryptData, decryptData } from './encryption';
export { createPersistence } from './persistence';
export { createAwareness } from './awareness';
export type {
  RoomConfig,
  SyncProvider,
  RoomMaps,
  SyncStatus,
  StatusEvent,
  AwarenessState,
  RemoteChange,
  RoomError,
} from './types';
