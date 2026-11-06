import { notImplemented, type ChatServer, type ChatSocket } from "../types.js";

export function registerAuthHandlers(_io: ChatServer, socket: ChatSocket) {
  // TODO(R3): verify the password hash; reject a name that is already online.
  // TODO(R4): broadcast `users:list` after login and on disconnect.
  socket.on("auth:login", (_payload, ack) => ack(notImplemented("R3")));
}
