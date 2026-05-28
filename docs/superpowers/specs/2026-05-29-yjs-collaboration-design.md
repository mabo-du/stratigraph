# Yjs Real-Time Collaboration Design

**Date**: 2026-05-29
**Status**: Approved
**Version**: 1.0

---

## 1. Overview

Add real-time multi-user editing to StratiGraph using Yjs CRDTs, designed as a
reusable `@stratigraph/sync` package that can be dropped into sister projects
(Trowel, Fritts, HOARD, Libby) with minimal per-project integration effort.

### Goals

- Real-time collaborative editing of stratigraphic matrices (contexts, observations, phases, events)
- Offline-first: work in the field without internet, sync automatically on reconnection
- Field-level CRDT merge: two people editing different fields of the same context merge cleanly
- Zero mandatory server infrastructure — WebRTC P2P for on-site field teams
- Optional WebSocket server for remote teams across different sites
- End-to-end encryption via y-encryption (embedded in shareable link)
- Cross-project: Python apps (Trowel/Fritts) connect via a lightweight Node.js sidecar

### Non-Goals

- Not replacing the existing single-user mode — Yjs runs always-on under the hood
- Not adding user accounts or permissions in v1 (Tier 3 authenticated rooms deferred)
- Not reimplementing Yjs itself — we provide a thin integration layer

---

## 2. Architecture

### 2.1 Layered Design

```
┌─────────────────────────────────────────────────────────────────┐
│ @stratigraph/sync               Core npm package               │
│  ├── Yjs document management    Y.Doc, Y.Map, Y.Array          │
│  ├── y-websocket provider       Remote team sync               │
│  ├── y-webrtc provider          Field P2P sync (no server)     │
│  ├── y-indexeddb provider       Offline persistence            │
│  ├── y-encryption provider      E2EE with link-embedded key    │
│  ├── Awareness                  Presence, cursors, selections  │
│  ├── UndoManager                Built-in CRDT undo/redo        │
│  └── Room management            Create, join, share, leave     │
├─────────────────────────────────────────────────────────────────┤
│ @stratigraph/sync-react         React bindings                 │
│  ├── useSync() hook             Subscribe to derived snapshots │
│  └── SyncProvider               React context for room lifecycle│
├─────────────────────────────────────────────────────────────────┤
│ sync-sidecar                    Node.js binary for Python apps  │
│  └── stdio JSON-RPC             Generic protocol, no PyQt dep   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Model (Nested Y.Maps)

Each collection in the matrix state maps to a Y.Map keyed by document ID.
Each field value is a nested Y.Map entry for field-level CRDT merge.

```
Y.Doc
├── contexts: Y.Map<Y.Map>        keyed by context.id
│   ├── "ctx-1": Y.Map
│   │   ├── "id": "ctx-1"
│   │   ├── "type": "fill"
│   │   ├── "description": "Orange silty clay"
│   │   └── "phase": "phase-2"
│   └── "ctx-4": Y.Map
│       └── ...
├── observations: Y.Map<Y.Map>    keyed by observation.id
├── phases: Y.Map<Y.Map>          keyed by phase.id
├── events: Y.Map<Y.Map>          keyed by event.id
├── positions: Y.Map<Y.Map>       keyed by context.id
├── meta: Y.Map                   project metadata
└── room: Y.Map                   room identity + encryption config
```

This structure ensures:
- Field-level merge: Alice edits `ctx-1.description` while Bob edits `ctx-1.type` — both survive
- Concurrent adds: both add different contexts — both appear
- Concurrent deletes: Yjs tombstone mechanism handles reconciliation

### 2.3 State Flow

```
User Action → React dispatch → Y.Map.set() → Yjs observer fires
  ↓                            ↓
Snapshot derived from Y.Map  Provider syncs operation to peers
  ↓                            ↓
