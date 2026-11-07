import { dmRoomId } from "@chat/shared";
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

/** The two names of a well-formed DM room id, or `null`. */
function dmPeople(roomId: string): [string, string] | null {
  const [first, second, ...rest] = roomId.slice(DM_PREFIX.length).split("|");
  // A DM needs two different people, the same rule dm:send uses.
  if (!isValidName(first) || !isValidName(second) || rest.length > 0 || first === second) return null;
  return dmRoomId(first, second) === roomId ? [first, second] : null;
}

/**
 * "Is typing" is passed on and forgotten: nothing is stored, and nothing is sent back to the typist.
 * This event fires often, so access is checked without the database: a socket is in a group's
 * room only while its user is a member (joined at login, create and join; removed on delete).
 */
export function registerTypingHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("typing:set", (payload, ack) => {
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);

    const { roomId, typing } = asRecord(payload);
    if (typeof roomId !== "string" || typeof typing !== "boolean") return ack(INVALID_INPUT);
    const update = { roomId, name, typing };

    if (roomId.startsWith(GROUP_PREFIX)) {
      if (!isValidGroupId(roomId.slice(GROUP_PREFIX.length))) return ack(INVALID_INPUT);
      if (!socket.rooms.has(roomId)) return ack({ ok: false, error: "NOT_A_MEMBER" });
      // socket.to(...) reaches everyone in the room except this socket.
      socket.to(roomId).emit("typing:update", update);
      return ack({ ok: true, data: undefined });
    }

    if (roomId.startsWith(DM_PREFIX)) {
      const people = dmPeople(roomId);
      if (!people) return ack(INVALID_INPUT);
      if (!people.includes(name)) return ack({ ok: false, error: "NOT_A_MEMBER" });
      const other = people[0] === name ? people[1] : people[0];
      const receiver = state.onlineUsers.get(other);
      // An offline receiver has nothing to show, so there is no one to tell.
      if (receiver) io.to(receiver).emit("typing:update", update);
      return ack({ ok: true, data: undefined });
    }

    ack(INVALID_INPUT);
  });
}
