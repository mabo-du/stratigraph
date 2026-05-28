export interface IncomingMessage {
  method: 'init' | 'patch' | 'add' | 'delete' | 'query' | 'snapshot' | 'leave';
  params?: Record<string, unknown>;
}

export interface OutgoingMessage {
  type: 'state_snapshot' | 'remote_patch' | 'remote_add' | 'remote_delete' | 'awareness' | 'sync_status' | 'error';
  [key: string]: unknown;
}

export function parseMessage(line: string): IncomingMessage | null {
  try {
    const msg = JSON.parse(line);
    if (!msg || typeof msg.method !== 'string') return null;
    const validMethods = ['init', 'patch', 'add', 'delete', 'query', 'snapshot', 'leave'] as const;
    if (!validMethods.includes(msg.method)) return null;
    return { method: msg.method, params: msg.params || {} };
  } catch {
    return null;
  }
}

export function serializeMessage(msg: OutgoingMessage): string {
  return JSON.stringify(msg) + '\n';
}

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
