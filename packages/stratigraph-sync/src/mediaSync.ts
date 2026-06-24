import { WebrtcProvider } from 'y-webrtc';
import * as ed from '@noble/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { loadMedia, saveMedia, listMedia, deleteMedia } from '../../../app/src/utils/offlineMediaStorage';
import * as Y from 'yjs';

const CHUNK_SIZE = 16 * 1024; // 16 KB

interface IncomingTransfer {
  hash: string;
  size: number;
  chunks: Uint8Array[];
  receivedChunks: Set<number>;
  totalChunks: number;
}

export class MediaSync {
  private mediaChannels = new Map<string, RTCDataChannel>(); // peerId -> channel
  private incoming = new Map<string, IncomingTransfer>(); // hash -> transfer state

  // local configuration
  private privateKey: Uint8Array;
  private publicKeyHex: string;
  private admittedPeers: Set<string>;

  private provider: WebrtcProvider;
  private ydoc: Y.Doc;

  constructor(
    provider: WebrtcProvider,
    ydoc: Y.Doc,
    privateKeyHex: string,
    admittedPeersHex: string[]
  ) {
    this.provider = provider;
    this.ydoc = ydoc;
    this.privateKey = hexToBytes(privateKeyHex);
    this.publicKeyHex = bytesToHex(ed.getPublicKey(this.privateKey));
    this.admittedPeers = new Set(admittedPeersHex);

    // Watch for new Yjs peers to establish side-channel DataChannels
    provider.on('peers', ({ added }: { added: string[] }) => {
      added.forEach((peerId) => {
        const webrtcConn = (provider as any).room?.webrtcConns.get(peerId);
        if (webrtcConn && webrtcConn.peer && webrtcConn.peer._pc) {
          this.setupDataChannel(peerId, webrtcConn.peer._pc);
        }
      });
    });

    // Watch awareness for requests
    provider.awareness.on('change', () => {
      this.handleAwarenessChange();
    });

    // Broadcast our initial requests
    this.scanAndRequestMissingMedia();

    // Listen to Yjs doc changes to discover new mediaRefs
    ydoc.on('update', () => {
      this.scanAndRequestMissingMedia();
    });
  }

  private setupDataChannel(peerId: string, pc: RTCPeerConnection) {
    if (this.mediaChannels.has(peerId)) return;

    try {
      // Create a pre-negotiated out-of-band data channel
      const dc = pc.createDataChannel('stratigraph-media', { negotiated: true, id: 42 });
      dc.binaryType = 'arraybuffer';

      dc.onopen = () => {
        console.log(`[MediaSync] DataChannel open for ${peerId}`);
        this.mediaChannels.set(peerId, dc);
        this.handleAwarenessChange(); // check if we need to send anything now that channel is open
      };

      dc.onmessage = async (event) => {
        await this.handleMessage(peerId, new Uint8Array(event.data));
      };

      dc.onclose = () => {
        this.mediaChannels.delete(peerId);
      };
    } catch (e) {
      console.error(`[MediaSync] Failed to setup data channel for ${peerId}`, e);
    }
  }

  private async scanAndRequestMissingMedia() {
    // Collect all mediaRefs from the graph
    const contexts = this.ydoc.getMap('contexts');
    const neededHashes = new Set<string>();

    for (const ctx of contexts.values() as IterableIterator<any>) {
      if (ctx && Array.isArray(ctx.mediaRefs)) {
        for (const hash of ctx.mediaRefs) {
          // Check if we have it locally
          const localUrl = await loadMedia(hash);
          if (localUrl) {
            URL.revokeObjectURL(localUrl); // We just needed to check existence
          } else {
            neededHashes.add(hash);
          }
        }
      }
    }

    const currentRequests = this.provider.awareness.getLocalState()?.media_requests || [];
    const newRequests = Array.from(neededHashes);

    // Only update if changed to prevent awareness thrashing
    if (JSON.stringify(currentRequests) !== JSON.stringify(newRequests)) {
      this.provider.awareness.setLocalStateField('media_requests', newRequests);
    }
  }

