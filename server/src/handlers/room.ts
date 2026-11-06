import { NOT_IMPLEMENTED, type ChatServer, type ChatSocket } from "../types.js";

export function registerRoomHandlers(_io: ChatServer, socket: ChatSocket) {
  // TODO(R5, R7, R11): return history only to DM participants or group members.
  socket.on("room:history", (_payload, ack) => ack(NOT_IMPLEMENTED));
}
