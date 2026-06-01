import * as Y from 'yjs';

/** Configuration for creating or joining a collaboration room */
export interface RoomConfig {
  /** Unique room identifier (128-bit random hex recommended) */
  roomId: string;
  /** Local user's stable ID (e.g., device fingerprint or login ID) */
  userId: string;
  /** Human-readable display name */
  displayName: string;
  /** Provider configurations — at least one */
  providers: SyncProvider[];
  /** 256-bit encryption key (base64url) for AES-GCM encryption */
  encryptionKey?: string;
  /** Enable y-indexeddb persistence (default: true) */
  persistence?: boolean;
  localIdentity?: { privateKey: Uint8Array; publicKey: Uint8Array };
  admittedPeers?: Uint8Array[];
}

/** A sync provider configuration */
export type SyncProvider =
  | { type: 'websocket'; url: string }
  | { type: 'webrtc'; signaling?: string[]; password?: string };

/** Mapping from collection name to Y.Map reference */
export interface RoomMaps {
  contexts: Y.Map<any>;
  observations: Y.Map<any>;
  phases: Y.Map<any>;
  events: Y.Map<any>;
  positions: Y.Map<any>;
  meta: Y.Map<any>;
  room: Y.Map<any>;
  quarantined_edges: Y.Map<any>;
}

/** Awareness state for a single user */
export interface AwarenessState {
  userId: string;
  displayName: string;
  color: string;
  cursor?: { x: number; y: number };
  selectedContext?: string | null;
  /** Activity label shown to other users, e.g. "editing ctx-4" */
  activity?: string;
}

/** Connection status reported by providers */
export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'synced';

/** Status update emitted by the room */
export interface StatusEvent {
  status: SyncStatus;
  pending: number;
}

/** Error emitted by the room */
export interface RoomError {
  message: string;
  code?: string;
}

/** A remote change notification for StratiGraph logical conflict detection */
export interface RemoteChange {
  type: 'add' | 'update' | 'delete';
  collection: string;
  id: string;
  userId: string;
  displayName: string;
}
