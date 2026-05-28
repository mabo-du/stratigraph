from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class SyncStatus:
    state: str  # 'disconnected' | 'connecting' | 'connected' | 'synced'
    pending: int = 0


@dataclass
class AwarenessUser:
    user_id: str
    name: str
    color: str


@dataclass
class RemoteChange:
    type: str  # 'add' | 'update' | 'delete'
    collection: str
    id: str
    fields: dict[str, Any] = field(default_factory=dict)
    by: str = ""


@dataclass
class StateSnapshot:
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class InitConfig:
    room_id: str
    user_id: str = "python-client"
    display_name: str = "Python Client"
    encryption_key: Optional[str] = None
    sync_server: Optional[str] = None