React re-renders              y-indexeddb persists operation
```

Yjs shared types are the **source of truth**. React subscribes to derived
snapshots. No dual-source-of-truth problem.

### 2.4 Undo/Redo

Replace the current 50-deep manual undo stack with Yjs's built-in
`UndoManager`. This is CRDT-aware — undo across concurrent edits from
multiple users works correctly (each user undoes only their own operations).

---

## 3. Package API

### 3.1 Core: @stratigraph/sync

```typescript
// Create or join a collaboration room
const room = createRoom({
  roomId: string,
  userId: string,
  displayName: string,
  providers: Provider[],       // WebSocket | WebRTC | both
  encryptionKey?: string,      // for y-encryption
  persistence?: boolean,       // y-indexeddb on by default
})

// Interact with shared types
room.maps.contexts             // Y.Map of all contexts
room.maps.observations         // Y.Map of all observations
room.observeDeep(callback)     // Subscribe to any change

// Awareness
room.awareness.setLocalState({ cursor, selectedContext })
room.awareness.on('change', () => { /* update user list */ })

// Room lifecycle
room.shareableLink()           // "stratigraph://join/<id>?key=..."
room.leave()
room.destroy()
```

### 3.2 React Bindings: @stratigraph/sync-react

```typescript
// App root
<SyncProvider room={room}>
  <App />
</SyncProvider>

// Any component
function ContextEditor() {
  // Subscribe to a slice of the Yjs document
  const contexts = useSync(state => state.contexts)
  const activeUsers = useAwareness()
  // ...
}
```

### 3.3 Python Sidecar Protocol

Protocol: **JSON lines over stdio** (one JSON object per line, `\n` delimited).

**Python → Sidecar (stdin):**

| Method | Params | Description |
|--------|--------|-------------|
| `init` | `roomId`, `encryptionKey?`, `providers[]` | Initialize room |
| `patch` | `collection`, `id`, `fields` | Update specific fields on a document |
| `add` | `collection`, `document` | Add a new document to a collection |
| `delete` | `collection`, `id` | Remove a document |
| `query` | `collection`, `id?` | Get one or all documents |
| `snapshot` | — | Get the full state |
| `leave` | — | Disconnect from room |

**Sidecar → Python (stdout):**

| Type | Payload | Description |
|------|---------|-------------|
| `state_snapshot` | `{data}` | Full state (response to snapshot) |
| `remote_patch` | `{collection, id, fields, by}` | Remote edit |
| `remote_add` | `{collection, document, by}` | Remote add |
| `remote_delete` | `{collection, id, by}` | Remote delete |
| `awareness` | `{users: [{id, name, color}]}` | User presence update |
| `sync_status` | `{state, pending}` | Connection status |
| `error` | `{message}` | Error from sidecar |

---

## 4. Security (Tier 2 — Encrypted Rooms)

### 4.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| WiFi eavesdropping | E2EE via y-encryption before data leaves device |
| Rogue sync server | Encryption key never sent to server |
| Unauthorized room access | Room ID = random 128-bit token (not guessable) |
| Link leakage | Rotate by sharing new link (key change) |

### 4.2 Key Distribution

- 256-bit symmetric key generated at room creation
- Key embedded in the shareable link: `stratigraph://join/<roomId>?key=<base64key>`
- Key is never sent to the WebSocket server
- `y-encryption` encrypts each Yjs operation before transmission
- Server (if used) sees only encrypted blobs

### 4.3 Future: Tier 3 — Authenticated Rooms

- Add a user authentication layer to the optional WebSocket server
- Login via email/password or OAuth
- Server validates JWT before allowing sync
- Per-room permissions: admin, editor, viewer
- Audit log of joins/leaves/edits

---

## 5. Server Infrastructure (Optional)

### 5.1 WebRTC Mode (Default — No Server)

- Uses public signaling servers from the y-webrtc ecosystem
- Works over LAN with zero internet
- Ideal for on-site field teams in the same trench/tent

### 5.2 WebSocket Mode (Optional — Remote Teams)

