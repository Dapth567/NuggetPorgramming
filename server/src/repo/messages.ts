import type { ChatMessage } from "@chat/shared";
import { db } from "../db.js";

const COLUMNS = "id, room_id, sender, text, sent_at";

interface MessageRow {
  id: string;
  room_id: string;
  sender: string;
  text: string;
  sent_at: string;
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    sender: row.sender,
    text: row.text,
    sentAt: new Date(row.sent_at).toISOString(),
  };
}

export async function saveMessage(
  roomId: string,
  sender: string,
  text: string,
): Promise<ChatMessage> {
  const { data, error } = await db
    .from("messages")
    .insert({ room_id: roomId, sender, text })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toMessage(data);
}

/** The latest `limit` messages of a room, oldest first. */
export async function roomHistory(roomId: string, limit: number): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select(COLUMNS)
    .eq("room_id", roomId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data.map(toMessage).reverse();
}
