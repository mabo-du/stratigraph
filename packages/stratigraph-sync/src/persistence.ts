/// <reference lib="dom" />

import { Doc } from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

/**
 * Create y-indexeddb persistence for a Y.Doc.
 * Returns a cleanup function to destroy the provider.
 * If enabled is false, returns a noop.
 */
export function createPersistence(doc: Doc, enabled: boolean, onSynced?: () => void): () => void {
  if (!enabled) {
    if (onSynced) setTimeout(onSynced, 0);
    return () => {};
  }

  const provider = new IndexeddbPersistence('stratigraph', doc);
  if (onSynced) {
    provider.on('synced', () => onSynced());
  }

  return () => {
    provider.destroy();
  };
}
