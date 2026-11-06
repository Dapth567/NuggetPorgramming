import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerAuthHandlers } from "./handlers/auth.js";
import { registerDmHandlers } from "./handlers/dm.js";
import { registerGroupHandlers } from "./handlers/group.js";
import type { ChatServer } from "./types.js";

export function createChatServer() {
  const httpServer = createServer();

  // WebSocket only: no HTTP long-polling, so every chat message travels over the socket (R2).
  const io: ChatServer = new Server(httpServer, { transports: ["websocket"] });

  io.on("connection", (socket) => {
    console.log(`[connect] ${socket.id} from ${socket.handshake.address}`);

    registerAuthHandlers(io, socket);
    registerDmHandlers(io, socket);
    registerGroupHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`[disconnect] ${socket.id} (${reason})`);
    });
  });

  return { httpServer, io };
}
