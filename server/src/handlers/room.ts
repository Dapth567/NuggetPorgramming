import { dmRoomId, LIMITS, type Ack, type ChatMessage } from "@chat/shared";
import { findGroup, isMember } from "../repo/groups.js";
import { deleteOwnMessage, roomHistory } from "../repo/messages.js";
import { state } from "../state.js";
import type { ChatServer, ChatSocket } from "../types.js";
import {
  asRecord,
  INVALID_INPUT,
  isValidGroupId,
  isValidName,
  NOT_LOGGED_IN,
  requireLogin,
} from "../validate.js";

const DM_PREFIX = "dm:";
const GROUP_PREFIX = "group:";

/** Returns the reason this user may not read the room, or `null` when access is allowed. */
async function denyRoomAccess(name: string, roomId: string): Promise<Ack<never> | null> {
  if (roomId.startsWith(DM_PREFIX)) {
    const [first, second, ...rest] = roomId.slice(DM_PREFIX.length).split("|");
    const wellFormed =
      isValidName(first) &&
      isValidName(second) &&
      rest.length === 0 &&
      dmRoomId(first, second) === roomId;
    if (!wellFormed) return INVALID_INPUT;
    return first === name || second === name ? null : { ok: false, error: "NOT_A_MEMBER" };
  }

  if (roomId.startsWith(GROUP_PREFIX)) {
    const groupId = roomId.slice(GROUP_PREFIX.length);
    if (!isValidGroupId(groupId)) return INVALID_INPUT;
    if (!(await findGroup(groupId))) return { ok: false, error: "GROUP_NOT_FOUND" };
    return (await isMember(groupId, name)) ? null : { ok: false, error: "NOT_A_MEMBER" };
  }

  return INVALID_INPUT;
}

export function registerRoomHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("message:delete", async (payload, ack) => {
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);
    const { messageId } = asRecord(payload);
    if (!isValidGroupId(messageId)) return ack(INVALID_INPUT);
    try {
      const roomId = await deleteOwnMessage(messageId, name);
      if (!roomId) return ack({ ok: false, error: "MESSAGE_NOT_FOUND" });
      const notification = { messageId, roomId };
      if (roomId.startsWith(GROUP_PREFIX)) {
        io.to(roomId).emit("message:deleted", notification);
      } else {
        const ids = roomId.slice(DM_PREFIX.length).split("|")
          .map((participant) => state.onlineUsers.get(participant))
          .filter((id): id is string => id !== undefined);
        if (ids.length) io.to(ids).emit("message:deleted", notification);
      }
      ack({ ok: true, data: undefined });
    } catch (error) {
      console.error("[message:delete]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });

  socket.on("room:history", async (payload, ack: (res: Ack<ChatMessage[]>) => void) => {
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);

    const { roomId } = asRecord(payload);
    if (typeof roomId !== "string") return ack(INVALID_INPUT);

    try {
      const denied = await denyRoomAccess(name, roomId);
      if (denied) return ack(denied);
      ack({ ok: true, data: await roomHistory(roomId, LIMITS.historyMaxMessages) });
    } catch (error) {
      console.error("[room:history]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });
}
