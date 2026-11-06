import socket
import threading
from typing import Any

from common.protocol import send_packet


class ClientConnection:
    """One connected client on the server side."""

    def __init__(self, sock: socket.socket, address: tuple[str, int]) -> None:
        self.sock = sock
        self.address = address
        self.name: str | None = None  # Set after a successful login.
        self._send_lock = threading.Lock()

    def send(self, packet: dict[str, Any]) -> None:
        # Other clients' threads also send here, so whole packets must not interleave.
        with self._send_lock:
            send_packet(self.sock, packet)
