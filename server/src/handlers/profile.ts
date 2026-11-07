import { sendAvatarUpdate } from "../broadcast.js";
import { setAvatar } from "../repo/users.js";
import type { ChatServer, ChatSocket } from "../types.js";
import { asRecord, INVALID_INPUT, isValidAvatar, NOT_LOGGED_IN, requireLogin } from "../validate.js";

export function registerProfileHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("profile:avatar", async (payload, ack) => {
    // The photo always belongs to the logged-in user: no payload field can name someone else.
    const name = requireLogin(socket);
    if (!name) return ack(NOT_LOGGED_IN);

    const { image } = asRecord(payload);
    if (image !== null && !isValidAvatar(image)) return ack(INVALID_INPUT);

    try {
      await setAvatar(name, image);
      sendAvatarUpdate(io, name, image);
      ack({ ok: true, data: undefined });
    } catch (error) {
      console.error("[profile:avatar]", error);
      ack({ ok: false, error: "SERVER_ERROR" });
    }
  });
}
