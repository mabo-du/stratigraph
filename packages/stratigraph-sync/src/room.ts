import { Doc } from 'yjs';
import type { RoomConfig, SyncProvider, SyncStatus, StatusEvent, RemoteChange, RoomMaps } from './types';
import { createPersistence } from './persistence';
import { createAwareness, type AwarenessManager } from './awareness';

export class Room {
  readonly doc: Doc;
  readonly maps: RoomMaps;
  readonly awareness: AwarenessManager;
  readonly config: { roomId: string; userId: string; displayName: string };
  private _providers: Array<{ destroy(): void }> = [];
  private _status: { status: SyncStatus; pending: number } = {
    status: 'disconnected',
    pending: 0,
  };
  private _destroyed = false;
  private _statusCallbacks: Array<(e: StatusEvent) => void> = [];
  private _changeCallbacks: Array<(change: RemoteChange) => void> = [];
  private _encryptionKey?: string;

  constructor(config: RoomConfig) {
    this.config = { roomId: config.roomId, userId: config.userId, displayName: config.displayName };
    this._encryptionKey = config.encryptionKey;

    this.doc = new Doc();

    // Create shared maps
    this.maps = {
      contexts: this.doc.getMap('contexts'),
      observations: this.doc.getMap('observations'),
      phases: this.doc.getMap('phases'),
      events: this.doc.getMap('events'),
      positions: this.doc.getMap('positions'),
      meta: this.doc.getMap('meta'),
      room: this.doc.getMap('room'),
    };

    // Set room metadata on the shared map
    this.maps.room.set('roomId', config.roomId);

    // Setup y-indexeddb persistence
    const persistCleanup = createPersistence(this.doc, config.persistence !== false);
    this._providers.push({ destroy: persistCleanup });

    // Encryption key stored for shareable link generation
    // Actual payload encryption handled by application layer via Web Crypto API

    // Setup awareness
    this.awareness = createAwareness(this.doc, config.userId, config.displayName);

    // Setup providers
    for (const provider of config.providers) {
      this._addProvider(provider);
    }
  }

  get status(): StatusEvent {
    return { ...this._status };
  }

  onStatus(cb: (e: StatusEvent) => void): () => void {
    this._statusCallbacks.push(cb);
    return () => {
      const idx = this._statusCallbacks.indexOf(cb);
      if (idx >= 0) this._statusCallbacks.splice(idx, 1);
    };
  }

  onRemoteChange(cb: (change: RemoteChange) => void): () => void {
    this._changeCallbacks.push(cb);
    return () => {
      const idx = this._changeCallbacks.indexOf(cb);
      if (idx >= 0) this._changeCallbacks.splice(idx, 1);
    };
  }

  shareableLink(serverUrl?: string): string {
    let link = `stratigraph://join/${this.config.roomId}`;
    const params: string[] = [];
    if (this._encryptionKey) params.push(`key=${this._encryptionKey}`);
    if (serverUrl) params.push(`server=${encodeURIComponent(serverUrl)}`);
    if (params.length) link += '?' + params.join('&');
    return link;
  }

  leave(): void {
    // Disconnect providers but keep the doc for offline access
    for (const p of this._providers.slice(1)) {
      p.destroy();
    }
    this._providers = [this._providers[0]]; // keep persistence
    this._setStatus('disconnected', this._status.pending);
  }

  destroy(): void {
    this._destroyed = true;
    for (const p of this._providers) {
      p.destroy();
    }
    this._providers = [];
    this.awareness.destroy();
    this._statusCallbacks = [];
    this._changeCallbacks = [];
    this.doc.destroy();
  }

  private _addProvider(config: SyncProvider): void {
    if (config.type === 'websocket') {
      import('y-websocket').then(({ WebsocketProvider }) => {
        if (this._destroyed) return;
        const wsProvider = new WebsocketProvider(
          config.url,
          this.config.roomId,
          this.doc,
          { connect: true },
        );
        wsProvider.on('status', (event: { status: string }) => {
          this._setStatus(
            event.status as SyncStatus,
            this._status.pending,
          );
        });
        this._providers.push(wsProvider);
      });
    } else if (config.type === 'webrtc') {
      import('y-webrtc').then(({ WebrtcProvider }) => {
        if (this._destroyed) return;
        const rtcProvider = new WebrtcProvider(
          this.config.roomId,
          this.doc,
          { signaling: config.signaling, password: config.password },
        );
        rtcProvider.on('status', (event: { status: string }) => {
          this._setStatus(
            event.status as SyncStatus,
            this._status.pending,
          );
        });
        this._providers.push(rtcProvider);
      });
    }
  }

  private _setStatus(status: SyncStatus, pending: number): void {
    this._status = { status, pending };
    this._emitStatus();
  }

  private _emitStatus(): void {
    const e = { ...this._status };
    this._statusCallbacks.forEach((cb) => cb(e));
  }
}

/** Create a new collaboration room */
export function createRoom(config: RoomConfig): Room {
  return new Room(config);
}
