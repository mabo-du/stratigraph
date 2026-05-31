import { describe, it, expect } from 'vitest';
import { createRoom } from '@stratigraph/sync';

describe('Yjs CRDT Store Logic', () => {
  it('adds and updates contexts using real Y.Doc', () => {
    const room = createRoom({ roomId: 'test', userId: '1', displayName: '1', providers: [], persistence: false });
    
    room.doc.transact(() => {
      room.maps.contexts.set('ctx1', { id: 'ctx1', type: 'Deposit', name: 'Layer 1' });
    });
    
    expect(room.maps.contexts.get('ctx1')).toBeDefined();
    expect((room.maps.contexts.get('ctx1') as any).name).toBe('Layer 1');
    room.destroy();
  });

  it('verifies UndoManager undoes context addition but ignores positions', () => {
    const room = createRoom({ roomId: 'test', userId: '1', displayName: '1', providers: [], persistence: false });
    
    // Add context and position in same transaction
    room.doc.transact(() => {
      room.maps.contexts.set('ctx1', { id: 'ctx1', type: 'Deposit', name: 'Layer 1' });
      room.maps.positions.set('ctx1', { x: 10, y: 10 });
    });
    
    expect(room.undoManager.undoStack.length).toBe(1);
    
    // Undo it
    room.undoManager.undo();
    
    // Context should be undone
    expect(room.maps.contexts.has('ctx1')).toBe(false);
    
    // Position should NOT be undone (since it was excluded from UndoManager)
    expect(room.maps.positions.has('ctx1')).toBe(true);
    
    room.destroy();
  });
});
