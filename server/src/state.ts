import type { XoGame } from "@chat/shared";

// Live state only. Users, groups and messages are stored in Supabase.
export const state = {
  /** Client name -> socket id. A key here means the client is online. */
  onlineUsers: new Map<string, string>(),
  /** Open XO games by id. A game is removed as soon as it is over. */
  // shortcut: a server restart drops open games (results already posted stay), store them in Supabase if that matters.
  games: new Map<string, XoGame>(),
};
