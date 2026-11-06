import argparse
import os
import socket
import threading

from common.protocol import DEFAULT_PORT, recv_packet
from server.connection import ClientConnection
from server.handlers import dispatch


def create_listener(host: str, port: int) -> socket.socket:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)  # IPv4 + TCP
    if os.name == "posix":
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((host, port))
    listener.listen()
    # A blocking accept() on Windows would ignore Ctrl+C.
    listener.settimeout(1.0)
    return listener


def handle_client(conn: ClientConnection) -> None:
    print(f"[connect] {conn.address}")
    try:
        while (packet := recv_packet(conn.sock)) is not None:
            dispatch(conn, packet)
    except (OSError, ValueError) as reason:
        print(f"[error] {conn.address}: {reason}")
    finally:
        # TODO(R4): remove conn.name from state.users and broadcast USERS_LIST.
        conn.sock.close()
        print(f"[disconnect] {conn.address}")


def serve(listener: socket.socket) -> None:
    while True:
        try:
            sock, address = listener.accept()
        except TimeoutError:
            continue
        except OSError:
            return  # The listener was closed.

        conn = ClientConnection(sock, address)
        threading.Thread(target=handle_client, args=(conn,), daemon=True).start()


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat server")
    # 0.0.0.0 accepts connections from other computers, not just this one (R1).
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    with create_listener(args.host, args.port) as listener:
        print(f"Chat server listening on {args.host}:{args.port}")
        try:
            serve(listener)
        except KeyboardInterrupt:
            print("Server stopped")


if __name__ == "__main__":
    main()
