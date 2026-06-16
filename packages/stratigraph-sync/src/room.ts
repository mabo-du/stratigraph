import { Doc, UndoManager } from 'yjs';
import type { RoomConfig, SyncProvider, SyncStatus, StatusEvent, RemoteChange, RoomMaps } from './types';
import { createPersistence } from './persistence';
import { createAwareness, type AwarenessManager } from './awareness';
import { signUpdate, verifyUpdate } from '../../../app/src/security/crypto';
import { performPostMergeReduction } from '../../../app/src/models/reconciliation';

export class Room {
  readonly doc: Doc;
  readonly maps: RoomMaps;
  readonly awareness: AwarenessManager;
  readonly undoManager: UndoManager;
  readonly config: RoomConfig;
  isLoaded: boolean = false;
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
    this.config = config;
    this._encryptionKey = config.encryptionKey;

    this.doc = new Doc();

    // Setup zero-trust intercept layer for this document instance
    this.setupZeroTrustIntercept(config);

    // Create shared maps
    this.maps = {
      contexts: this.doc.getMap('contexts'),
      observations: this.doc.getMap('observations'),
      phases: this.doc.getMap('phases'),
      events: this.doc.getMap('events'),
      positions: this.doc.getMap('positions'),
      meta: this.doc.getMap('meta'),
      room: this.doc.getMap('room'),
      quarantined_edges: this.doc.getMap('quarantined_edges'),
    };

    // Set room metadata on the shared map
    this.maps.room.set('roomId', config.roomId);

    // Setup Re-entrancy guarded debounced Post-Merge Reduction
    let reductionTimeout: NodeJS.Timeout | null = null;
    this.doc.on('update', (_update: Uint8Array, origin: any) => {
      // Guard against our own reduction edits
      if (origin === 'post-merge-reduction' || origin === 'post-merge-resolution') return;
      
      // Trigger debounced reduction and GC
      if (reductionTimeout) clearTimeout(reductionTimeout);
      reductionTimeout = setTimeout(() => {
        performPostMergeReduction(this.doc, config.userId);
        if ((this as any).mediaSync) {
          (this as any).mediaSync.runGarbageCollection();
        }
      }, 500); // 500ms debounce
    });

    // Setup y-indexeddb persistence
    const persistCleanup = createPersistence(this.doc, config.persistence !== false, () => {
      this.isLoaded = true;
      this._emitStatus(); // Let listeners know we loaded
    });
    this._providers.push({ destroy: persistCleanup });

    // Setup UndoManager (track only specific maps, exclude positions and meta)
    this.undoManager = new UndoManager([
      this.maps.contexts,
      this.maps.observations,
      this.maps.phases,
      this.maps.events
    ]);

    // Encryption key stored for shareable link generation
    // Actual payload encryption handled by application layer via Web Crypto API

    // Setup awareness
    this.awareness = createAwareness(this.doc, config.userId, config.displayName);

