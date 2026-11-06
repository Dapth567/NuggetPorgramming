// Live connections only. Users, groups and messages are stored in Supabase.
export const state = {
  /** Client name -> socket id. A key here means the client is online. */
  onlineUsers: new Map<string, string>(),
};
