import { describe, it, expect } from 'vitest';
import { Doc, Map as YMap, applyUpdate } from 'yjs';

/**
 * Helper: create two docs, apply updates bidirectionally to simulate sync
 */
function createLinkedDocs(): [Doc, Doc] {
  const doc1 = new Doc();
  const doc2 = new Doc();
  doc1.on('update', (update: Uint8Array) => {
    applyUpdate(doc2, update);
  });
  doc2.on('update', (update: Uint8Array) => {
    applyUpdate(doc1, update);
  });
  return [doc1, doc2];
}

describe('CRDT merge', () => {
  it('merges two concurrent field edits on the same Y.Map', () => {
    const [doc1, doc2] = createLinkedDocs();

    // Alice creates ctx-1 — this gets synced to doc2
    const ctx = new YMap<unknown>();
    ctx.set('id', 'ctx-1');
    ctx.set('description', 'Layer of orange clay');
    doc1.getMap('contexts').set('ctx-1', ctx);

    // Both sides now have ctx-1 via sync.
    // Alice and Bob modify different fields on the same nested map concurrently
    const aliceCtx = doc1.getMap('contexts').get('ctx-1') as YMap<unknown>;
    aliceCtx.set('type', 'fill');

    const bobCtx = doc2.getMap('contexts').get('ctx-1') as YMap<unknown>;
    bobCtx.set('phase', 'post-excavation');

    // Both peers should have all fields after CRDT merge
    const mergedAlice = doc1.getMap('contexts').get('ctx-1') as YMap<unknown>;
    const mergedBob = doc2.getMap('contexts').get('ctx-1') as YMap<unknown>;

    expect(mergedAlice.get('description')).toBe('Layer of orange clay');
    expect(mergedAlice.get('type')).toBe('fill');
    expect(mergedAlice.get('phase')).toBe('post-excavation');
    expect(mergedBob.get('description')).toBe('Layer of orange clay');
    expect(mergedBob.get('type')).toBe('fill');
    expect(mergedBob.get('phase')).toBe('post-excavation');
  });

  it('merges concurrent additions of different keys', () => {
    const [doc1, doc2] = createLinkedDocs();
    const map1 = doc1.getMap('contexts');
    const map2 = doc2.getMap('contexts');

    const ctx1 = new YMap<unknown>();
    ctx1.set('id', 'ctx-1');
    ctx1.set('description', 'Alice context');
    map1.set('ctx-1', ctx1);

    const ctx2 = new YMap<unknown>();
    ctx2.set('id', 'ctx-2');
    ctx2.set('description', 'Bob context');
    map2.set('ctx-2', ctx2);

    const all1 = Array.from(map1.keys());
    const all2 = Array.from(map2.keys());

    expect(all1).toContain('ctx-1');
    expect(all1).toContain('ctx-2');
    expect(all2).toContain('ctx-1');
    expect(all2).toContain('ctx-2');
  });

  it('propagates nested map updates within a parent map', () => {
    const [doc1, doc2] = createLinkedDocs();

    // Create a context in doc1
    const ctx = new YMap<unknown>();
    ctx.set('id', 'ctx-1');
    ctx.set('description', 'Initial');
    doc1.getMap('contexts').set('ctx-1', ctx);

    // Doc2 sees it and updates a field
    const ctxOnDoc2 = doc2.getMap('contexts').get('ctx-1') as YMap<unknown>;
    ctxOnDoc2.set('description', 'Updated by Bob');

    // Both should converge to 'Updated by Bob'
    const final1 = (doc1.getMap('contexts').get('ctx-1') as YMap<unknown>).get('description');
    const final2 = (doc2.getMap('contexts').get('ctx-1') as YMap<unknown>).get('description');
    expect(final1).toBe('Updated by Bob');
    expect(final2).toBe('Updated by Bob');
  });
});
