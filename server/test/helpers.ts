import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { io as connect, type Socket } from "socket.io-client";
import type { ChatMessage, ClientToServerEvents, GroupInfo, ServerToClientEvents } from "@chat/shared";
import { createChatServer } from "../src/chat-server.js";
import { db } from "../src/db.js";

export type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function startServer() {
  const { httpServer, io } = createChatServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  return { url, io, close: () => io.close() };
}

export async function connectClient(url: string): Promise<TestClient> {
  const client: TestClient = connect(url, { transports: ["websocket"], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}

/** A name that has never been registered, so tests do not collide with old rows. */
export function randomName(prefix = "t"): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export const PASSWORD = "secret123";

/** Register a new user without logging in, for tests that must prepare data before login. */
export async function registerNewUser(url: string, name = randomName()) {
  const client = await connectClient(url);
  const registered = await client.emitWithAck("auth:register", { name, password: PASSWORD });
  if (!registered.ok) throw new Error(`register failed: ${registered.error}`);
  return { client, name };
}

export async function login(client: TestClient, name: string) {
  const res = await client.emitWithAck("auth:login", { name, password: PASSWORD });
  if (!res.ok) throw new Error(`login failed: ${res.error}`);
}

/** Register and log in a new user; resolves to the client and the first `users:list` it received. */
export async function loginNewUser(url: string, name = randomName()) {
  const client = await connectClient(url);
  const firstUsers = new Promise<string[]>((resolve) => client.once("users:list", resolve));
  const registered = await client.emitWithAck("auth:register", { name, password: PASSWORD });
  if (!registered.ok) throw new Error(`register failed: ${registered.error}`);
  await login(client, name);
  return { client, name, firstUsers: await firstUsers };
}

/** Wait for the next `users:list` that satisfies `predicate`. */
export function nextUsersList(client: TestClient, predicate: (names: string[]) => boolean) {
  return new Promise<string[]>((resolve) => {
    const onList = (names: string[]) => {
      if (!predicate(names)) return;
      client.off("users:list", onList);
      resolve(names);
    };
    client.on("users:list", onList);
  });
}

/** Wait for the next `groups:list` with a group that satisfies `predicate`; resolves to that group. */
export function nextGroup(client: TestClient, predicate: (group: GroupInfo) => boolean) {
  return new Promise<GroupInfo>((resolve) => {
    const onList = (groups: GroupInfo[]) => {
      const group = groups.find(predicate);
      if (!group) return;
      client.off("groups:list", onList);
      resolve(group);
    };
    client.on("groups:list", onList);
  });
}

export function nextMessage(client: TestClient) {
  return new Promise<ChatMessage>((resolve) => client.once("message:new", resolve));
}

/** Collect every `message:new`, to prove a client received nothing. */
export function recordMessages(client: TestClient) {
  const received: ChatMessage[] = [];
  client.on("message:new", (message) => received.push(message));
  return received;
}

/** Long enough for a wrongly routed `message:new` to arrive. */
export const waitForStrayMessages = () => delay(200);

/** Tests use the real database, so remove their rows or they appear in the real app. */
export async function deleteTestData(names: string[], groupIds: string[] = []) {
  const steps = [
    db.from("messages").delete().in("sender", names),
    db.from("groups").delete().in("id", groupIds),
    db.from("group_members").delete().in("user_name", names),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw new Error(error.message);
  }
  const { error } = await db.from("users").delete().in("name", names);
  if (error) throw new Error(error.message);
}
