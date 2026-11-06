import { listGroups } from "./repo/groups.js";
import { state } from "./state.js";
import type { ChatServer, ChatSocket } from "./types.js";

/** Send the full online list to every logged-in client (R4). */
export function sendUsersList(io: ChatServer) {
  const socketIds = [...state.onlineUsers.values()];
  // io.to([]) would reach every socket, including ones that have not logged in.
  if (socketIds.length === 0) return;
  io.to(socketIds).emit("users:list", [...state.onlineUsers.keys()].sort());
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
