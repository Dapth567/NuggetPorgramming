import { groupRoomId } from "@chat/shared";
import { sendGroupsList } from "../broadcast.js";
import { addMember, findGroup, isMember } from "../repo/groups.js";
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

  socket.on("group:join", async (payload, ack) => {
    // The new member is always the logged-in user: no payload field can name someone else (R10).
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);

    const { groupId } = asRecord(payload);
    if (!isValidGroupId(groupId)) return ack(INVALID_INPUT);

    try {
      const group = await findGroup(groupId);
      if (!group) return ack({ ok: false, error: "GROUP_NOT_FOUND" });
      if (group.members.includes(name)) return ack({ ok: false, error: "ALREADY_A_MEMBER" });

      try {
        await addMember(groupId, name);
      } catch (error) {
        // Two joins at once: the primary key lets one through, the other is already a member.
        if (await isMember(groupId, name)) return ack({ ok: false, error: "ALREADY_A_MEMBER" });
        throw error;
      }

      // From now on this socket receives the group's `message:new` (R11).
      socket.join(groupRoomId(groupId));

      ack({ ok: true, data: { ...group, members: [...group.members, name] } });
    } catch (error) {
      console.error("[group:join]", error);
      return ack({ ok: false, error: "SERVER_ERROR" });
    }

    // Everyone sees the new member list (R9). The join already succeeded, so a failure here is only logged.
    sendGroupsList(io).catch((error) => console.error("[group:join] groups:list", error));
  });

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
