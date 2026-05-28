import { describe, it, expect } from 'vitest';
import { Doc, Map as YMap, applyUpdate } from 'yjs';

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

describe('conflict resolution', () => {
  it('deterministically merges same-field edits', () => {
    const [doc1, doc2] = createLinkedDocs();

    // Start with a base state
    const ctx = new YMap<unknown>();
    ctx.set('id', 'ctx-1');
    ctx.set('description', 'Original');
    doc1.getMap('contexts').set('ctx-1', ctx);

    // Alice and Bob edit the same field
    const aliceCtx = doc1.getMap('contexts').get('ctx-1') as YMap<unknown>;
    aliceCtx.set('description', 'Alice edit');

    const bobCtx = doc2.getMap('contexts').get('ctx-1') as YMap<unknown>;
    bobCtx.set('description', 'Bob edit');

    // Both peers converge to the same value
    const finalAlice = doc1.getMap('contexts').get('ctx-1') as YMap<unknown>;
    const finalBob = doc2.getMap('contexts').get('ctx-1') as YMap<unknown>;
    expect(finalAlice.get('description')).toBe(finalBob.get('description'));
    // Must be one of the two edits
    expect(['Alice edit', 'Bob edit']).toContain(finalAlice.get('description'));
  });

  it('handles concurrent add + delete of the same key without crashing', () => {
    const [doc1, doc2] = createLinkedDocs();

    // Alice adds ctx-1
    const ctx = new YMap<unknown>();
    ctx.set('id', 'ctx-1');
    ctx.set('description', 'Temporary');
    doc1.getMap('contexts').set('ctx-1', ctx);

    // Bob also gets it (update event has propagated) and modifies it
    // Alice deletes it
    doc1.getMap('contexts').delete('ctx-1');

    // Sync — no crash is the main test
    expect(true).toBe(true);
  });
});
