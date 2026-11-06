import socket
import threading
import unittest

from common import protocol
from common.protocol import recv_packet, send_packet
from server.main import create_listener, serve


class FramingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.left, self.right = socket.socketpair()
        self.addCleanup(self.left.close)
        self.addCleanup(self.right.close)

    def test_round_trip_keeps_thai_text(self) -> None:
        send_packet(self.left, {"type": "dm_send", "data": {"text": "สวัสดี"}})
        self.assertEqual(
            recv_packet(self.right), {"type": "dm_send", "data": {"text": "สวัสดี"}}
        )

    def test_two_packets_in_one_write_stay_separate(self) -> None:
        first = protocol.HEADER.pack(2) + b"{}"
        self.left.sendall(first + first)
        self.assertEqual(recv_packet(self.right), {})
        self.assertEqual(recv_packet(self.right), {})

    def test_packet_split_across_writes_is_reassembled(self) -> None:
        body = b'{"type": "login"}'
        self.left.sendall(protocol.HEADER.pack(len(body))[:2])
        self.left.sendall(protocol.HEADER.pack(len(body))[2:] + body[:5])
        self.left.sendall(body[5:])
        self.assertEqual(recv_packet(self.right), {"type": "login"})

    def test_closed_peer_returns_none(self) -> None:
        self.left.close()
        self.assertIsNone(recv_packet(self.right))


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        listener = create_listener("127.0.0.1", 0)
        self.addCleanup(listener.close)
        threading.Thread(target=serve, args=(listener,), daemon=True).start()

        self.client = socket.create_connection(listener.getsockname(), timeout=5)
        self.addCleanup(self.client.close)

    def test_response_echoes_request_id(self) -> None:
        send_packet(self.client, {"type": protocol.LOGIN, "id": 7, "data": {"name": "a"}})
        response = recv_packet(self.client)
        self.assertEqual(response["type"], protocol.RESPONSE)
        self.assertEqual(response["id"], 7)

    def test_unknown_packet_type_is_rejected(self) -> None:
        send_packet(self.client, {"type": "nope", "id": 1})
        response = recv_packet(self.client)
        self.assertFalse(response["ok"])
        self.assertIn("unknown packet type", response["error"])


if __name__ == "__main__":
    unittest.main()
