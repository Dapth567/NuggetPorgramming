import type { GroupInfo } from "@chat/shared";
import { db } from "../db.js";

/** Every group with its member names. */
export async function listGroups(): Promise<GroupInfo[]> {
  const [groups, members] = await Promise.all([
    db.from("groups").select("id, name, created_by").order("created_at"),
    db.from("group_members").select("group_id, user_name").order("joined_at"),
  ]);
  if (groups.error) throw new Error(groups.error.message);
  if (members.error) throw new Error(members.error.message);

  const byGroup = new Map<string, string[]>();
  for (const row of members.data) {
    const key = String(row.group_id);
    byGroup.set(key, [...(byGroup.get(key) ?? []), row.user_name]);
  }
  return groups.data.map((g) => ({
    id: String(g.id),
    name: g.name,
    createdBy: g.created_by,
    members: byGroup.get(String(g.id)) ?? [],
  }));
}

/** Ids of the groups this user belongs to. */
export async function groupsOf(name: string): Promise<string[]> {
  const { data, error } = await db.from("group_members").select("group_id").eq("user_name", name);
  if (error) throw new Error(error.message);
  return data.map((row) => String(row.group_id));
}
