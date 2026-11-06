import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chat/shared";

// By default, the server is the same machine that served this page, on port 3000.
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? `http://${window.location.hostname}:3000`;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  transports: ["websocket"],
});
