import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Workspace } from './Workspace';
import { useCollaboration } from './collaboration/useCollaboration';
import { SyncProvider } from '@stratigraph/sync-react';
import { useMdnsDiscovery } from './hooks/useMdns';

function generateUserId(): string {
  let id = localStorage.getItem('stratigraph-user-id');
  if (!id) {
    id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem('stratigraph-user-id', id);
  }
  return id;
}

function App() {
  const [localSyncServer, setLocalSyncServer] = useState<string | undefined>();
  const [projectName] = useState('Untitled Matrix'); // Placeholder

  // Discover local Rust axum port for the WebSocket
  useEffect(() => {
    if ((window as any).__TAURI_INTERNALS__) {
      invoke<number>('get_local_port')
        .then(port => setLocalSyncServer(`ws://127.0.0.1:${port}/sync`))
        .catch(console.error);
    }
  }, []);

  // Set up the collaboration room pointing to the local sync server
  const collab = useCollaboration({
    userId: generateUserId(),
    displayName: 'User',
    projectId: projectName,
    syncServer: localSyncServer,
  });

  // Start discovery in Tauri for the current room
  const peers = useMdnsDiscovery(collab.room?.config.roomId || '');

  const connectionsRef = useRef<Map<string, { destroy: () => void }>>(new Map());

  useEffect(() => {
    if (!collab.room || peers.length === 0) {
      if (peers.length === 0 && connectionsRef.current.size > 0) {
        connectionsRef.current.forEach(c => c.destroy());
        connectionsRef.current.clear();
      }
      return;
    }

    const currentPeerIds = new Set<string>();

    peers.forEach(p => {
      // Validate IP is local network
      const isLocal = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(p.ip);
      if (!isLocal) {
        console.warn(`Ignoring non-local mDNS peer: ${p.ip}`);
        return;
      }
      
      currentPeerIds.add(p.fullname);
      if (!connectionsRef.current.has(p.fullname)) {
        const url = `ws://${p.ip}:${p.port}/sync`;
        // Eagerly set placeholder to prevent double connection
        connectionsRef.current.set(p.fullname, { destroy: () => {} });
        
        collab.room!.addProvider({ type: 'websocket', url }).then(conn => {
           // Replace placeholder with actual cleanup function
           // If we've since deleted this peer, immediately destroy it
           if (!connectionsRef.current.has(p.fullname)) {
             conn.destroy();
           } else {
             connectionsRef.current.set(p.fullname, conn);
           }
        });
      }
    });

    // Cleanup disconnected peers
    for (const [id, conn] of connectionsRef.current.entries()) {
      if (!currentPeerIds.has(id)) {
        conn.destroy();
        connectionsRef.current.delete(id);
      }
    }
  }, [peers, collab.room]);

  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(c => c.destroy());
      connectionsRef.current.clear();
    };
  }, []);

  // We wrap the Workspace with SyncProvider so that useMatrixStoreCRDT can access the context
  return (
    <SyncProvider room={collab.room}>
      <Workspace collab={collab} />
    </SyncProvider>
  );
}

export default App;
