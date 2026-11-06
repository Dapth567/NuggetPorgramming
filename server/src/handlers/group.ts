import { NOT_IMPLEMENTED, type ChatServer, type ChatSocket } from "../types.js";

export function registerGroupHandlers(_io: ChatServer, socket: ChatSocket) {
  // TODO(R8, R9): the creator is the only initial member; broadcast `groups:list`.
  socket.on("group:create", (_payload, ack) => ack(NOT_IMPLEMENTED));

  // TODO(R10): only the requesting socket may join, via socket.join(room).
  socket.on("group:join", (_payload, ack) => ack(NOT_IMPLEMENTED));

  // TODO(R5, R11): check membership, then emit `message:new` to the group's room only.
  socket.on("group:send", (_payload, ack) => ack(NOT_IMPLEMENTED));
}
