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
