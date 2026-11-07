import { dmRoomId, groupRoomId, type ChatMessage, type GroupInfo } from "@chat/shared";

// Sample data for `?preview`, so the chat screen can be viewed without a server.
export const PREVIEW_ME = "you";

export const PREVIEW_USERS = [PREVIEW_ME, "alice", "bob"];

export const PREVIEW_GROUPS: GroupInfo[] = [
  { id: "g1", name: "Study group", createdBy: PREVIEW_ME, members: ["alice", PREVIEW_ME, "bob"] },
];

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();
const dm = dmRoomId(PREVIEW_ME, "alice");
const group = groupRoomId("g1");

export const PREVIEW_MESSAGES: Record<string, ChatMessage[]> = {
  [dm]: [
    { id: "1", roomId: dm, sender: "alice", text: "Hi! How is the project going?", sentAt: at(9) },
    { id: "2", roomId: dm, sender: PREVIEW_ME, text: "The UI is done, I just need to connect the server", sentAt: at(7) },
    { id: "3", roomId: dm, sender: "alice", text: "Great!", sentAt: at(5) },
  ],
  [group]: [
    { id: "4", roomId: group, sender: "bob", text: "What time is the presentation rehearsal tomorrow?", sentAt: at(3) },
    { id: "5", roomId: group, sender: PREVIEW_ME, text: "2 PM", sentAt: at(2) },
  ],
};

/** Who is shown typing, by room, so the indicator can be seen without a server. */
export const PREVIEW_TYPING: Record<string, string[]> = {
  [dm]: ["alice"],
  [group]: ["alice", "bob"],
};
