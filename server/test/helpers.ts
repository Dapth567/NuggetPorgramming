import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chat/shared";
import { createChatServer } from "../src/chat-server.js";

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

/** Register and log in a new user; resolves to the client and the first `users:list` it received. */
export async function loginNewUser(url: string, name = randomName()) {
  const client = await connectClient(url);
  const firstUsers = new Promise<string[]>((resolve) => client.once("users:list", resolve));
  const registered = await client.emitWithAck("auth:register", { name, password: PASSWORD });
  if (!registered.ok) throw new Error(`register failed: ${registered.error}`);
  const login = await client.emitWithAck("auth:login", { name, password: PASSWORD });
  if (!login.ok) throw new Error(`login failed: ${login.error}`);
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
