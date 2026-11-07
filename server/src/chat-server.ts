import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerAuthHandlers } from "./handlers/auth.js";
import { registerDmHandlers } from "./handlers/dm.js";
import { registerGameHandlers } from "./handlers/game.js";
import { registerGroupHandlers } from "./handlers/group.js";
import { registerProfileHandlers } from "./handlers/profile.js";
import { registerRoomHandlers } from "./handlers/room.js";
import { registerTypingHandlers } from "./handlers/typing.js";
import type { ChatServer } from "./types.js";

export function createChatServer() {
  const httpServer = createServer();

  // WebSocket only: no HTTP long-polling, so every chat message travels over the socket (R2).
  const io: ChatServer = new Server(httpServer, { transports: ["websocket"] });

  io.on("connection", (socket) => {
    console.log(`[connect] ${socket.id} from ${socket.handshake.address}`);

    // Every client event is (payload, ack). Any other shape would make a handler call a missing
    // ack and crash the whole server, so it is dropped here for every handler.
    socket.use((event, next) => {
      if (event.length === 3 && typeof event[2] === "function") next();
    });

    registerAuthHandlers(io, socket);
    registerDmHandlers(io, socket);
    registerGroupHandlers(io, socket);
    registerProfileHandlers(io, socket);
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerTypingHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`[disconnect] ${socket.id} (${reason})`);
    });
  });

  return { httpServer, io };
}
