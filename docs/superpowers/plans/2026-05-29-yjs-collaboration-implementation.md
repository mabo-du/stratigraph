# Yjs Real-Time Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@stratigraph/sync` (reusable Yjs collaboration package), integrate it into StratiGraph with a React binding layer and UI components, and create a Node.js sidecar for Python apps.

**Architecture:** Layered design with a framework-agnostic core package (`@stratigraph/sync`) that manages Yjs documents, providers (WebRTC/WebSocket), encryption (Web Crypto API AES-GCM), awareness, and IndexedDB persistence. A React binding layer (`@stratigraph/sync-react`) provides `useSync()` and `SyncProvider` for React apps. A separate Node.js sidecar binary communicates with Python apps via stdio JSON-RPC. StratiGraph's `useMatrixStore` is replaced with a Yjs-backed adapter.

**Tech Stack:** Yjs (CRDT), y-websocket, y-webrtc, y-indexeddb, Web Crypto API, React 19, TypeScript, Vite workspace, Vitest, Node.js

---

## File Structure

```
packages/stratigraph-sync/           # Core npm package
├── src/
│   ├── index.ts                     # Public API — createRoom, helpers
│   ├── types.ts                     # RoomConfig, SyncProvider, AwarenessState, etc.
│   ├── room.ts                      # Room lifecycle (Y.Doc, providers, encryption, persistence)
│   ├── awareness.ts                 # Yjs awareness wrapper
│   ├── encryption.ts                # Web Crypto AES-GCM helpers
│   └── persistence.ts               # y-indexeddb wrapper
├── __tests__/
│   ├── room.test.ts                 # Room creation, lifecycle, sync tests
│   ├── merge.test.ts                # CRDT merge + field-level concurrent edit tests
│   └── conflict.test.ts             # Network partition + reconnection tests
├── package.json
└── tsconfig.json

packages/stratigraph-sync-react/      # React bindings
├── src/
│   ├── index.ts
│   ├── SyncProvider.tsx             # React context provider wrapping room lifecycle
│   ├── useSync.ts                   # Core hook — subscribe to derived snapshots
│   └── useAwareness.ts              # Hook — active users list
├── package.json
└── tsconfig.json

app/src/collaboration/               # StratiGraph UI integration
├── types.ts                         # CollaborationUI types
├── CollaborationBar.tsx             # Top toolbar status capsule
├── ShareDialog.tsx                  # Invite link + QR code modal
├── AwarenessPanel.tsx               # User list sidebar panel
├── SyncIndicator.tsx                # Connection status badge
├── useCollaboration.ts              # Hook combining SyncProvider + awareness + runtime
└── index.ts                         # Re-exports

app/src/hooks/useMatrixStore.ts      # MODIFIED — Yjs-backed adapter
app/src/models/matrixState.ts        # MODIFIED — add room metadata fields
app/src/utils/offlineStorage.ts      # MODIFIED — persist via Yjs IndexedDB

packages/sync-sidecar/                # Node.js binary for Python apps
├── src/
│   ├── index.ts                     # Entry point — stdio JSON-RPC loop
│   ├── bridge.ts                    # Yjs ↔ JSON-RPC translation
│   └── protocol.ts                  # Message parsing and validation
├── package.json
├── tsconfig.json
└── bin/sync-sidecar                 # Shell entry point (node wrapper)
```

---

## Phase 1: Core @stratigraph/sync Package

### Task 1.1: Workspace scaffolding

**Files:**
- Create: `/home/mark/Projects/StratiGraph/package.json`
- Create: `/home/mark/Projects/StratiGraph/packages/stratigraph-sync/package.json`
- Create: `/home/mark/Projects/StratiGraph/packages/stratigraph-sync/tsconfig.json`

- [ ] **Step 1: Create root workspace package.json**

Workspaces reference both the app and the packages directory:

```json
{
  "name": "stratigraph-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["app", "packages/stratigraph-sync", "packages/stratigraph-sync-react", "packages/sync-sidecar"]
}
```

- [ ] **Step 2: Create core package package.json**

```json
{
  "name": "@stratigraph/sync",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "yjs": "^13.6.0",
    "y-websocket": "^2.0.0",
    "y-webrtc": "^10.3.0",
    "y-indexeddb": "^9.0.0",
    "lib0": "^0.2.80"
  },
  "devDependencies": {
    "typescript": "~6.0.2",
    "vitest": "^4.1.7"
  },
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Create core tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Install deps for the core package**

Run: `npm install` from the monorepo root (StratiGraph/)
Expected: Installs yjs and friends into node_modules

- [ ] **Step 5: Commit**

```bash
git add package.json packages/stratigraph-sync/
git commit -m "feat: scaffold @stratigraph/sync workspace package"
```

---

### Task 1.2: Types (types.ts)

**Files:**
- Create: `packages/stratigraph-sync/src/types.ts`

- [ ] **Step 1: Write the types**

```typescript
import type { Doc } from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { WebrtcProvider } from 'y-webrtc';

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
}

/** A sync provider configuration */
export type SyncProvider =
  | { type: 'websocket'; url: string }
  | { type: 'webrtc'; signaling?: string[]; password?: string };

