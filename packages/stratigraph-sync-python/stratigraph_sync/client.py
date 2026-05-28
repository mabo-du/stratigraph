"""
SyncClient — spawns sync-sidecar Node.js binary, communicates via stdio JSON-RPC.

Usage:
    client = SyncClient()
    client.init(InitConfig(room_id="my-room"))
    client.patch("contexts", "ctx-1", {"description": "new text"})
    snapshot = client.snapshot()
    client.leave()
"""

import json
import subprocess
import threading
from dataclasses import dataclass, field
from pathlib import Path
from queue import Queue
from typing import Any, Callable, Optional

from .models import AwarenessUser, InitConfig, RemoteChange, StateSnapshot, SyncStatus


class SyncClient:
    """Manages a sync-sidecar subprocess and provides JSON-RPC communication."""

    def __init__(self, sidecar_path: Optional[str] = None):
        self._proc: Optional[subprocess.Popen] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._running = False
        self._callbacks: dict[str, list[Callable]] = {
            "remote_patch": [],
            "remote_delete": [],
            "remote_add": [],
            "awareness": [],
            "sync_status": [],
            "error": [],
        }
        self._response_queue: Queue = Queue()
        self._sidecar_path = sidecar_path or self._find_sidecar()

    def _find_sidecar(self) -> str:
        """Locate the sync-sidecar binary, searching common locations."""
        # Check PATH first
        import shutil
        path = shutil.which("sync-sidecar")
        if path:
            return path

        # Check relative to this package (monorepo development)
        pkg_dir = Path(__file__).resolve().parent.parent.parent
        candidates = [
            pkg_dir / "sync-sidecar" / "bin" / "sync-sidecar",
            pkg_dir / ".." / ".." / "sync-sidecar" / "bin" / "sync-sidecar",
        ]
        for c in candidates:
            if c.exists():
                return str(c)

        # Check npm global
        npm_path = Path.home() / "node_modules" / ".bin" / "sync-sidecar"
        if npm_path.exists():
            return str(npm_path)

        raise FileNotFoundError(
            "sync-sidecar binary not found. Install with: cd packages/sync-sidecar && npm link"
        )

    @property
    def connected(self) -> bool:
        return self._running and self._proc is not None and self._proc.poll() is None

    def init(self, config: InitConfig, timeout: float = 10.0) -> StateSnapshot:
        """Initialize a collaboration room. Returns the initial state snapshot."""
        self._start_process()

        params: dict[str, Any] = {
            "roomId": config.room_id,
            "userId": config.user_id,
            "displayName": config.display_name,
        }
        if config.encryption_key:
            params["encryptionKey"] = config.encryption_key
        if config.sync_server:
            params["providers"] = [{"type": "websocket", "url": config.sync_server}]

        self._send({"method": "init", "params": params})
        response = self._wait_for_response(timeout)
        if response and response.get("type") == "state_snapshot":
            return StateSnapshot(data=response.get("data", {}))
        raise RuntimeError(f"init failed: {response}")

    def patch(self, collection: str, doc_id: str, fields: dict[str, Any]) -> None:
        """Update specific fields on a document."""
        self._send({
            "method": "patch",
            "params": {"collection": collection, "id": doc_id, "fields": fields},
        })

    def add(self, collection: str, document: dict[str, Any]) -> None:
        """Add a new document to a collection."""
        self._send({
            "method": "add",
            "params": {"collection": collection, "document": document},
        })

    def delete(self, collection: str, doc_id: str) -> None:
        """Remove a document from a collection."""
        self._send({
            "method": "delete",
            "params": {"collection": collection, "id": doc_id},
        })

    def query(self, collection: str, doc_id: Optional[str] = None,
              timeout: float = 5.0) -> dict[str, Any]:
        """Query documents in a collection. Returns the state_snapshot data."""
        params: dict[str, Any] = {"collection": collection}
        if doc_id:
            params["id"] = doc_id
        self._send({"method": "query", "params": params})
        response = self._wait_for_response(timeout)
        if response and response.get("type") == "state_snapshot":
            return response.get("data", {})
        raise RuntimeError(f"query failed: {response}")

    def snapshot(self, timeout: float = 5.0) -> dict[str, Any]:
        """Get the full state snapshot."""
        self._send({"method": "snapshot"})
        response = self._wait_for_response(timeout)
        if response and response.get("type") == "state_snapshot":
            return response.get("data", {})
        raise RuntimeError(f"snapshot failed: {response}")

    def leave(self) -> None:
        """Disconnect from the room but keep the subprocess alive."""
        if self.connected:
            self._send({"method": "leave"})

    def close(self) -> None:
        """Shut down the sidecar process."""
        self._running = False
        if self._proc:
            try:
                self._send({"method": "leave"})
                self._proc.wait(timeout=3)
            except Exception:
                self._proc.kill()
            self._proc = None

    def on(self, event: str, callback: Callable) -> None:
        """Register a callback for sidecar events.

        Events: 'remote_patch', 'remote_delete', 'remote_add', 'awareness', 'sync_status', 'error'
        """
        if event in self._callbacks:
            self._callbacks[event].append(callback)

    # ── Internal ──────────────────────────────────────────────────────────

    def _start_process(self) -> None:
        if self._proc is not None:
            return

        self._proc = subprocess.Popen(
            [self._sidecar_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._running = True
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

    def _send(self, msg: dict[str, Any]) -> None:
        if not self.connected:
            raise RuntimeError("Sidecar not connected")
        line = json.dumps(msg, ensure_ascii=False) + "\n"
        self._proc.stdin.write(line)  # type: ignore
        self._proc.stdin.flush()  # type: ignore

    def _reader_loop(self) -> None:
        while self._running and self._proc and self._proc.stdout:
            line = self._proc.stdout.readline()
            if not line:
                break
            try:
                msg = json.loads(line.strip())
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            if msg_type == "state_snapshot":
                self._response_queue.put(msg)
            elif msg_type in self._callbacks:
                for cb in self._callbacks[msg_type]:
                    cb(msg)

    def _wait_for_response(self, timeout: float) -> Optional[dict[str, Any]]:
        try:
            return self._response_queue.get(timeout=timeout)
        except Exception:
            return None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