- Lightweight Node.js server using `y-websocket`
- Deployable via Docker, Fly.io, Railway, or a Raspberry Pi on-site
- Persists room state to optional SQLite/Postgres for server restarts
- Same cryptographic model — server never sees plaintext data

### 5.3 Deployment Options

```yaml
# docker-compose.yml (future)
services:
  stratigraph-sync:
    image: stratigraph/sync-server
    ports:
      - "8080:8080"
    environment:
      - AUTH_ENABLED=false     # Tier 3 feature
    volumes:
      - ./data:/data
```

---

## 6. UI Components

### 6.1 Room Sharing Bar

Always-visible capsule in the top toolbar area:

```
[● Connected · 3 editors] [A][M][S] [📋 Copy invite link] [Sync: 100%]
```

- Connection status pill (green/amber/red)
- Collaborator avatar stack (overlapping circles with initials)
- "Copy invite link" button — copies `stratigraph://join/...?key=...`
- Sync progress indicator

### 6.2 Share Dialog

Modal triggered from the invite button:

- Shareable link display with copy button
- QR code option for near-field sharing (in-person, trench-to-tent)
- Link includes the 256-bit encryption key
- Option to access Project Settings for room configuration

### 6.3 Awareness / User List

Sidebar panel or toggleable drawer:

- List of connected users with colour-coded avatars
- Current activity indicator ("editing ctx-4", "viewing phase-2")
- Collaborative cursors in the Context Editor form fields
- Each collaborator has a stable colour assigned on join

### 6.4 Sync Status Indicator

Three states:

| State | Appearance | Meaning |
|-------|-----------|---------|
| `synced` | Green pill | All changes propagated |
| `syncing` | Amber pill with progress | Pending changes being sent |
| `offline` | Red pill with count | Disconnected, N changes pending |

### 6.5 Context Conflict Notification

If concurrent edits produce an unexpected state (e.g., two people added edges
that together create a cycle):

- Toast notification: "⚠ Context conflict detected — review ctx-4 edges"
- Yjs CRDT handles the data merge; the application layer flags logical issues
- Similar to how cycle detection already works in single-user mode

---

## 7. Offline Sync Flow

```
1. Always-on:  Every edit → Yjs operation → y-indexeddb
2. Disconnect: Edits accumulate in CRDT log, persisted in IndexedDB
3. Reconnect:  Provider syncs operation logs. CRDT auto-merges
4. File save:  Serialize Yjs state to .hmatrix.json (compatible with
               non-collab users — same format)
```

No manual merge step. No data loss. Yjs guarantees convergence.

---

## 8. Testing Strategy

### Layer 1: Yjs Operation Tests (vitest)
- Create/update/delete contexts via Y.Map operations
- Verify CRDT merge of concurrent field edits (Alice changes description, Bob changes type)
- Verify add/delete reconciliation

### Layer 2: Two-Client Sync Tests (vitest)
- Two in-memory Yjs docs connected via mock provider
- Client A adds context, Client B adds observation
- Verify both appear after sync

### Layer 3: Conflict Resolution Tests (vitest)
- Network partition: both clients edit same field, reconnect
- Verify deterministic CRDT merge
- Test edge-case cycles (both add edges that create a cycle — flag both)

### Layer 4: Sidecar Integration Tests (pytest)
- Python subprocess spawns sidecar
- Push patches via stdin, read state from stdout
- Verify round-trip for add/patch/delete/query/snapshot

### Layer 5: UI Playwright Tests
- Two browser tabs, same room
- Verify awareness shows both users
- Verify invite link copies
- Verify sync status updates
- Verify collaborative cursors appear

---

## 9. Future Enhancements (Deferred)

