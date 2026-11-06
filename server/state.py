import threading
from dataclasses import dataclass, field
from typing import Any

from server.connection import ClientConnection


@dataclass
class ServerState:
    """In-memory state, which resets when the server restarts.

    Each client has its own thread, so hold `lock` while reading or changing this.
    """

    lock: threading.RLock = field(default_factory=threading.RLock)
    users: dict[str, ClientConnection] = field(default_factory=dict)
    groups: dict[str, dict[str, Any]] = field(default_factory=dict)
    history: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


state = ServerState()
