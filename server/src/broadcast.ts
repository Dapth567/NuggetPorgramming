import { AI_NAME } from "@chat/shared";
import { listGroups } from "./repo/groups.js";
import { listAvatars, listUserNames } from "./repo/users.js";
import { state } from "./state.js";
import type { ChatServer, ChatSocket } from "./types.js";

/** Send the full online list to every logged-in client (R4). */
export function sendUsersList(io: ChatServer) {
  const socketIds = [...state.onlineUsers.values()];
  // io.to([]) would reach every socket, including ones that have not logged in.
  if (socketIds.length === 0) return;
  io.to(socketIds).emit("users:list", [...state.onlineUsers.keys()].sort());
}

/**
 * Send every registered user, so React can show who is offline and DM them too: pass a socket for
 * one client that has just logged in, or `io` for all logged-in clients after someone registers.
 */
export async function sendAllUsers(target: ChatServer | ChatSocket) {
  // The AI has its own place in the sidebar; it is never a friend who is "offline".
  const names = (await listUserNames()).filter((name) => name !== AI_NAME);
  if ("sockets" in target) {
    const socketIds = [...state.onlineUsers.values()];
    if (socketIds.length > 0) target.to(socketIds).emit("users:all", names);
  } else {
    target.emit("users:all", names);
  }
}

/** Send every profile photo to one client that has just logged in. */
export async function sendAvatarsList(socket: ChatSocket) {
  socket.emit("avatars:list", await listAvatars());
}

/** Tell every logged-in client that one photo changed; a photo is too big to resend all of them. */
export function sendAvatarUpdate(io: ChatServer, name: string, image: string | null) {
  const socketIds = [...state.onlineUsers.values()];
  if (socketIds.length > 0) io.to(socketIds).emit("avatar:updated", { name, image });
}

/** Send every group with its members: pass a socket for one client, or `io` for all logged-in clients (R9). */
export async function sendGroupsList(target: ChatServer | ChatSocket) {
  const groups = await listGroups();
  if ("sockets" in target) {
    const socketIds = [...state.onlineUsers.values()];
    if (socketIds.length > 0) target.to(socketIds).emit("groups:list", groups);
  } else {
    target.emit("groups:list", groups);
  }
}