| Feature | Tier | Description |
|---------|------|-------------|
| Authenticated rooms | Tier 3 | User accounts, JWT, per-room permissions |
| File attachment sync | — | Sync photos/plans alongside context data |
| Change history / replay | — | Replay Yjs operation log for audit trail |
| WASM sidecar | — | Bundle Yjs as WASM for Python apps (remove Node.js dep) |
| Server persistence | — | Optional PostgreSQL for server-side room state |
| Conflict resolution UI | — | Review panel for logical conflicts (not CRDT conflicts) |

---

## 10. File Manifest

```
packages/stratigraph-sync/
├── src/
│   ├── index.ts              # Public API — createRoom, etc.
│   ├── room.ts               # Room lifecycle (Y.Doc, providers, encryption)
│   ├── types.ts              # Shared types, provider configs
│   ├── awareness.ts          # Presence management
│   ├── encryption.ts         # y-encryption setup
│   ├── persistence.ts        # y-indexeddb wrapper
│   ├── protocol.ts           # Sidecar JSON-RPC protocol
│   └── utils.ts              # Helpers
├── __tests__/
│   ├── room.test.ts
│   ├── merge.test.ts
│   └── conflict.test.ts
├── package.json
├── tsconfig.json
└── README.md

packages/stratigraph-sync-react/
├── src/
│   ├── SyncProvider.tsx      # React context provider
│   ├── useSync.ts            # Core hook — subscribe to snapshots
│   └── useAwareness.ts       # Hook — active users
├── package.json
└── tsconfig.json

packages/sync-sidecar/
├── src/
│   ├── index.ts              # Entry point — stdio JSON-RPC loop
│   ├── bridge.ts             # Yjs ↔ JSON-RPC translation
│   └── protocol.ts           # Message validation
├── package.json
├── tsconfig.json
└── bin/sync-sidecar

app/src/collaboration/
├── CollaborationBar.tsx      # Top toolbar status capsule
├── ShareDialog.tsx           # Invite link + QR code modal
├── AwarenessPanel.tsx        # User list sidebar panel
├── SyncIndicator.tsx         # Connection status badge
├── useCollaboration.ts       # Hook combining SyncProvider + awareness
└── index.ts
```

---

## 11. Integration Steps (StratiGraph)

1. Create `packages/stratigraph-sync/` as workspace package
2. Replace `useMatrixStore` reducer with Yjs-backed store
3. Add `SyncProvider` at the app root
4. Build React UI components (CollaborationBar, ShareDialog, etc.)
5. Create the sidecar package for Python interop
6. Add tests at all 5 layers
7. Update .hmatrix.json format to include room metadata
8. Tauri: ensure native dialogs work with share link deep links

---

## Appendix A: Sidecar JSON-RPC Examples

### Init
```json
→ {"method":"init","params":{"roomId":"a3f8c2d1","encryptionKey":"5e7f2b..."}}
← {"type":"state_snapshot","data":{"contexts":{},"observations":{},"phases":{},"events":{},"positions":{},"meta":{}}}
← {"type":"sync_status","state":"connected","pending":0}
```

### Patch
```json
→ {"method":"patch","params":{"collection":"contexts","id":"ctx-4","fields":{"description":"New silty clay fill"}}}
← {"type":"sync_status","state":"synced","pending":0}
```

### Remote Change Received
```json
← {"type":"remote_patch","collection":"contexts","id":"ctx-4","fields":{"type":"fill"},"by":"Marcus"}
```

### Snapshot
```json
→ {"method":"snapshot"}
← {"type":"state_snapshot","data":{"contexts":{"ctx-1":{...}},...}}
```

---

## Appendix B: Shareable Link Format

```
stratigraph://join/<roomId>?key=<encryptionKey>&name=<projectName>&server=<wsUrl>
```

- `roomId`: 128-bit random hex string (32 hex chars)
- `encryptionKey`: 256-bit base64url-encoded key (44 chars)
- `name`: URL-encoded project name (for display)
- `server`: Optional WebSocket server URL (omitted for WebRTC-only mode)

Example:
```
stratigraph://join/a3f8c2d1e5b7...?key=5e7f2b...&name=Trench%205%20West
```