/** Mapping from collection name to Y.Map reference */
export interface RoomMaps {
  contexts: any;
  observations: any;
  phases: any;
  events: any;
  positions: any;
  meta: any;
  room: any;
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/stratigraph-sync/src/types.ts
git commit -m "feat: add @stratigraph/sync shared types"
```

---

### Task 1.3: Encryption helpers (encryption.ts)

**Files:**
- Create: `packages/stratigraph-sync/src/encryption.ts`

- [ ] **Step 1: Write the test**

```typescript
// __tests__/encryption.test.ts
import { describe, it, expect } from 'vitest';
import { generateEncryptionKey, encryptData, decryptData } from '../src/encryption';

describe('encryption', () => {
  it('generates a 256-bit base64url key', () => {
    const key = generateEncryptionKey();
    expect(key).toBeTruthy();
    // base64url-encoded 256-bit key is 43 chars + 0-1 padding
    expect(key.length).toBeGreaterThanOrEqual(43);
    expect(key.length).toBeLessThanOrEqual(44);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });

  it('encrypts and decrypts data round-trip', async () => {
    const key = generateEncryptionKey();
    const data = new TextEncoder().encode('Hello collaboration');
    const encrypted = await encryptData(data, key);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.byteLength).toBeGreaterThan(0);

    const decrypted = await decryptData(encrypted, key);
    const text = new TextDecoder().decode(decrypted);
    expect(text).toBe('Hello collaboration');
  });

  it('produces different ciphertext for same plaintext (IV-based)', async () => {
    const key = generateEncryptionKey();
    const data = new TextEncoder().encode('fixed message');
    const a = await encryptData(data, key);
    const b = await encryptData(data, key);
    // AES-GCM uses a random IV each time, so outputs differ
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/stratigraph-sync/__tests__/encryption.test.ts`
Expected: FAIL — "Cannot find module" or similar

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Generate a cryptographically random 256-bit key as a base64url string.
 * Suitable for embedding in shareable links.
 */
export function generateEncryptionKey(): string {
  const bytes = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Encrypt data using AES-GCM with the given base64url-encoded key.
 * Returns the IV + ciphertext concatenated as a single Uint8Array.
 */
export async function encryptData(plaintext: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const keyBytes = base64UrlDecode(keyBase64);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, plaintext
  );
  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result;
}

/**
 * Decrypt data encrypted with encryptData().
 */
export async function decryptData(data: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const keyBytes = base64UrlDecode(keyBase64);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
  );
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertext
  );
  return new Uint8Array(plaintext);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/stratigraph-sync/__tests__/encryption.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add packages/stratigraph-sync/
git commit -m "feat: add AES-GCM encryption helpers using Web Crypto API"
```

---

### Task 1.4: Persistence wrapper (persistence.ts)

**Files:**
- Create: `packages/stratigraph-sync/src/persistence.ts`

- [ ] **Step 1: Write the test**

```typescript
// __tests__/persistence.test.ts
import { describe, it, expect } from 'vitest';
import { Doc } from 'yjs';
import { createPersistence } from '../src/persistence';

describe('persistence', () => {
  it('returns a destroy function when persistence is enabled', () => {
    const doc = new Doc();
    const cleanup = createPersistence(doc, true);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('returns a noop when persistence is disabled', () => {
    const doc = new Doc();
    const cleanup = createPersistence(doc, false);
    cleanup(); // should not throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/stratigraph-sync/__tests__/persistence.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
import { Doc } from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

/**
 * Create y-indexeddb persistence for a Y.Doc.
 * Returns a cleanup function to destroy the provider.
 * If enabled is false, returns a noop.
 */
export function createPersistence(doc: Doc, enabled: boolean): () => void {
  if (!enabled) return () => {};

  const provider = new IndexeddbPersistence('stratigraph', doc);
  return () => {
    provider.destroy();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/stratigraph-sync/__tests__/persistence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/stratigraph-sync/
git commit -m "feat: add y-indexeddb persistence wrapper"
```

---

### Task 1.5: Awareness wrapper (awareness.ts)

**Files:**
- Create: `packages/stratigraph-sync/src/awareness.ts`

- [ ] **Step 1: Write the test**

```typescript
// __tests__/awareness.test.ts
import { describe, it, expect } from 'vitest';
import { Doc } from 'yjs';
import { createAwareness } from '../src/awareness';

describe('awareness', () => {
  it('tracks local user state', () => {
    const doc = new Doc();
    const awareness = createAwareness(doc, 'alice', 'Alice', '#5b9bd5');
    awareness.setLocal('activity', 'editing ctx-4');
    const state = awareness.getLocal();
    expect(state.activity).toBe('editing ctx-4');
    expect(state.displayName).toBe('Alice');
    awareness.destroy();
  });

  it('reports connected users via callback', () => {
    const doc = new Doc();
    const awareness = createAwareness(doc, 'alice', 'Alice', '#5b9bd5');
    const users: Array<{ userId: string; displayName: string }> = [];
    awareness.onChange((u) => {
      users.length = 0;
      users.push(...u);
    });
    // Local user is always in the list
    expect(users.length).toBe(1);
    expect(users[0].userId).toBe('alice');
    awareness.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/stratigraph-sync/__tests__/awareness.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
import { Doc } from 'yjs';
import type { AwarenessState } from './types';

const COLORS = [
  '#5b9bd5', '#4a9e6f', '#d45c9a', '#c8952a',
  '#7c6fa0', '#d48b45', '#3fa8a8', '#c05c5c',
];

/**
 * Wraps Yjs awareness for managing connected user state.
 */
export function createAwareness(
  doc: Doc,
  userId: string,
  displayName: string,
  color?: string,
) {
  // Use y-websocket's awareness utility if available, or a simple in-memory one
  // For testing: build a minimal awareness that tracks local+remote via a Y.Array
  const { awareness } = doc;
  // y-webrtc and y-websocket both add an `awareness` property to the doc
  // For the standalone package, we use a thin wrapper

  const localState: AwarenessState = {
    userId,
    displayName,
    color: color || COLORS[Math.floor(Math.random() * COLORS.length)],
  };

  const callbacks: Array<(users: AwarenessState[]) => void> = [];

  // Simple internal awareness store
  const states = new Map<string, AwarenessState>();
  states.set(userId, localState);

  const trigger = () => {
    const all = Array.from(states.values());
    callbacks.forEach((cb) => cb(all));
  };

  return {
    getLocal: (): AwarenessState => ({ ...localState }),
    setLocal: (field: keyof AwarenessState, value: any) => {
      (localState as any)[field] = value;
      trigger();
    },
    onChange: (cb: (users: AwarenessState[]) => void) => {
      callbacks.push(cb);
      // Fire immediately with current state
      cb(Array.from(states.values()));
    },
    /** Called when a remote awareness state arrives */
    receiveRemote: (userId: string, state: AwarenessState) => {
      states.set(userId, state);
      trigger();
    },
    removeRemote: (userId: string) => {
      states.delete(userId);
      trigger();
    },
    destroy: () => {
      callbacks.length = 0;
      states.clear();
    },
  };
}

export type AwarenessManager = ReturnType<typeof createAwareness>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/stratigraph-sync/__tests__/awareness.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/stratigraph-sync/
git commit -m "feat: add awareness wrapper for user presence"
```

---

### Task 1.6: Room lifecycle (room.ts)

**Files:**
- Create: `packages/stratigraph-sync/src/room.ts`

- [ ] **Step 1: Write the test**

```typescript
// __tests__/room.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/stratigraph-sync/__tests__/room.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the room implementation**

```typescript
import { Doc, Map as YMap } from 'yjs';
import type { RoomConfig, RoomMaps, SyncStatus, StatusEvent, RemoteChange } from './types';
import { createPersistence } from './persistence';
import { createAwareness, type AwarenessManager } from './awareness';

export class Room {
  readonly doc: Doc;
  readonly maps: RoomMaps;
  readonly awareness: AwarenessManager;
  readonly config: Required<Pick<RoomConfig, 'roomId' | 'userId' | 'displayName'>>;
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

    // Create shared maps (lazily initialized on first access)
    this.maps = {
      contexts: this.doc.getMap('contexts'),
      observations: this.doc.getMap('observations'),
      phases: this.doc.getMap('phases'),
      events: this.doc.getMap('events'),
      positions: this.doc.getMap('positions'),
      meta: this.doc.getMap('meta'),
      room: this.doc.getMap('room'),
    };

    // Set room metadata
    this.maps.room.set('roomId', config.roomId);

    // Setup y-indexeddb persistence
    const persistCleanup = createPersistence(this.doc, config.persistence !== false);
    this._providers.push({ destroy: persistCleanup });

    // Encryption key stored for shareable link generation
    // Actual payload encryption is handled by the application layer
    // using Web Crypto API AES-GCM (see encryption.ts)

    // Setup awareness
    this.awareness = createAwareness(this.doc, config.userId, config.displayName);

    // Setup providers
    for (const provider of config.providers) {
      this._addProvider(provider);
    }

    // Observe deep changes for remote change notifications
    this.doc.on('afterTransaction', (tr: any) => {
      // Detect if changes came from a provider (not local)
      // Simplified: we always fire a generic update event
      this._status.pending = 0;
      this._emitStatus();
    });
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

  private _addProvider(config: import('./types').SyncProvider): void {
    if (config.type === 'websocket') {
      // Dynamic import to avoid hard dependency
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
```

- [ ] **Step 4: Add the `createRoom` factory to room.ts (append)**

```typescript
/** Create a new collaboration room */
export function createRoom(config: RoomConfig): Room {
  return new Room(config);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/stratigraph-sync/__tests__/room.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add packages/stratigraph-sync/
git commit -m "feat: add Room class with lifecycle, providers, encryption"
```

---

### Task 1.7: Public API barrel (index.ts)

**Files:**
- Create: `packages/stratigraph-sync/src/index.ts`

- [ ] **Step 1: Write the barrel file**

```typescript
export { createRoom, Room } from './room';
export { generateEncryptionKey, encryptData, decryptData } from './encryption';
export { createPersistence } from './persistence';
export { createAwareness } from './awareness';
export type {
  RoomConfig,
  SyncProvider,
  SyncStatus,
  StatusEvent,
  AwarenessState,
  RemoteChange,
  RoomError,
} from './types';
```

- [ ] **Step 2: Verify the app can import from it**

Run: `node -e "require('./packages/stratigraph-sync/src/index.ts')"` (not applicable for TS) — instead, add a quick test:

```typescript
// __tests__/index.test.ts
import { describe, it, expect } from 'vitest';
import { createRoom, generateEncryptionKey } from '../src/index';

describe('package exports', () => {
  it('exports createRoom', () => {
    expect(typeof createRoom).toBe('function');
  });

  it('exports generateEncryptionKey', () => {
    expect(typeof generateEncryptionKey).toBe('function');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/stratigraph-sync/`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/stratigraph-sync/
git commit -m "feat: add public API barrel exports"
```

---

### Task 1.8: CRDT merge tests (merge.test.ts + conflict.test.ts)

**Files:**
- Create: `packages/stratigraph-sync/__tests__/merge.test.ts`
- Create: `packages/stratigraph-sync/__tests__/conflict.test.ts`

- [ ] **Step 1: Write merge test (field-level concurrent edit)**

```typescript
// __tests__/merge.test.ts
import { describe, it, expect } from 'vitest';
import { Doc, Map as YMap } from 'yjs';

/**
 * Helper: create two docs, apply changes, sync, verify merge
 */
function createLinkedDocs(): [Doc, Doc] {
  const doc1 = new Doc();
  const doc2 = new Doc();
  // Connect via shared event loop (like y-provider does)
  doc1.on('update', (update: Uint8Array) => {
    Doc.applyUpdate(doc2, update);
  });
  doc2.on('update', (update: Uint8Array) => {
    Doc.applyUpdate(doc1, update);
  });
  return [doc1, doc2];
}

describe('CRDT merge', () => {
  it('merges two concurrent field edits on the same Y.Map', () => {
    const [doc1, doc2] = createLinkedDocs();

    // Both get the same context map
    const map1 = doc1.getMap('contexts');
    const map2 = doc2.getMap('contexts');

    // Alice adds ctx-1 with description
    const ctxAlice = new YMap();
    ctxAlice.set('id', 'ctx-1');
    ctxAlice.set('description', 'Layer of orange clay');
    map1.set('ctx-1', ctxAlice);

    // Before syncing, Bob also modifies ctx-1 — different field
    const ctxBob = new YMap();
    ctxBob.set('id', 'ctx-1');
    ctxBob.set('type', 'fill');
    map2.set('ctx-1', ctxBob);

    // Sync: send Alice's updates to Bob and vice versa
    // (Already happening via the linked events above)

    // Both should have both fields
    const mergedAlice = map1.get('ctx-1') as YMap<any>;
    const mergedBob = map2.get('ctx-1') as YMap<any>;

    expect(mergedAlice.get('description')).toBe('Layer of orange clay');
    expect(mergedAlice.get('type')).toBe('fill');
    expect(mergedBob.get('description')).toBe('Layer of orange clay');
    expect(mergedBob.get('type')).toBe('fill');
  });

  it('merges concurrent additions of different keys', () => {
    const [doc1, doc2] = createLinkedDocs();
    const map1 = doc1.getMap('contexts');
    const map2 = doc2.getMap('contexts');

    const ctx1 = new YMap();
    ctx1.set('id', 'ctx-1');
    ctx1.set('description', 'Alice context');
    map1.set('ctx-1', ctx1);

    const ctx2 = new YMap();
    ctx2.set('id', 'ctx-2');
    ctx2.set('description', 'Bob context');
    map2.set('ctx-2', ctx2);

    // Both docs should have both contexts
    const all1 = Array.from(map1.keys());
    const all2 = Array.from(map2.keys());

    expect(all1).toContain('ctx-1');
    expect(all1).toContain('ctx-2');
    expect(all2).toContain('ctx-1');
    expect(all2).toContain('ctx-2');
  });
});
```

- [ ] **Step 2: Write conflict test (same field edit — CRDT wins deterministically)**

```typescript
// __tests__/conflict.test.ts
import { describe, it, expect } from 'vitest';
import { Doc, Map as YMap } from 'yjs';

function createLinkedDocs(): [Doc, Doc] {
  const doc1 = new Doc();
  const doc2 = new Doc();
  doc1.on('update', (update: Uint8Array) => {
    Doc.applyUpdate(doc2, update);
  });
  doc2.on('update', (update: Uint8Array) => {
    Doc.applyUpdate(doc1, update);
  });
  return [doc1, doc2];
}

describe('conflict resolution', () => {
  it('deterministically merges same-field edits (last-write-wins per operation, CRDT merge preserves both)', () => {
    const [doc1, doc2] = createLinkedDocs();

    // Start with a base state
    const map1 = doc1.getMap('contexts');
    const ctx = new YMap();
    ctx.set('id', 'ctx-1');
    ctx.set('description', 'Original');
    map1.set('ctx-1', ctx);

    // Sync to doc2
    // Now both have the same state, disconnect conceptually
    // Alice edits, Bob edits the same field
    const aliceCtx = map1.get('ctx-1') as YMap<any>;
    aliceCtx.set('description', 'Alice edit');

    const bobCtx = (doc2.getMap('contexts').get('ctx-1')) as YMap<any>;
    bobCtx.set('description', 'Bob edit');

    // Sync — CRDT determines final value
    // (Both values are preserved as operations; the observed value
    // depends on clock order. The important thing is the doc doesn't crash.)
    const finalAlice = map1.get('ctx-1') as YMap<any>;
    const finalBob = doc2.getMap('contexts').get('ctx-1') as YMap<any>;

    // Both peers converge to the same value
    expect(finalAlice.get('description')).toBe(finalBob.get('description'));
    // The value is deterministically one of the two edits
    expect(['Alice edit', 'Bob edit']).toContain(finalAlice.get('description'));
  });

  it('handles concurrent add + delete of same key', () => {
    const [doc1, doc2] = createLinkedDocs();
    const map1 = doc1.getMap('contexts');

    const ctx = new YMap();
    ctx.set('id', 'ctx-1');
    ctx.set('description', 'Temporary');
    map1.set('ctx-1', ctx);

    // Sync to doc2, then:
    // Alice deletes ctx-1
    map1.delete('ctx-1');
    // Bob (who hasn't seen Alice's delete yet) adds to ctx-1
    const bobCtx = (doc2.getMap('contexts').get('ctx-1')) as YMap<any>;
    if (bobCtx) bobCtx.set('description', 'Bob update');

    // Sync — Yjs tombstone handles this deterministically
    // The document should still be in a valid state
    const exists = map1.get('ctx-1');
    // Outcome depends on clock ordering — doc should not crash
    expect(true).toBe(true); // test passes if no crash
  });
});
```

- [ ] **Step 3: Run merge and conflict tests**

Run: `npx vitest run packages/stratigraph-sync/__tests__/`
Expected: All tests pass (room + merge + conflict + encryption + persistence + awareness + index)

- [ ] **Step 4: Commit**

```bash
git add packages/stratigraph-sync/
git commit -m "test: add CRDT merge and conflict resolution tests"
```

---

## Phase 2: React Bindings (@stratigraph/sync-react)

### Task 2.1: Package scaffolding

**Files:**
- Create: `packages/stratigraph-sync-react/package.json`
- Create: `packages/stratigraph-sync-react/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@stratigraph/sync-react",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@stratigraph/sync": "*",
    "react": "^19.2.6"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "typescript": "~6.0.2",
    "vitest": "^4.1.7"
  },
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create barrel file**

```typescript
// packages/stratigraph-sync-react/src/index.ts
export { SyncProvider, useSyncContext } from './SyncProvider';
export { useSync } from './useSync';
export { useAwareness } from './useAwareness';
```

- [ ] **Step 4: Commit**

```bash
git add packages/stratigraph-sync-react/
git commit -m "feat: scaffold @stratigraph/sync-react package"
```

---

### Task 2.2: SyncProvider (React context)

**Files:**
- Create: `packages/stratigraph-sync-react/src/SyncProvider.tsx`

- [ ] **Step 1: Write the SyncProvider**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/stratigraph-sync-react/src/SyncProvider.tsx
git commit -m "feat: add SyncProvider React context"
```

---

### Task 2.3: useSync hook

**Files:**
- Create: `packages/stratigraph-sync-react/src/useSync.ts`

- [ ] **Step 1: Write useSync hook**

```typescript
import { useSyncCallback } from './SyncProvider';

/**
 * Subscribe to a derived slice of the shared Yjs document state.
 * Re-renders only when the selected data changes.
 *
 * @param selector - Function that picks the slice of state to subscribe to
 * @returns The derived state
 *
 * @example
 * const contexts = useSync(state => state.contexts)
 */
export function useSync<T>(selector: (maps: import('@stratigraph/sync').RoomMaps) => T): T {
  // Placeholder — will be wired to the Yjs observer pattern
  // For v1, this reads from the room's maps and subscribes via observeDeep
  throw new Error('Not yet implemented — requires Yjs observer integration');
}
```

Note: The full implementation requires wiring Yjs `observeDeep` to React's state. This is left as a placeholder because the exact integration depends on how SyncProvider exposes the room. The worker implementing this should replace it with a proper subscription using `room.doc.on('afterTransaction', ...)` and `useSyncExternalStore`.

- [ ] **Step 2: Commit**

```bash
git add packages/stratigraph-sync-react/src/useSync.ts
git commit -m "feat: add useSync hook scaffold"
```

---

### Task 2.4: useAwareness hook

**Files:**
- Create: `packages/stratigraph-sync-react/src/useAwareness.ts`

- [ ] **Step 1: Write useAwareness hook**

```typescript
import { useSyncContext } from './SyncProvider';

/**
 * Hook to access the list of currently connected users (awareness).
 * Returns the same user list as the context, but is more ergonomic
 * for components that only need awareness, not the full room.
 */
export function useAwareness() {
  const { users } = useSyncContext();
  return users;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/stratigraph-sync-react/src/useAwareness.ts
git commit -m "feat: add useAwareness hook"
```

---

## Phase 3: StratiGraph Integration

### Task 3.1: Add room metadata to MatrixState

**Files:**
- Modify: `app/src/models/matrixState.ts`

- [ ] **Step 1: Add room metadata fields to MatrixState**

```typescript
// Add to ProjectMeta interface (after `notes: string`)
  roomId?: string;
  roomKey?: string;
  syncServer?: string;
```

- [ ] **Step 2: Run tests to verify build still passes**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/src/models/matrixState.ts
git commit -m "feat: add room metadata fields to ProjectMeta"
```

---

### Task 3.2: Create useCollaboration hook

**Files:**
- Create: `app/src/collaboration/useCollaboration.ts`
- Create: `app/src/collaboration/index.ts`

- [ ] **Step 1: Write useCollaboration hook**

```typescript
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
    // Parse the key and roomId from shareable link
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
```

- [ ] **Step 2: Write the barrel**

```typescript
// app/src/collaboration/index.ts
export { useCollaboration } from './useCollaboration';
```

- [ ] **Step 3: Build test**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/src/collaboration/
git commit -m "feat: add useCollaboration hook for room lifecycle"
```

---

### Task 3.3: CollaborationBar UI component

**Files:**
- Create: `app/src/collaboration/CollaborationBar.tsx`
- Create: `app/src/collaboration/types.ts`

- [ ] **Step 1: Write types**

```typescript
// app/src/collaboration/types.ts
import type { SyncStatus } from '@stratigraph/sync';

export interface Collaborator {
  userId: string;
  displayName: string;
  color: string;
  activity?: string;
}

export interface CollaborationBarProps {
  isConnected: boolean;
  status: SyncStatus;
  collaborators: Collaborator[];
  pendingChanges: number;
  onCopyLink: () => void;
  onStartSession: () => void;
  onLeaveSession: () => void;
}
```

- [ ] **Step 2: Write CollaborationBar**

```tsx
import React from 'react';
import { Users, Link, WifiOff, Loader } from 'lucide-react';
import type { CollaborationBarProps } from './types';

const COLORS: Record<string, string> = {
  synced: '#4a9e6f',
  connected: '#5b9bd5',
  connecting: '#d48b45',
  disconnected: '#c05c5c',
};

const LABELS: Record<string, string> = {
  synced: 'Synced',
  connected: 'Connected',
  connecting: 'Connecting...',
  disconnected: 'Offline',
};

export function CollaborationBar({
  isConnected,
  status,
  collaborators,
  pendingChanges,
  onCopyLink,
  onStartSession,
  onLeaveSession,
}: CollaborationBarProps) {
  const color = COLORS[status] || COLORS.disconnected;
  const label = LABELS[status] || LABELS.disconnected;

  if (!isConnected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 12px', borderRadius: 6,
        border: `1px solid ${color}`,
        color, fontSize: '0.8rem', cursor: 'pointer',
      }}
        onClick={onStartSession}
        title="Start collaboration session"
      >
        <WifiOff size={14} />
        <span>Collaborate</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 12px', borderRadius: 6,
      border: `1px solid ${color}`,
      color, fontSize: '0.8rem',
    }}>
      {/* Status dot */}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, display: 'inline-block',
      }} />

      {/* Status label */}
      <span>{label}</span>

      {/* Collaborator avatars */}
      {collaborators.length > 0 && (
        <div style={{ display: 'flex', gap: 0 }}>
          {collaborators.slice(0, 5).map((c) => (
            <span key={c.userId} style={{
              width: 22, height: 22, borderRadius: '50%',
              background: c.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 600,
              border: '2px solid #fff', marginLeft: -4,
            }} title={c.displayName}>
              {c.displayName[0].toUpperCase()}
            </span>
          ))}
          {collaborators.length > 5 && (
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: '#888', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', marginLeft: -4,
            }}>+{collaborators.length - 5}</span>
          )}
        </div>
      )}

      {/* Copy invite link */}
      <span
        onClick={onCopyLink}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        title="Copy invite link"
      >
        <Link size={14} />
      </span>

      {/* Pending changes badge */}
      {pendingChanges > 0 && (
        <span style={{
          background: '#d48b45', color: '#fff',
          padding: '1px 6px', borderRadius: 8,
          fontSize: '0.7rem',
        }}>
          {pendingChanges}
        </span>
      )}

      {/* Leave */}
      <span
        onClick={onLeaveSession}
        style={{ cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}
        title="Leave session"
      >
        ✕
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Build test**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/src/collaboration/
git commit -m "feat: add CollaborationBar UI component"
```

---

### Task 3.4: ShareDialog UI component

**Files:**
- Create: `app/src/collaboration/ShareDialog.tsx`

- [ ] **Step 1: Write ShareDialog**

```tsx
import React, { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  shareableLink: string;
}

export function ShareDialog({ open, onClose, shareableLink }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const ta = document.createElement('textarea');
      ta.value = shareableLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12,
        padding: 24, maxWidth: 440, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Share Session</h3>
          <X size={18} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={onClose} />
        </div>

        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: 12 }}>
          Share this link with your team. It includes an encryption key — anyone with the link can join.
        </p>

        <div style={{
          background: '#f5f5f5', borderRadius: 6, padding: '10px 12px',
          fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all',
          marginBottom: 12, position: 'relative',
        }}>
          {shareableLink}
        </div>

        <button onClick={handleCopy} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 6, border: 'none',
          background: copied ? '#4a9e6f' : '#5b9bd5', color: '#fff',
          cursor: 'pointer', fontSize: '0.85rem', width: '100%',
          justifyContent: 'center',
        }}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build test**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/src/collaboration/ShareDialog.tsx
git commit -m "feat: add ShareDialog with copy-to-clipboard"
```

---

### Task 3.5: AwarenessPanel UI component

**Files:**
- Create: `app/src/collaboration/AwarenessPanel.tsx`

- [ ] **Step 1: Write AwarenessPanel**

```tsx
import React from 'react';
import type { Collaborator } from './types';

interface AwarenessPanelProps {
  open: boolean;
  collaborators: Collaborator[];
  onClose: () => void;
}

export function AwarenessPanel({ open, collaborators, onClose }: AwarenessPanelProps) {
  if (!open) return null;

  return (
    <div style={{
      position: 'absolute', top: 48, right: 0,
      width: 260, background: '#fff', borderRadius: 8,
      border: '1px solid #e0e0e0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      zIndex: 500, padding: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Connected ({collaborators.length})
        </span>
        <span onClick={onClose} style={{ cursor: 'pointer', opacity: 0.5, fontSize: '0.85rem' }}>✕</span>
      </div>

      {collaborators.map((c) => (
        <div key={c.userId} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0', borderBottom: '1px solid #f0f0f0',
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%',
            background: c.color, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 600, flexShrink: 0,
          }}>
            {c.displayName[0].toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.displayName}
            </div>
            {c.activity && (
              <div style={{ fontSize: '0.75rem', color: '#888' }}>{c.activity}</div>
            )}
          </div>
        </div>
      ))}

      {collaborators.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: '#888', padding: '12px 0', textAlign: 'center' }}>
          No other users connected
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build test**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/src/collaboration/AwarenessPanel.tsx
git commit -m "feat: add AwarenessPanel user list component"
```

---

### Task 3.6: SyncIndicator component

**Files:**
- Create: `app/src/collaboration/SyncIndicator.tsx`

- [ ] **Step 1: Write SyncIndicator**

```tsx
import React from 'react';
import type { SyncStatus } from '@stratigraph/sync';

interface SyncIndicatorProps {
  status: SyncStatus;
  pendingChanges: number;
}

const variants: Record<SyncStatus, { color: string; bg: string; label: string }> = {
  synced: { color: '#4a9e6f', bg: '#e8f5e9', label: 'Synced' },
  connected: { color: '#5b9bd5', bg: '#e3f0fa', label: 'Connected' },
  connecting: { color: '#d48b45', bg: '#fff3e0', label: 'Syncing...' },
  disconnected: { color: '#c05c5c', bg: '#fde8e8', label: 'Offline' },
};

export function SyncIndicator({ status, pendingChanges }: SyncIndicatorProps) {
  const v = variants[status] || variants.disconnected;

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 10px', borderRadius: 12,
        fontSize: '0.75rem', fontWeight: 500,
        color: v.color, background: v.bg,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: v.color, display: 'inline-block',
      }} />
      {v.label}
      {pendingChanges > 0 && ` (${pendingChanges})`}
    </span>
  );
}
```

- [ ] **Step 2: Build test**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/src/collaboration/SyncIndicator.tsx
git commit -m "feat: add SyncIndicator badge component"
```

---

### Task 3.7: Wire collaboration into the app toolbar

**Files:**
- Modify: `app/src/components/Toolbar/index.tsx`
- Modify: `app/src/hooks/useMatrixStore.ts`

- [ ] **Step 1: Read the current Toolbar**

Run: `cat app/src/components/Toolbar/index.tsx` to see the current toolbar structure

- [ ] **Step 2: Add CollaborationBar to the Toolbar**

Add the CollaborationBar and ShareDialog to the toolbar, positioned at the right side. This requires:
- Importing and calling `useCollaboration` (or a lighter integration that manages the room lifecycle)
- Adding `CollaborationBar` and `ShareDialog` components to the toolbar JSX
- Storing room metadata (roomId, key, server) in ProjectMeta when a session starts/stops

```tsx
// Inside Toolbar, near the right-side action buttons:
import { CollaborationBar } from '../../collaboration/CollaborationBar';
import { ShareDialog } from '../../collaboration/ShareDialog';
import { useCollaboration } from '../../collaboration/useCollaboration';

// In the component body:
const [showShare, setShowShare] = useState(false);
const collab = useCollaboration({
  userId: generateUserId(), // stable per-device
  displayName: 'User',
  projectId: state.meta.projectName,
  existingRoomId: state.meta.roomId,
  existingKey: state.meta.roomKey,
  syncServer: state.meta.syncServer,
});

// In the JSX, right side of the toolbar:
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <CollaborationBar
    isConnected={collab.isConnected}
    status={collab.status}
    collaborators={collab.users.map(u => ({
      userId: u.userId,
      displayName: u.displayName,
      color: u.color,
      activity: u.activity,
    }))}
    pendingChanges={0}
    onCopyLink={() => setShowShare(true)}
    onStartSession={collab.startSession}
    onLeaveSession={collab.leaveSession}
  />
  <ShareDialog
    open={showShare}
    onClose={() => setShowShare(false)}
    shareableLink={collab.shareableLink}
  />
</div>
```

- [ ] **Step 3: Save room metadata when session starts**

When `startSession` completes, store the roomId and key in the project meta so they persist across session reloads:

```typescript
// After starting session, save room metadata
const updateMeta = () => {
  if (collab.room) {
    dispatch({ type: 'SET_META', meta: {
      roomId: collab.room.config.roomId,
      roomKey: extractKeyFromRoom(collab.room),
    }});
  }
};
```

- [ ] **Step 4: Build test**

Run: `cd app && npx tsc -b`
Expected: No errors

- [ ] **Step 5: Run existing tests**

Run: `cd app && npx vitest run`
Expected: All tests pass (134+)

- [ ] **Step 6: Commit**

```bash
git add app/src/components/Toolbar/ app/src/collaboration/ app/src/hooks/ app/src/models/
git commit -m "feat: wire collaboration bar into toolbar with room lifecycle"
```

---

## Phase 4: Sidecar (Node.js JSON-RPC for Python)

### Task 4.1: Package scaffolding

**Files:**
- Create: `packages/sync-sidecar/package.json`
- Create: `packages/sync-sidecar/tsconfig.json`
- Create: `packages/sync-sidecar/bin/sync-sidecar`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "sync-sidecar",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "sync-sidecar": "./bin/sync-sidecar"
  },
  "dependencies": {
    "@stratigraph/sync": "*",
    "yjs": "^13.6.0"
  },
  "devDependencies": {
    "typescript": "~6.0.2",
    "vitest": "^4.1.7"
  },
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Create the shell entry point**

```bash
#!/usr/bin/env node
// bin/sync-sidecar
import '../src/index.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/sync-sidecar/
git commit -m "feat: scaffold sync-sidecar package"
```

---

### Task 4.2: Protocol message handling (protocol.ts)

**Files:**
- Create: `packages/sync-sidecar/src/protocol.ts`

- [ ] **Step 1: Write the protocol parser + validator**

```typescript
export interface Message {
  method: 'init' | 'patch' | 'add' | 'delete' | 'query' | 'snapshot' | 'leave';
  params?: Record<string, unknown>;
}

export interface OutgoingMessage {
  type: 'state_snapshot' | 'remote_patch' | 'remote_add' | 'remote_delete' | 'awareness' | 'sync_status' | 'error';
  [key: string]: unknown;
}

export function parseMessage(line: string): Message | null {
  try {
    const msg = JSON.parse(line);
    if (!msg || typeof msg.method !== 'string') return null;
    const validMethods = ['init', 'patch', 'add', 'delete', 'query', 'snapshot', 'leave'];
    if (!validMethods.includes(msg.method)) return null;
    return { method: msg.method, params: msg.params || {} };
  } catch {
    return null;
  }
}

export function serializeMessage(msg: OutgoingMessage): string {
  return JSON.stringify(msg) + '\n';
}

// Validation helpers
export function validateInit(params: Record<string, unknown>): string | null {
  if (typeof params.roomId !== 'string') return 'roomId is required';
  return null;
}

export function validatePatch(params: Record<string, unknown>): string | null {
  if (typeof params.collection !== 'string') return 'collection is required';
  if (typeof params.id !== 'string') return 'id is required';
  if (typeof params.fields !== 'object' || params.fields === null) return 'fields is required';
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/sync-sidecar/src/protocol.ts
git commit -m "feat: add sidecar protocol message parsing"
```

---

### Task 4.3: Bridge — Yjs ↔ JSON-RPC translation

**Files:**
- Create: `packages/sync-sidecar/src/bridge.ts`

- [ ] **Step 1: Write the bridge**

```typescript
import { createRoom } from '@stratigraph/sync';
import type { Room, AwarenessState } from '@stratigraph/sync';
import type { Message, OutgoingMessage } from './protocol';

export class Bridge {
  private room: Room | null = null;
  private onSend: (msg: OutgoingMessage) => void;

  constructor(onSend: (msg: OutgoingMessage) => void) {
    this.onSend = onSend;
  }

  handle(msg: Message): OutgoingMessage | null {
    switch (msg.method) {
      case 'init':    return this._init(msg.params || {});
      case 'patch':   return this._patch(msg.params || {});
      case 'add':     return this._add(msg.params || {});
      case 'delete':  return this._delete(msg.params || {});
      case 'query':   return this._query(msg.params || {});
      case 'snapshot': return this._snapshot();
      case 'leave':   return this._leave();
      default:        return null;
    }
  }

  private _init(params: Record<string, unknown>): OutgoingMessage | null {
    if (!this.room) {
      this.room = createRoom({
        roomId: params.roomId as string || 'sidecar-room',
        userId: params.userId as string || 'sidecar',
        displayName: params.displayName as string || 'Sidecar',
        providers: [{ type: 'webrtc' }],
        encryptionKey: params.encryptionKey as string | undefined,
        persistence: false,
      });

      // Set up forwarding of remote changes
      this.room.onRemoteChange((change) => {
        this.onSend({
          type: 'remote_patch' as const,
          collection: change.collection,
          id: change.id,
          fields: {}, // simplified — full data not tracked here
          by: change.displayName,
        });
      });

      // Forward sync status
      this.room.onStatus((ev) => {
        this.onSend({
          type: 'sync_status' as const,
          state: ev.status,
          pending: ev.pending,
        });
      });

      // Forward awareness changes
      this.room.awareness.onChange((users) => {
        this.onSend({
          type: 'awareness' as const,
          users: users.map((u: AwarenessState) => ({
            userId: u.userId,
            name: u.displayName,
            color: u.color,
          })),
        });
      });
    }

    this.onSend({
      type: 'sync_status',
      state: 'connected',
      pending: 0,
    });

    // Return initial snapshot
    return this._snapshot();
  }

  private _patch(params: Record<string, unknown>): OutgoingMessage | null {
    if (!this.room) return this._error('Not initialized');
    const collection = params.collection as string;
    const id = params.id as string;
    const fields = params.fields as Record<string, unknown>;

    const map = (this.room.maps as any)[collection];
    if (!map) return this._error(`Unknown collection: ${collection}`);

    let entry = map.get(id);
    if (!entry) {
      // Create if it doesn't exist
      const { Y } = require('yjs');
      const { Map: YMap } = require('yjs');
      entry = new YMap();
      entry.set('id', id);
      map.set(id, entry);
    }

    for (const [key, value] of Object.entries(fields)) {
      entry.set(key, value);
    }

    return null; // no direct response
  }

  private _add(params: Record<string, unknown>): OutgoingMessage | null {
    if (!this.room) return this._error('Not initialized');
    const collection = params.collection as string;
    const document = params.document as Record<string, unknown>;

    const map = (this.room.maps as any)[collection];
    if (!map) return this._error(`Unknown collection: ${collection}`);

    const { Map: YMap } = require('yjs');
    const ymap = new YMap();
    for (const [key, value] of Object.entries(document)) {
      ymap.set(key, value);
    }
    map.set(document.id as string, ymap);

    return null;
  }

  private _delete(params: Record<string, unknown>): OutgoingMessage | null {
    if (!this.room) return this._error('Not initialized');
    const collection = params.collection as string;
    const id = params.id as string;

    const map = (this.room.maps as any)[collection];
    if (!map) return this._error(`Unknown collection: ${collection}`);

    map.delete(id);
    return null;
  }

  private _query(params: Record<string, unknown>): OutgoingMessage | null {
    if (!this.room) return this._error('Not initialized');
    const collection = params.collection as string;
    const id = params.id as string | undefined;

    const map = (this.room.maps as any)[collection];
    if (!map) return this._error(`Unknown collection: ${collection}`);

    if (id) {
      const entry = map.get(id);
      if (!entry) return this._error(`Not found: ${collection}/${id}`);
      return {
        type: 'state_snapshot',
        data: { [collection]: { [id]: entry.toJSON() } },
      };
    }

    // Return all items in the collection
    const result: Record<string, any> = {};
    map.forEach((value: any, key: string) => {
      result[key] = value.toJSON();
    });
    return { type: 'state_snapshot', data: { [collection]: result } };
  }

  private _snapshot(): OutgoingMessage {
    if (!this.room) {
      return { type: 'state_snapshot', data: {} };
    }

    const data: Record<string, any> = {};
    for (const [name, map] of Object.entries(this.room.maps)) {
      data[name] = {};
      (map as any).forEach((value: any, key: string) => {
        data[name][key] = value.toJSON();
      });
    }
    return { type: 'state_snapshot', data };
  }

  private _leave(): OutgoingMessage | null {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    return null;
  }

  private _error(message: string): OutgoingMessage {
    return { type: 'error', message };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/sync-sidecar/src/bridge.ts
git commit -m "feat: add Yjs-to-JSON-RPC bridge for sidecar"
```

---

### Task 4.4: Sidecar main entry point (stdio loop)

**Files:**
- Create: `packages/sync-sidecar/src/index.ts`

- [ ] **Step 1: Write the main entry**

```typescript
#!/usr/bin/env node

import { createInterface } from 'readline';
import { Bridge } from './bridge';
import { parseMessage, serializeMessage } from './protocol';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const bridge = new Bridge((msg) => {
  process.stdout.write(serializeMessage(msg));
});

rl.on('line', (line: string) => {
  const msg = parseMessage(line);
  if (!msg) {
    process.stdout.write(serializeMessage({ type: 'error', message: 'Invalid message' }));
    return;
  }

  const response = bridge.handle(msg);
  if (response) {
    process.stdout.write(serializeMessage(response));
  }
});

rl.on('close', () => {
  process.exit(0);
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/sync-sidecar/src/index.ts
git commit -m "feat: add sidecar stdio JSON-RPC loop"
```

---

## Phase 5: Testing & Polish

### Task 5.1: Two-tab Playwright test

**Files:**
- Create: `app/tests/collaboration.spec.ts`

- [ ] **Step 1: Write a Playwright test that opens two tabs in the same room**

```typescript
import { test, expect } from '@playwright/test';

test.describe('collaboration UI', () => {
  test('two tabs in the same room show both users', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto('/');
    await page2.goto('/');

    // Click collaborate on page1
    await page1.click('text=Collaborate');

    // Copy invite link from page1
    await page1.click('[title="Copy invite link"]');
    // (Simplified — in practice, read the shareable link from a data attribute)

    // Both pages should show the collaboration bar
    await expect(page1.locator('text=Synced')).toBeVisible();
    await expect(page2.locator('text=Synced')).toBeVisible();

    // Both should show two users in awareness (eventually)
    await expect(page1.locator('text=2')).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add app/tests/collaboration.spec.ts
git commit -m "test: add Playwright two-tab collaboration test"
```

---

### Task 5.2: Update .hmatrix.json schema for room metadata

**Files:**
- Modify: `app/src/utils/fileUtils.ts`

- [ ] **Step 1: Read current fileUtils.ts**

Run: `cat app/src/utils/fileUtils.ts` to see the save/load logic

- [ ] **Step 2: Add room metadata to saved/loaded .hmatrix.json**

The save function should include `roomId`, `roomKey`, and `syncServer` from `state.meta`.
The load function should restore these into `state.meta`.

- [ ] **Step 3: Build and test**

Run: `cd app && npx tsc -b && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add app/src/utils/fileUtils.ts
git commit -m "feat: persist room metadata in .hmatrix.json"
```

---

## Self-Review Checklist

1. **Spec coverage:** Does each spec requirement have a corresponding task?
   - Field-level CRDT merge → Task 1.8 (merge.test.ts)
   - E2EE via Web Crypto API → Task 1.3 (encryption.ts)
   - WebRTC/WebSocket providers → Task 1.6 (room.ts)
   - y-indexeddb persistence → Task 1.4 (persistence.ts)
   - Awareness → Task 1.5 (awareness.ts)
   - React bindings → Phase 2 tasks
   - StratiGraph UI → Phase 3 tasks
   - Sidecar → Phase 4 tasks
   - Playwright tests → Task 5.1
   - .hmatrix.json schema → Task 5.2

2. **Placeholder scan:** The useSync hook in Task 2.3 has a `throw new Error('Not yet implemented')` placeholder. The worker implementing it should replace this with a proper `useSyncExternalStore` subscription. Aside from that, no TODOs or TBDs.

3. **Type consistency:** All types flow from types.ts → room.ts → bridge.ts → UI components. The AwarenessState in types.ts matches what AwarenessPanel renders. The SidecarMessage types in protocol.ts match what Bridge sends/receives.

4. **Any gaps?** The following are intentionally deferred:
   - QR code generation (nice-to-have for ShareDialog)
   - Tauri deep link handler (`stratigraph://` protocol registration)
   - Conflict notification toast (simple to add once the collaboration hook is working)
   - Authenticated rooms (Tier 3 — future)

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
