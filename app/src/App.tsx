import { useEffect, useState } from 'react';
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

  // Log peers just to verify discovery works
  useEffect(() => {
    if (peers.length > 0) {
      console.log('Discovered peers in the same room:', peers);
    }
  }, [peers]);

  // We wrap the Workspace with SyncProvider so that useMatrixStoreCRDT can access the context
  return (
    <SyncProvider room={collab.room}>
      <Workspace collab={collab} />
    </SyncProvider>
  );
}

export default App;
