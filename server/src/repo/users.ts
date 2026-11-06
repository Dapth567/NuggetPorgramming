import { db } from "../db.js";

export interface UserRecord {
  name: string;
  passwordHash: string;
}

const UNIQUE_VIOLATION = "23505";

/** Returns false when the name is already taken; the unique constraint decides, so races are safe. */
export async function createUser(name: string, passwordHash: string): Promise<boolean> {
  const { error } = await db.from("users").insert({ name, password_hash: passwordHash });
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw new Error(error.message);
  return true;
}

export async function findUser(name: string): Promise<UserRecord | null> {
  const { data, error } = await db
    .from("users")
    .select("name, password_hash")
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { name: data.name, passwordHash: data.password_hash } : null;
}

export async function userExists(name: string): Promise<boolean> {
  return (await findUser(name)) !== null;
}
