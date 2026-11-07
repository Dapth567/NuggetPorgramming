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

/** Creates a group whose only member is its creator (R8). */
export async function createGroup(name: string, createdBy: string): Promise<GroupInfo> {
  const { data, error } = await db
    .from("groups")
    .insert({ name, created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const id = String(data.id);
  try {
    await addMember(id, createdBy);
  } catch (error) {
    // The REST API has no transactions, so undo the group rather than leave it with no members.
    // supabase-js returns errors instead of throwing, so a failed undo must be logged here.
    const undo = await db.from("groups").delete().eq("id", id);
    if (undo.error) console.error(`[createGroup] group ${id} has no members:`, undo.error.message);
    throw error;
  }
  return { id, name, createdBy, members: [createdBy] };
}

export async function findGroup(id: string): Promise<GroupInfo | null> {
  const [group, members] = await Promise.all([
    db.from("groups").select("id, name, created_by").eq("id", id).maybeSingle(),
    db.from("group_members").select("user_name").eq("group_id", id).order("joined_at"),
  ]);
  if (group.error) throw new Error(group.error.message);
  if (members.error) throw new Error(members.error.message);
  if (!group.data) return null;

  return {
    id: String(group.data.id),
    name: group.data.name,
    createdBy: group.data.created_by,
    members: members.data.map((row) => row.user_name),
  };
}

export async function addMember(groupId: string, name: string): Promise<void> {
  const { error } = await db.from("group_members").insert({ group_id: groupId, user_name: name });
  if (error) throw new Error(error.message);
}

export async function isMember(groupId: string, name: string): Promise<boolean> {
  const { data, error } = await db
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

/** Ids of the groups this user belongs to. */
export async function groupsOf(name: string): Promise<string[]> {
  const { data, error } = await db.from("group_members").select("group_id").eq("user_name", name);
  if (error) throw new Error(error.message);
  return data.map((row) => String(row.group_id));
}
