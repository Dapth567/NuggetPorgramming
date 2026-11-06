import itertools
import queue
import socket
import threading
from typing import Any

from common.protocol import recv_packet, send_packet

CONNECT_TIMEOUT_SECONDS = 5

# Local events placed on the queue alongside packets from the server.
CONNECTED = "connected"
DISCONNECTED = "disconnected"


class ServerConnection:
    """TCP connection to the server.

    A background thread receives packets and puts them on `events`. The GUI reads
    that queue from its own thread, because Tkinter is not thread-safe.
    """

    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.events: queue.Queue[dict[str, Any]] = queue.Queue()
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)  # IPv4 + TCP
        self._request_ids = itertools.count(1)

    def start(self) -> None:
        threading.Thread(target=self._receive_loop, daemon=True).start()

    def request(self, packet_type: str, data: dict[str, Any]) -> int:
        """Send a request; the server's RESPONSE carries the returned id."""
        request_id = next(self._request_ids)
        send_packet(self._sock, {"type": packet_type, "id": request_id, "data": data})
        return request_id

    def _receive_loop(self) -> None:
        try:
            self._sock.settimeout(CONNECT_TIMEOUT_SECONDS)
            self._sock.connect((self.host, self.port))
            self._sock.settimeout(None)
            self.events.put({"type": CONNECTED})

            while (packet := recv_packet(self._sock)) is not None:
                self.events.put(packet)
        except (OSError, ValueError) as reason:
            print(f"[connection error] {reason}")
        finally:
            self._sock.close()
            self.events.put({"type": DISCONNECTED})
