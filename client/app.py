import argparse
import queue
from typing import Any

import customtkinter as ctk

from client.connection import CONNECTED, DISCONNECTED, ServerConnection
from common.protocol import DEFAULT_PORT

POLL_INTERVAL_MS = 50


class ChatApp(ctk.CTk):
    def __init__(self, host: str, port: int) -> None:
        super().__init__()
        self.title("Socket Chat")
        self.geometry("900x600")

        self.address = f"{host}:{port}"
        self.status = ctk.CTkLabel(self, text=f"{self.address}: connecting...")
        self.status.pack(padx=16, pady=16)

        self.connection = ServerConnection(host, port)
        self.connection.start()
        self.after(POLL_INTERVAL_MS, self.poll_events)

    def poll_events(self) -> None:
        while True:
            try:
                self.handle_event(self.connection.events.get_nowait())
            except queue.Empty:
                break
        self.after(POLL_INTERVAL_MS, self.poll_events)

    def handle_event(self, event: dict[str, Any]) -> None:
        if event["type"] == CONNECTED:
            self.status.configure(text=f"{self.address}: connected")
        elif event["type"] == DISCONNECTED:
            self.status.configure(text=f"{self.address}: disconnected")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat client")
    parser.add_argument("--host", default="127.0.0.1", help="IP address of the server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    ChatApp(args.host, args.port).mainloop()


if __name__ == "__main__":
    main()
