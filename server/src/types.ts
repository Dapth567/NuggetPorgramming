import type { Server, Socket } from "socket.io";
import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@chat/shared";

export interface SocketData {
  /** Set after a successful `auth:login`. */
  name?: string;
}

type NoEvents = Record<string, never>;

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
export type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;

export const NOT_IMPLEMENTED: Ack<never> = { ok: false, error: "NOT_IMPLEMENTED" };
