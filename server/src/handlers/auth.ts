import { groupRoomId } from "@chat/shared";
import { sendGroupsList, sendUsersList } from "../broadcast.js";
import { hashPassword, verifyPassword } from "../password.js";
import { createUser, findUser } from "../repo/users.js";
import { groupsOf } from "../repo/groups.js";
import { state } from "../state.js";
import type { ChatServer, ChatSocket } from "../types.js";
import { asRecord, INVALID_INPUT, isValidName, isValidPassword } from "../validate.js";

export function registerAuthHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("auth:register", async (payload, ack) => {
    const { name, password } = asRecord(payload);
    if (!isValidName(name) || !isValidPassword(password)) return ack(INVALID_INPUT);

    try {
      const created = await createUser(name, await hashPassword(password));
      ack(created ? { ok: true, data: undefined } : { ok: false, error: "NAME_TAKEN" });
    } catch (error) {
      console.error("[auth:register]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });

  socket.on("auth:login", async (payload, ack) => {
    const { name, password } = asRecord(payload);
    if (!isValidName(name) || typeof password !== "string") return ack(INVALID_INPUT);
    if (socket.data.name) return ack({ ok: false, error: "ALREADY_ONLINE" });

    try {
      const user = await findUser(name);
      // A missing name and a wrong password get the same answer on purpose.
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return ack({ ok: false, error: "WRONG_CREDENTIALS" });
      }

      const groupIds = await groupsOf(name);

      // No await between this check and the set, so two logins cannot both pass.
      if (state.onlineUsers.has(name) || socket.data.name) {
        return ack({ ok: false, error: "ALREADY_ONLINE" });
      }
      state.onlineUsers.set(name, socket.id);
      socket.data.name = name;
      for (const id of groupIds) socket.join(groupRoomId(id));

      ack({ ok: true, data: { name } });
      sendUsersList(io);
      await sendGroupsList(socket);
    } catch (error) {
      console.error("[auth:login]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });

  socket.on("disconnect", () => {
    const { name } = socket.data;
    if (!name || state.onlineUsers.get(name) !== socket.id) return;
    state.onlineUsers.delete(name);
    sendUsersList(io);
  });
}
