import { Map as YMap } from 'yjs';
import { createRoom } from '@stratigraph/sync';
import type { Room, AwarenessState } from '@stratigraph/sync';
import type { IncomingMessage, OutgoingMessage } from './protocol';

export class Bridge {
  private room: Room | null = null;
  private onSend: (msg: OutgoingMessage) => void;

  constructor(onSend: (msg: OutgoingMessage) => void) {
    this.onSend = onSend;
  }

  handle(msg: IncomingMessage): OutgoingMessage | null {
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

      this.room.onStatus((ev) => {
        this.onSend({
          type: 'sync_status' as const,
          state: ev.status,
          pending: ev.pending,
        });
      });

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

    this.onSend({ type: 'sync_status', state: 'connected', pending: 0 });
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
      entry = new YMap();
      entry.set('id', id);
      map.set(id, entry);
    }

    for (const [key, value] of Object.entries(fields)) {
      entry.set(key, value);
    }
    return null;
  }

  private _add(params: Record<string, unknown>): OutgoingMessage | null {
    if (!this.room) return this._error('Not initialized');
    const collection = params.collection as string;
    const document = params.document as Record<string, unknown>;

    const map = (this.room.maps as any)[collection];
    if (!map) return this._error(`Unknown collection: ${collection}`);

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
      return { type: 'state_snapshot', data: { [collection]: { [id]: entry.toJSON() } } };
    }

    const result: Record<string, any> = {};
    map.forEach((value: any, key: string) => {
      if (typeof value.toJSON === 'function') {
        result[key] = value.toJSON();
      }
    });
    return { type: 'state_snapshot', data: { [collection]: result } };
  }

  private _snapshot(): OutgoingMessage {
    if (!this.room) return { type: 'state_snapshot', data: {} };
    const data: Record<string, any> = {};
    for (const [name, map] of Object.entries(this.room.maps)) {
      data[name] = {};
      (map as any).forEach((value: any, key: string) => {
        if (typeof value.toJSON === 'function') {
          data[name][key] = value.toJSON();
        }
      });
    }
    return { type: 'state_snapshot', data };
  }

  private _leave(): OutgoingMessage | null {
    if (this.room) { this.room.leave(); this.room = null; }
    return null;
  }

  private _error(message: string): OutgoingMessage {
    return { type: 'error', message };
  }
}
