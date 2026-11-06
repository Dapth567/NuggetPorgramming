"""Wire protocol shared by the server and the client.

TCP is a byte stream with no message boundaries, so every packet is framed as:

    [4-byte big-endian body length][UTF-8 JSON body]
"""

import json
import socket
import struct
from typing import Any

DEFAULT_PORT = 5050
MAX_PACKET_SIZE = 1024 * 1024

HEADER = struct.Struct("!I")

# Client -> server requests. The server answers each one with a RESPONSE.
LOGIN = "login"
DM_SEND = "dm_send"
GROUP_CREATE = "group_create"
GROUP_JOIN = "group_join"
GROUP_SEND = "group_send"

# Server -> client packets.
RESPONSE = "response"
USERS_LIST = "users_list"
GROUPS_LIST = "groups_list"
MESSAGE_NEW = "message_new"


def send_packet(sock: socket.socket, packet: dict[str, Any]) -> None:
    body = json.dumps(packet, ensure_ascii=False).encode("utf-8")
    if len(body) > MAX_PACKET_SIZE:
        raise ValueError(f"packet of {len(body)} bytes is too large")
    sock.sendall(HEADER.pack(len(body)) + body)


def recv_packet(sock: socket.socket) -> dict[str, Any] | None:
    """Return the next packet, or None if the peer closed the connection."""
    header = _recv_exact(sock, HEADER.size)
    if header is None:
        return None

    (length,) = HEADER.unpack(header)
    if length > MAX_PACKET_SIZE:
        raise ValueError(f"packet of {length} bytes is too large")

    body = _recv_exact(sock, length)
    if body is None:
        return None

    packet = json.loads(body.decode("utf-8"))
    if not isinstance(packet, dict):
        raise ValueError("packet is not a JSON object")
    return packet


def _recv_exact(sock: socket.socket, size: int) -> bytes | None:
    """Read exactly `size` bytes, because recv() may return only part of them."""
    buffer = bytearray()
    while len(buffer) < size:
        chunk = sock.recv(size - len(buffer))
        if not chunk:
            return None
        buffer += chunk
    return bytes(buffer)
