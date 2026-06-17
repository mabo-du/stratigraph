import * as Y from 'yjs';
import { verifyUpdate as verifySignature, signUpdate } from '../../../app/src/security/crypto.js';

let _interceptorEnabled = false;
let _publicKey: Uint8Array | null = null;

export const enableZeroTrust = (publicKey: Uint8Array) => {
  _interceptorEnabled = true;
  _publicKey = publicKey;
};

// Export our custom applyUpdate
export const applyUpdate = (doc: Y.Doc, update: Uint8Array, transactionOrigin?: any) => {
  if (_interceptorEnabled) {
    if (update.length > 64) {
      const sig = update.slice(0, 64);
      const realUpdate = update.slice(64);

      if (_publicKey && verifySignature(realUpdate, sig, _publicKey)) {
        Y.applyUpdate(doc, realUpdate, transactionOrigin);
        return;
      }

      const admittedPeers = (doc as any).__admittedPeers || [];
      for (const peerKey of admittedPeers) {
        if (verifySignature(realUpdate, sig, peerKey)) {
          Y.applyUpdate(doc, realUpdate, transactionOrigin);
          return;
        }
      }
      
      console.warn('Blocked unsigned Yjs update from peer');
      return; // Drop malicious update
    } else {
      console.warn('Blocked unsigned Yjs update from peer (missing signature)');
      return; // Drop malicious update
    }
  }

  // If interceptor is not enabled, just pass through (for other tests/docs)
  Y.applyUpdate(doc, update, transactionOrigin);
};

export const encodeStateAsUpdate = (doc: Y.Doc, encodedTargetStateVector?: Uint8Array) => {
  const update = Y.encodeStateAsUpdate(doc, encodedTargetStateVector);
  if (_interceptorEnabled && (doc as any).__localIdentity) {
    const sig = signUpdate(update, (doc as any).__localIdentity.privateKey);
    const signedUpdate = new Uint8Array(sig.length + update.length);
    signedUpdate.set(sig, 0);
    signedUpdate.set(update, sig.length);
    return signedUpdate;
  }
  return update;
};

// Re-export everything ELSE from Yjs, omitting applyUpdate and encodeStateAsUpdate
export const {
  AbstractConnector,
  AbstractStruct,
  AbstractType,
  Array,
  ContentAny,
  ContentBinary,
  ContentDeleted,
  ContentDoc,
  ContentEmbed,
  ContentFormat,
  ContentJSON,
  ContentString,
  ContentType,
  Doc,
  GC,
  Item,
  Map,
  RelativePosition,
  Snapshot,
  Text,
  UndoManager,
  UpdateDecoderV1,
  UpdateDecoderV2,
  UpdateEncoderV1,
  UpdateEncoderV2,
  XmlElement,
  XmlFragment,
  XmlHook,
  XmlText,
  YArrayEvent,
  YEvent,
  YMapEvent,
  YTextEvent,
  YXmlEvent,
  applyUpdateV2,
  compareRelativePositions,
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
  createSnapshot,
  decodeRelativePosition,
  decodeSnapshot,
  decodeSnapshotV2,
  decodeStateVector,
  decodeUpdate,
  decodeUpdateV2,
  diffUpdate,
  diffUpdateV2,
  emptySnapshot,
  encodeRelativePosition,
  encodeSnapshot,
  encodeSnapshotV2,
  encodeStateAsUpdateV2,
  encodeStateVector,
  encodeStateVectorFromUpdate,
  encodeStateVectorFromUpdateV2,
  equalSnapshots,
  findIndexSS,
  getTypeChildren,
  isDeleted,
  isParentOf,
  logType,
  logUpdate,
  logUpdateV2,
  mergeUpdates,
  mergeUpdatesV2,
  parseUpdateMeta,
  parseUpdateMetaV2,
  readUpdate,
  readUpdateV2,
  snapshot,
  tryGc,
  transact
} = Y;
