"""Integration tests for the SyncClient.

These tests require the sync-sidecar binary to be available.
Run: pytest tests/ -v
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from stratigraph_sync import SyncClient, InitConfig


def find_sidecar() -> str:
    """Locate the sync-sidecar binary for testing."""
    # Check common locations
    candidates = [
        Path(__file__).resolve().parent.parent.parent
        / "sync-sidecar" / "bin" / "sync-sidecar",
        Path(__file__).resolve().parent.parent.parent.parent
        / "sync-sidecar" / "bin" / "sync-sidecar",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    pytest.skip("sync-sidecar binary not found for integration tests")
    return ""


class TestSyncClientIntegration:
    def test_init_creates_room(self):
        sidecar = find_sidecar()
        client = SyncClient(sidecar_path=sidecar)
        try:
            snapshot = client.init(InitConfig(room_id="test-py-room"))
            assert isinstance(snapshot.data, dict)
            assert "contexts" in snapshot.data
            assert "observations" in snapshot.data
            assert snapshot.data["contexts"] == {}
        finally:
            client.close()

    def test_patch_updates_field(self):
        sidecar = find_sidecar()
        client = SyncClient(sidecar_path=sidecar)
        try:
            client.init(InitConfig(room_id="test-py-patch"))
            client.add("contexts", {"id": "ctx-1", "type": "fill"})
            client.patch("contexts", "ctx-1", {"description": "Clay layer"})
            data = client.query("contexts", "ctx-1")
            ctx = data.get("contexts", {}).get("ctx-1", {})
            assert ctx.get("description") == "Clay layer"
            assert ctx.get("type") == "fill"
        finally:
            client.close()

    def test_snapshot_returns_all_data(self):
        sidecar = find_sidecar()
        client = SyncClient(sidecar_path=sidecar)
        try:
            client.init(InitConfig(room_id="test-py-snap"))
            client.add("contexts", {"id": "ctx-1", "type": "fill"})
            client.add("observations", {"id": "obs-1", "source": "ctx-1", "target": "ctx-2"})

            data = client.snapshot()
            assert "contexts" in data
            assert "observations" in data
            assert "ctx-1" in data["contexts"]
        finally:
            client.close()

    def test_delete_removes_document(self):
        sidecar = find_sidecar()
        client = SyncClient(sidecar_path=sidecar)
        try:
            client.init(InitConfig(room_id="test-py-del"))
            client.add("contexts", {"id": "ctx-1", "type": "fill"})
            query_result = client.query("contexts")
            assert "ctx-1" in query_result.get("contexts", {})
            client.delete("contexts", "ctx-1")
            query_result = client.query("contexts")
            assert "ctx-1" not in query_result.get("contexts", {})
        finally:
            client.close()

    def test_on_sync_status_callback(self):
        sidecar = find_sidecar()
        client = SyncClient(sidecar_path=sidecar)
        events = []
        client.on("sync_status", lambda m: events.append(m))
        try:
            client.init(InitConfig(room_id="test-py-status"))
            assert len(events) >= 1
            assert events[0].get("state") == "connected"
        finally:
            client.close()
