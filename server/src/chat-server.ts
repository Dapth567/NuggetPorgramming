import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerAuthHandlers } from "./handlers/auth.js";
import { registerDmHandlers } from "./handlers/dm.js";
import { registerGroupHandlers } from "./handlers/group.js";
import { registerRoomHandlers } from "./handlers/room.js";
import type { ChatServer } from "./types.js";

export function createChatServer() {
  const httpServer = createServer();

  // WebSocket only: no HTTP long-polling, so every chat message travels over the socket (R2).
  const io: ChatServer = new Server(httpServer, { transports: ["websocket"] });

  io.on("connection", (socket) => {
    console.log(`[connect] ${socket.id} from ${socket.handshake.address}`);

    // Every client event expects a reply. Without a callback a handler would call a missing
    // ack and crash the whole server, so such events are dropped here for every handler.
    socket.use((event, next) => {
      if (typeof event[event.length - 1] === "function") next();
    });

    registerAuthHandlers(io, socket);
    registerDmHandlers(io, socket);
    registerGroupHandlers(io, socket);
    registerRoomHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`[disconnect] ${socket.id} (${reason})`);
    });
  });

  return { httpServer, io };
}
