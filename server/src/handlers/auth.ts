import { NOT_IMPLEMENTED, type ChatServer, type ChatSocket } from "../types.js";

export function registerAuthHandlers(_io: ChatServer, socket: ChatSocket) {
  // TODO(R3): validate the input, then store a password hash in `users`.
  socket.on("auth:register", (_payload, ack) => ack(NOT_IMPLEMENTED));

  // TODO(R3): verify the password hash; reject a name that is already online.
  // TODO(R4): broadcast `users:list` after login and on disconnect.
  socket.on("auth:login", (_payload, ack) => ack(NOT_IMPLEMENTED));
}