  private async handleAwarenessChange() {
    // Look at all peers' requests and see if we can fulfill them
    const states = this.provider.awareness.getStates();

    for (const [clientId, state] of states.entries()) {
      if (clientId === this.provider.awareness.clientID) continue;

      const requests = (state as any).media_requests as string[];
      if (!requests || requests.length === 0) continue;

      // Map awareness clientId to WebRTC peerId
      // (y-webrtc awareness state includes peer identity indirectly, but actually we can just broadcast the offer to all connected peers if they requested it)
      // Actually, let's just find the peerId in webrtcConns.
      // y-webrtc awareness does not expose peerId natively, but we can just broadcast the OFFER to all connected data channels if ANY peer requested it.
      // The peer who needs it will ACCEPT it.

      for (const hash of requests) {
        // If we have this file, we can offer it
        const fileUrl = await loadMedia(hash);
        if (fileUrl) {
          // We have it! Fetch the blob so we can send it.
          const res = await fetch(fileUrl);
          const blob = await res.blob();
          URL.revokeObjectURL(fileUrl);

          // Broadcast OFFER to all open media channels
          for (const dc of this.mediaChannels.values()) {
             await this.sendOffer(dc, hash, blob.size);
          }
        }
      }
    }
  }

  private async sendOffer(dc: RTCDataChannel, hash: string, size: number) {
    if (dc.readyState !== 'open') return;

    // OFFER format:
    // [0] = TYPE (0)
    // [1..64] = hash string (64 bytes hex string)
    // [65..72] = size (8 bytes Float64)
    // [73..137] = pubKey (64 bytes hex string)
    // [138..266] = signature of hash (128 bytes hex string)

    const encoder = new TextEncoder();
    const hashBytes = encoder.encode(hash.padEnd(64, ' '));
    const pubKeyBytes = encoder.encode(this.publicKeyHex);

    const signature = await ed.sign(hashBytes, this.privateKey);
    const sigHex = bytesToHex(signature);
    const sigBytes = encoder.encode(sigHex);

    const payload = new Uint8Array(1 + 64 + 8 + 64 + 128);
    const view = new DataView(payload.buffer);

    payload[0] = 0; // TYPE: OFFER
    payload.set(hashBytes, 1);
    view.setFloat64(65, size, true);
    payload.set(pubKeyBytes, 73);
    payload.set(sigBytes, 137);

    dc.send(payload);
  }

