// The wire contract between client and server, documented in docs/API.md.
// Change this file and that document together.

export const LIMITS = {
  nameMaxLength: 20,
  passwordMinLength: 6,
  groupNameMaxLength: 50,
  textMaxLength: 2000,
  historyMaxMessages: 100,
  /** Width and height of a profile photo in pixels; React resizes before sending. */
  avatarSize: 96,
  /** Length of the data URL. Must match the check in supabase/avatars.sql. */
  avatarMaxLength: 20_000,
} as const;

/** Letters, marks, digits and `_`. Thai is allowed; `|` is not, because it separates DM names. */
export const NAME_PATTERN = /^[\p{L}\p{M}\p{N}_]+$/u;

export function dmRoomId(nameA: string, nameB: string): string {
  return `dm:${[nameA, nameB].sort().join("|")}`;
}

export function groupRoomId(groupId: string): string {
  return `group:${groupId}`;
}

export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_LOGGED_IN"
  | "NAME_TAKEN"
  | "WRONG_CREDENTIALS"
  | "ALREADY_ONLINE"
  | "USER_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "NOT_A_MEMBER"
  | "ALREADY_A_MEMBER"
  | "FORBIDDEN"
  | "MESSAGE_NOT_FOUND"
  | "SERVER_ERROR"
  | "NOT_IMPLEMENTED";

export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: ErrorCode };

type Reply<T> = (res: Ack<T>) => void;

export interface ChatMessage {
  id: string;
  /** Build with `dmRoomId` or `groupRoomId`. */
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

export interface UserAvatar {
  name: string;
  /** A `data:image/...;base64,` URL */
  image: string;
}

export interface ClientToServerEvents {
  "auth:register": (payload: { name: string; password: string }, ack: Reply<void>) => void;
  "auth:login": (payload: { name: string; password: string }, ack: Reply<{ name: string }>) => void;
  "room:history": (payload: { roomId: string }, ack: Reply<ChatMessage[]>) => void;
  "dm:send": (payload: { to: string; text: string }, ack: Reply<ChatMessage>) => void;
  "group:create": (payload: { name: string }, ack: Reply<GroupInfo>) => void;
  "group:join": (payload: { groupId: string }, ack: Reply<GroupInfo>) => void;
  "group:send": (payload: { groupId: string; text: string }, ack: Reply<ChatMessage>) => void;
  "group:delete": (payload: { groupId: string }, ack: Reply<void>) => void;
  "message:delete": (payload: { messageId: string }, ack: Reply<void>) => void;
  /** `null` removes the photo. */
  "profile:avatar": (payload: { image: string | null }, ack: Reply<void>) => void;
  /** Tell the others in a room that you started or stopped typing. Nothing is stored. */
  "typing:set": (payload: { roomId: string; typing: boolean }, ack: Reply<void>) => void;
}

export interface TypingUpdate {
  roomId: string;
  name: string;
  typing: boolean;
}

export interface ServerToClientEvents {
  "users:list": (names: string[]) => void;
  "groups:list": (groups: GroupInfo[]) => void;
  "message:new": (message: ChatMessage) => void;
  "message:deleted": (payload: { messageId: string; roomId: string }) => void;
  "group:deleted": (payload: { groupId: string }) => void;
  "avatars:list": (avatars: UserAvatar[]) => void;
  "avatar:updated": (avatar: { name: string; image: string | null }) => void;
  "typing:update": (update: TypingUpdate) => void;
}
