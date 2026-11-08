import { AI_NAME, dmRoomId } from "@chat/shared";
import { answerInRoom } from "../ai.js";
import { saveMessage } from "../repo/messages.js";
import { userExists } from "../repo/users.js";
import { state } from "../state.js";
import type { ChatServer, ChatSocket } from "../types.js";
import {
  asRecord,
  INVALID_INPUT,
  isValidName,
  isValidText,
  NOT_LOGGED_IN,
  requireLogin,
} from "../validate.js";

export function registerDmHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("dm:send", async (payload, ack) => {
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);

    const { to, text } = asRecord(payload);
    // A DM needs two people; the online list does not let you open a chat with yourself either.
    if (!isValidName(to) || to === name || !isValidText(text)) return ack(INVALID_INPUT);

    try {
      if (to === AI_NAME) {
        // A DM with the AI: only the asker sees the question and the answer (Special Point).
        const roomId = dmRoomId(name, AI_NAME);
        const message = await saveMessage(roomId, name, text);
        socket.emit("message:new", message);
        ack({ ok: true, data: message });
        return void answerInRoom(io, roomId, { user: name });
      }

      if (!(await userExists(to))) return ack({ ok: false, error: "USER_NOT_FOUND" });

      const message = await saveMessage(dmRoomId(name, to), name, text);

      // Only these two sockets get it (R7). An offline receiver reads it from history later.
      const receiver = state.onlineUsers.get(to);
      io.to(receiver ? [socket.id, receiver] : socket.id).emit("message:new", message);

      ack({ ok: true, data: message });
    } catch (error) {
      console.error("[dm:send]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });
}
