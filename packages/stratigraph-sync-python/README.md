# stratigraph-sync

Python client for `@stratigraph/sync` — real-time multi-user editing powered by Yjs CRDTs.

Connects to the `sync-sidecar` Node.js binary over stdio JSON-RPC. Requires Node.js to be installed.

## Quick Start

```python
from stratigraph_sync import SyncClient, InitConfig

client = SyncClient()
snapshot = client.init(InitConfig(room_id="trench-5-west"))
print(snapshot.data)  # {"contexts": {}, "observations": {}, ...}

# Register event handlers
def on_change(msg):
    print(f"Remote change: {msg}")

client.on("remote_patch", on_change)

# Read and write data
client.add("contexts", {"id": "ctx-1", "type": "fill", "description": "Clay layer"})
client.patch("contexts", "ctx-1", {"description": "Sandy clay"})
all_contexts = client.query("contexts")
single = client.query("contexts", "ctx-1")
full = client.snapshot()

client.leave()
client.close()
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `remote_patch` | `{collection, id, fields, by}` | Remote document update |
| `remote_delete` | `{collection, id, by}` | Remote document deletion |
| `remote_add` | `{collection, document, by}` | Remote document addition |
| `awareness` | `{users: [...]}` | User presence update |
| `sync_status` | `{state, pending}` | Connection status change |
