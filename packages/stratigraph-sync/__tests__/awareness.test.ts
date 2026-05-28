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
