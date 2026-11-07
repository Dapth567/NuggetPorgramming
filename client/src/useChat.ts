import { useCallback, useEffect, useState } from "react";
import {
  dmRoomId,
  groupRoomId,
  type Ack,
  type ChatMessage,
  type ErrorCode,
  type GroupInfo,
} from "@chat/shared";
import { PREVIEW_GROUPS, PREVIEW_ME, PREVIEW_MESSAGES, PREVIEW_USERS } from "./preview";
import { socket } from "./socket";

/** `null` means success; otherwise the error code from the server. */
export type Result = ErrorCode | null;

const toResult = (res: Ack<unknown>): Result => (res.ok ? null : res.error);

/** Adds or replaces one group, so a group from an ack shows before the next `groups:list`. */
const withGroup = (groups: GroupInfo[], group: GroupInfo) =>
  groups.some((g) => g.id === group.id)
    ? groups.map((g) => (g.id === group.id ? group : g))
    : [...groups, group];

/**
 * The only place that talks to the socket. Components read state and call these functions.
 * Messages are shown from `message:new` only, never added from an ack.
 */
export function useChat(preview = false) {
  const [connected, setConnected] = useState(socket.connected);
  const [me, setMe] = useState<string | null>(preview ? PREVIEW_ME : null);
  const [users, setUsers] = useState<string[]>(preview ? PREVIEW_USERS : []);
  const [groups, setGroups] = useState<GroupInfo[]>(preview ? PREVIEW_GROUPS : []);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>(
    preview ? PREVIEW_MESSAGES : {},
  );

  const addMessage = useCallback((m: ChatMessage) => {
    setMessagesByRoom((prev) => {
      const list = prev[m.roomId] ?? [];
      return list.some((x) => x.id === m.id) ? prev : { ...prev, [m.roomId]: [...list, m] };
    });
  }, []);

  const reset = useCallback(() => {
    setMe(null);
    setUsers([]);
    setGroups([]);
    setMessagesByRoom({});
  }, []);

  // Listeners go in before login, or the first `users:list` and `groups:list` would be missed.
  useEffect(() => {
    if (preview) return;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      reset();
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("users:list", setUsers);
    socket.on("groups:list", setGroups);
    socket.on("message:new", addMessage);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("users:list", setUsers);
      socket.off("groups:list", setGroups);
      socket.off("message:new", addMessage);
    };
  }, [preview, addMessage, reset]);

  const register = useCallback(
    async (name: string, password: string): Promise<Result> =>
      toResult(await socket.emitWithAck("auth:register", { name, password })),
    [],
  );

  const login = useCallback(async (name: string, password: string): Promise<Result> => {
    const res = await socket.emitWithAck("auth:login", { name, password });
    if (res.ok) setMe(res.data.name);
    return toResult(res);
  }, []);

  const logout = useCallback(() => {
    if (preview) return;
    // Dropping the connection is what makes the server mark this user offline.
    socket.disconnect();
    reset();
    socket.connect();
  }, [preview, reset]);

  const openRoom = useCallback(
    async (roomId: string): Promise<Result> => {
      if (preview) return null;
      const res = await socket.emitWithAck("room:history", { roomId });
      if (res.ok) {
        // Keep anything `message:new` delivered while the history was loading.
        setMessagesByRoom((prev) => {
          const loaded = new Set(res.data.map((m) => m.id));
          const newer = (prev[roomId] ?? []).filter((m) => !loaded.has(m.id));
          return { ...prev, [roomId]: [...res.data, ...newer] };
        });
      }
      return toResult(res);
    },
    [preview],
  );

  const send = useCallback(
    async (roomId: string, emit: () => Promise<Ack<ChatMessage>>, text: string): Promise<Result> => {
      if (preview) {
        addMessage({ id: String(Date.now()), roomId, sender: PREVIEW_ME, text, sentAt: new Date().toISOString() });
        return null;
      }
      return toResult(await emit());
    },
    [preview, addMessage],
  );

  const sendDm = useCallback(
    (to: string, text: string) =>
      send(dmRoomId(me ?? "", to), () => socket.emitWithAck("dm:send", { to, text }), text),
    [me, send],
  );

  const sendGroup = useCallback(
    (groupId: string, text: string) =>
      send(groupRoomId(groupId), () => socket.emitWithAck("group:send", { groupId, text }), text),
    [send],
  );

  /** Resolves to the new group's id, or the error code. */
  const createGroup = useCallback(
    async (name: string): Promise<{ groupId: string } | { error: ErrorCode }> => {
      if (preview) return { error: "NOT_IMPLEMENTED" };
      const res = await socket.emitWithAck("group:create", { name });
      if (!res.ok) return { error: res.error };
      setGroups((prev) => withGroup(prev, res.data));
      return { groupId: res.data.id };
    },
    [preview],
  );

  const joinGroup = useCallback(
    async (groupId: string): Promise<Result> => {
      if (preview) return null;
      const res = await socket.emitWithAck("group:join", { groupId });
      if (res.ok) setGroups((prev) => withGroup(prev, res.data));
      return toResult(res);
    },
    [preview],
  );

  return {
    connected: preview || connected,
    me,
    users,
    groups,
    messagesByRoom,
    register,
    login,
    logout,
    openRoom,
    sendDm,
    sendGroup,
    createGroup,
    joinGroup,
  };
}

export type ChatApi = ReturnType<typeof useChat>;
