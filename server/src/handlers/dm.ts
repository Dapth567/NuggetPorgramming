import { notImplemented, type ChatServer, type ChatSocket } from "../types.js";

export function registerDmHandlers(_io: ChatServer, socket: ChatSocket) {
  // TODO(R5, R7): save the message, then emit `message:new` to the sender and receiver only.
  socket.on("dm:send", (_payload, ack) => ack(notImplemented("R7")));
}
