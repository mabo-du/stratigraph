/// <reference lib="dom" />

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
