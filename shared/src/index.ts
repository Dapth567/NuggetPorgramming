// The wire contract between client and server.
// This package is types only: import it with `import type`.

export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: string };

export interface ChatMessage {
  id: string;
  /** `dm:<nameA>|<nameB>` (names sorted) or `group:<groupId>` */
  roomId: string;
  sender: string;
  text: string;
  /** ISO 8601 timestamp, set by the server */
  sentAt: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
}

export interface ClientToServerEvents {
  "auth:login": (
    payload: { name: string; password: string },
    ack: (res: Ack<{ name: string }>) => void,
  ) => void;
  "dm:send": (payload: { to: string; text: string }, ack: (res: Ack<ChatMessage>) => void) => void;
  "group:create": (payload: { name: string }, ack: (res: Ack<GroupInfo>) => void) => void;
  "group:join": (payload: { groupId: string }, ack: (res: Ack<GroupInfo>) => void) => void;
  "group:send": (
    payload: { groupId: string; text: string },
    ack: (res: Ack<ChatMessage>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "users:list": (names: string[]) => void;
  "groups:list": (groups: GroupInfo[]) => void;
  "message:new": (message: ChatMessage) => void;
}