    // Setup providers
    for (const provider of config.providers) {
      this.addProvider(provider);
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

  /**
   * Adds a new sync provider to the room dynamically.
   * Note for Phase 1: Dynamically-added providers must be wrapped by the signing layer 
   * to ensure zero-trust security perimeter isn't bypassed by late-connecting peers.
   */
  public addProvider(config: SyncProvider): Promise<{ destroy: () => void }> {
    return new Promise((resolve) => {
      if (config.type === 'websocket') {
        import('y-websocket').then(({ WebsocketProvider }) => {
          if (this._destroyed) { resolve({ destroy: () => {} }); return; }
          const wsProvider = new WebsocketProvider(
            config.url,
            this.config.roomId,
            this.doc,
            { connect: true },
          );
          wsProvider.on('status', (event: any) => {
            if (typeof event.status === 'string') {
              this._setStatus(event.status as SyncStatus, this._status.pending);
            }
          });
          this._providers.push(wsProvider);
          resolve({
            destroy: () => {
              wsProvider.destroy();
              this._providers = this._providers.filter(p => p !== wsProvider);
            }
          });
        });
      } else if (config.type === 'webrtc') {
        import('y-webrtc').then(({ WebrtcProvider }) => {
          if (this._destroyed) { resolve({ destroy: () => {} }); return; }
          const rtcProvider = new WebrtcProvider(
            this.config.roomId,
            this.doc,
            { signaling: config.signaling, password: config.password },
          );
          rtcProvider.on('status', (event: any) => {
            if (typeof event.status === 'string') {
              this._setStatus(event.status as SyncStatus, this._status.pending);
            }
          });
          
          // Initialize MediaSync CAS transfer engine
          if (this.config.localIdentity) {
            Promise.all([
              import('./mediaSync'),
              import('@noble/ed25519'),
              import('@noble/hashes/utils.js')
            ]).then(([{ MediaSync }, _ed, { bytesToHex }]) => {
              const privateKeyHex = bytesToHex(this.config.localIdentity!.privateKey);
              const admittedPeersHex = ((this.doc as any).__admittedPeers || []).map((p: Uint8Array) => bytesToHex(p));
              (this as any).mediaSync = new MediaSync(rtcProvider, this.doc, privateKeyHex, admittedPeersHex);
            }).catch(console.error);
          }

          this._providers.push(rtcProvider);
          resolve({
            destroy: () => {
              rtcProvider.destroy();
              this._providers = this._providers.filter(p => p !== rtcProvider);
            }
          });
        });
      } else {
        resolve({ destroy: () => {} });
      }
    });
  }
  private _setStatus(status: SyncStatus, pending: number): void {
    this._status = { status, pending };
    this._emitStatus();
  }

  private _emitStatus(): void {
    const e = { ...this._status };
    this._statusCallbacks.forEach((cb) => cb(e));
  }

  private setupZeroTrustIntercept(config: RoomConfig) {
    // We attach interceptors to this specific document instance
    const originalOn = this.doc.on.bind(this.doc);
    
    // Patch doc.on to intercept 'update' events
    // @ts-ignore
    this.doc.on = (name: string, f: Function) => {
      if (name === 'update') {
        const wrapped = (update: Uint8Array, origin: any, doc: Doc, tr: any) => {
          // If this update was generated locally (not from persistence/remote)
          if (config.localIdentity) {
            const sig = signUpdate(update, config.localIdentity.privateKey);
            const signedUpdate = new Uint8Array(sig.length + update.length);
            signedUpdate.set(sig, 0);
            signedUpdate.set(update, sig.length);
            f(signedUpdate, origin, doc, tr);
          } else {
            // Fallback for unauthenticated state, shouldn't happen in strict v3
            f(update, origin, doc, tr);
          }
        };
        return originalOn(name as any, wrapped as any);
      }
      return originalOn(name as any, f as any);
    };

    // Note: We need a way to intercept incoming updates before applyUpdate is called,
    // or monkey-patch Y.applyUpdate globally. For safety and avoiding global side effects,
    // we monkey-patch the Y module globally but scope the check to docs that have localIdentity.
    // However, a cleaner way in the browser is to wrap Y.applyUpdate natively.
    if (!(globalThis as any).__yjs_intercepted) {
      (globalThis as any).__yjs_intercepted = true;
      const Y = require('yjs');
      const originalApplyUpdate = Y.applyUpdate;
      Y.applyUpdate = function(doc: Doc, update: Uint8Array, transactionOrigin?: any) {
        // Only enforce for signed docs (64 byte sig prefix)
        if (update.length > 64) {
          const sig = update.slice(0, 64);
          const realUpdate = update.slice(64);
          
          // Bootstrap carve-out: Trust our own local identity
          // In a real app we'd verify against a known list of admitted peers
          let verified = false;
          const knownPeers = (doc as any).__admittedPeers || [];
          for (const pk of knownPeers) {
            if (verifyUpdate(sig, realUpdate, pk)) {
              verified = true;
              break;
            }
          }
          
          if (verified) {
            return originalApplyUpdate(doc, realUpdate, transactionOrigin);
          } else {
            console.warn("Rejected untrusted Yjs update");
            return;
          }
        }
        
        // Unsigned update (e.g. from local persistence bootstrap)
        return originalApplyUpdate(doc, update, transactionOrigin);
      };
      
      const originalEncodeStateAsUpdate = Y.encodeStateAsUpdate;
      Y.encodeStateAsUpdate = function(doc: Doc, encodedTargetStateVector?: Uint8Array) {
        const update = originalEncodeStateAsUpdate(doc, encodedTargetStateVector);
        if ((doc as any).__localIdentity) {
           const sig = signUpdate(update, (doc as any).__localIdentity.privateKey);
           const signedUpdate = new Uint8Array(sig.length + update.length);
           signedUpdate.set(sig, 0);
           signedUpdate.set(update, sig.length);
           return signedUpdate;
        }
        return update;
      };
    }
    
    if (config.localIdentity) {
      (this.doc as any).__localIdentity = config.localIdentity;
      // Initialize admitted peers list including self (bootstrap carve-out)
      (this.doc as any).__admittedPeers = [config.localIdentity.publicKey, ...(config.admittedPeers || [])];
    }
  }
}

/** Create a new collaboration room */
export function createRoom(config: RoomConfig): Room {
  return new Room(config);
}
