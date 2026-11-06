import { groupRoomId } from "@chat/shared";
import { findGroup, isMember } from "../repo/groups.js";
import { saveMessage } from "../repo/messages.js";
import { NOT_IMPLEMENTED, type ChatServer, type ChatSocket } from "../types.js";
import {
  asRecord,
  INVALID_INPUT,
  isValidGroupId,
  isValidText,
  NOT_LOGGED_IN,
  requireLogin,
} from "../validate.js";

export function registerGroupHandlers(io: ChatServer, socket: ChatSocket) {
  // TODO(R8, R9): the creator is the only initial member; broadcast `groups:list`.
  socket.on("group:create", (_payload, ack) => ack(NOT_IMPLEMENTED));

  // TODO(R10): only the requesting socket may join, via socket.join(room).
  socket.on("group:join", (_payload, ack) => ack(NOT_IMPLEMENTED));

  socket.on("group:send", async (payload, ack) => {
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);

    const { groupId, text } = asRecord(payload);
    if (!isValidGroupId(groupId) || !isValidText(text)) return ack(INVALID_INPUT);

    try {
      if (!(await findGroup(groupId))) return ack({ ok: false, error: "GROUP_NOT_FOUND" });
      if (!(await isMember(groupId, name))) return ack({ ok: false, error: "NOT_A_MEMBER" });

      const roomId = groupRoomId(groupId);
      const message = await saveMessage(roomId, name, text);

      // Members' sockets joined this room at login, so outsiders never receive it (R11).
      io.to(roomId).emit("message:new", message);

      ack({ ok: true, data: message });
    } catch (error) {
      console.error("[group:send]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });
}
