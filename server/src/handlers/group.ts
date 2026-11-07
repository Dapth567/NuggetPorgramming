import { groupRoomId } from "@chat/shared";
import { sendGroupsList } from "../broadcast.js";
import { addMember, createGroup, deleteGroup, findGroup, isMember } from "../repo/groups.js";
import { saveMessage } from "../repo/messages.js";
import { state } from "../state.js";
import type { ChatServer, ChatSocket } from "../types.js";
import {
  asRecord,
  INVALID_INPUT,
  isValidGroupId,
  isValidGroupName,
  isValidText,
  NOT_LOGGED_IN,
  requireLogin,
} from "../validate.js";

export function registerGroupHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("group:delete", async (payload, ack) => {
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);
    const { groupId } = asRecord(payload);
    if (!isValidGroupId(groupId)) return ack(INVALID_INPUT);
    try {
      const result = await deleteGroup(groupId, name);
      if (result === "not_found") return ack({ ok: false, error: "GROUP_NOT_FOUND" });
      if (result === "forbidden") return ack({ ok: false, error: "FORBIDDEN" });
      const ids = [...state.onlineUsers.values()];
      if (ids.length) io.to(ids).emit("group:deleted", { groupId });
      io.in(groupRoomId(groupId)).socketsLeave(groupRoomId(groupId));
      ack({ ok: true, data: undefined });
    } catch (error) {
      console.error("[group:delete]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });

  socket.on("group:create", async (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);

    // Only `name` is read, so nobody else can be added when the group is created (R8).
    const { name } = asRecord(payload);
    const groupName = typeof name === "string" ? name.trim() : name;
    if (!isValidGroupName(groupName)) return ack(INVALID_INPUT);

    try {
      const group = await createGroup(groupName, me);
      // Login only joins rooms that already exist, so join the new one now (R11).
      socket.join(groupRoomId(group.id));
      ack({ ok: true, data: group });
    } catch (error) {
      console.error("[group:create]", error);
      return ack({ ok: false, error: "SERVER_ERROR" });
    }

    // Everyone sees every group, even ones they are not in (R9). The group exists already, so a failure here is only logged.
    sendGroupsList(io).catch((error) => console.error("[group:create] groups:list", error));
  });

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
