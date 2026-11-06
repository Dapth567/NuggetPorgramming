import { notImplemented, type ChatServer, type ChatSocket } from "../types.js";

export function registerGroupHandlers(_io: ChatServer, socket: ChatSocket) {
  // TODO(R8, R9): the creator is the only initial member; broadcast `groups:list`.
  socket.on("group:create", (_payload, ack) => ack(notImplemented("R8")));

  // TODO(R10): only the requesting socket may join, via socket.join(room).
  socket.on("group:join", (_payload, ack) => ack(notImplemented("R10")));

  // TODO(R5, R11): check membership, then emit `message:new` to the group's room only.
  socket.on("group:send", (_payload, ack) => ack(notImplemented("R11")));
}