  private async handleMessage(peerId: string, data: Uint8Array) {
    const type = data[0];
    const decoder = new TextDecoder();
    const view = new DataView(data.buffer);

    if (type === 0) {
      // Handle OFFER
      const hash = decoder.decode(data.subarray(1, 65)).trim();
      const size = view.getFloat64(65, true);
      const pubKeyHex = decoder.decode(data.subarray(73, 137));
      const sigHex = decoder.decode(data.subarray(137, 265));

      // Verify Identity
      if (!this.admittedPeers.has(pubKeyHex)) {
        console.warn(`[MediaSync] Rejected OFFER for ${hash}: Unknown peer identity.`);
        return;
      }

      const sigBytes = hexToBytes(sigHex);
      const hashBytes = data.subarray(1, 65);
      const isValid = await ed.verify(sigBytes, hashBytes, hexToBytes(pubKeyHex));
      if (!isValid) {
        console.warn(`[MediaSync] Rejected OFFER for ${hash}: Invalid signature.`);
        return;
      }

      // Check if we actually need it
      const myRequests = this.provider.awareness.getLocalState()?.media_requests || [];
      if (!myRequests.includes(hash)) return;

      // Setup incoming state
      const totalChunks = Math.ceil(size / CHUNK_SIZE);
      if (!this.incoming.has(hash)) {
        this.incoming.set(hash, {
          hash,
          size,
          chunks: new Array(totalChunks),
          receivedChunks: new Set(),
          totalChunks
        });
      }

      // Send ACCEPT (Send our bitfield to resume)
      const acceptPayload = new Uint8Array(1 + 64);
      acceptPayload[0] = 1; // ACCEPT
      acceptPayload.set(hashBytes, 1);
      // NOTE: For simplicity, we just send ACCEPT. In a true resume, we'd append the received chunk indices.

      const dc = this.mediaChannels.get(peerId);
      if (dc) dc.send(acceptPayload);

    } else if (type === 1) {
      // Handle ACCEPT
      const hash = decoder.decode(data.subarray(1, 65)).trim();
      const fileUrl = await loadMedia(hash);
      if (!fileUrl) return;

      const res = await fetch(fileUrl);
      const buffer = await res.arrayBuffer();
      URL.revokeObjectURL(fileUrl);

      const dc = this.mediaChannels.get(peerId);
      if (!dc) return;

      this.streamChunks(dc, hash, new Uint8Array(buffer));

    } else if (type === 2) {
      // Handle CHUNK
      const hash = decoder.decode(data.subarray(1, 65)).trim();
      const chunkIndex = view.getUint32(65, true);
      const payload = data.subarray(69);

      const transfer = this.incoming.get(hash);
      if (!transfer) return;

      if (!transfer.receivedChunks.has(chunkIndex)) {
        transfer.chunks[chunkIndex] = payload;
        transfer.receivedChunks.add(chunkIndex);

        if (transfer.receivedChunks.size === transfer.totalChunks) {
          // Reassemble
          const totalLength = transfer.chunks.reduce((acc, c) => acc + c.length, 0);
          const completeBlob = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of transfer.chunks) {
            completeBlob.set(chunk, offset);
            offset += chunk.length;
          }

          // Verify CAS & Commit
          try {
            const blob = new Blob([completeBlob], { type: 'application/octet-stream' });
            await saveMedia(blob, hash);
            console.log(`[MediaSync] Successfully downloaded and verified ${hash}`);
            this.incoming.delete(hash);
            this.scanAndRequestMissingMedia(); // Removes from awareness
          } catch (e) {
            console.error(`[MediaSync] CAS verification failed for ${hash}, discarding blob.`);
            this.incoming.delete(hash);
          }
        }
      }
    }
  }

  private async streamChunks(dc: RTCDataChannel, hash: string, fileData: Uint8Array) {
    const encoder = new TextEncoder();
    const hashBytes = encoder.encode(hash.padEnd(64, ' '));
    const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      if (dc.readyState !== 'open') break;

      // Backpressure logic
      while (dc.bufferedAmount > 1024 * 1024) { // 1 MB limit
        await new Promise<void>(resolve => {
          const listener = () => {
            dc.removeEventListener('bufferedamountlow', listener);
            resolve();
          };
          dc.addEventListener('bufferedamountlow', listener);
          // Failsafe timeout
          setTimeout(() => {
            dc.removeEventListener('bufferedamountlow', listener);
            resolve();
          }, 500);
        });
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileData.length);
      const chunkPayload = fileData.subarray(start, end);

      const packet = new Uint8Array(1 + 64 + 4 + chunkPayload.length);
      const view = new DataView(packet.buffer);
      packet[0] = 2; // CHUNK
      packet.set(hashBytes, 1);
      view.setUint32(65, i, true);
      packet.set(chunkPayload, 69);

      dc.send(packet);
    }
  }

  public async runGarbageCollection() {
    console.log('[MediaSync] Running CAS Garbage Collection...');
    const localHashes = await listMedia();
    const activeHashes = new Set<string>();

    const contexts = this.ydoc.getMap('contexts');
    for (const ctx of contexts.values() as IterableIterator<any>) {
      if (ctx && Array.isArray(ctx.mediaRefs)) {
        for (const hash of ctx.mediaRefs) {
          activeHashes.add(hash);
        }
      }
    }

    let deletedCount = 0;
    const now = Date.now();
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const orphansStr = localStorage.getItem('stratigraph_cas_orphans');
    const orphans: Record<string, number> = orphansStr ? JSON.parse(orphansStr) : {};

    for (const hash of localHashes) {
      if (!activeHashes.has(hash)) {
        if (!orphans[hash]) {
          // Mark as orphaned today
          orphans[hash] = now;
        } else if (now - orphans[hash] > TTL_MS) {
          // TTL expired, purge
          await deleteMedia(hash);
          delete orphans[hash];
          deletedCount++;
        }
      } else if (orphans[hash]) {
        // Blob is active again, rescue it from the chopping block
        delete orphans[hash];
      }
    }

    // Clean up orphans map for hashes we no longer have locally (e.g. manually deleted)
    for (const hash of Object.keys(orphans)) {
      if (!localHashes.includes(hash)) {
        delete orphans[hash];
      }
    }

    localStorage.setItem('stratigraph_cas_orphans', JSON.stringify(orphans));

    if (deletedCount > 0) {
      console.log(`[MediaSync] GC completed: purged ${deletedCount} orphaned blobs.`);
    }
  }
}
