import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chat/shared";
import { createChatServer } from "../src/chat-server.js";

const { httpServer, io } = createChatServer();
let url: string;

before(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

after(() => io.close());

test("a client connects over WebSocket", async () => {
  const client = connect(url, { transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  assert.equal(client.io.engine.transport.name, "websocket");
  client.close();
});

test("HTTP long-polling is refused, so chat cannot bypass the socket", async () => {
  const client = connect(url, { transports: ["polling"], reconnection: false });
  const error = await new Promise<Error>((resolve, reject) => {
    client.once("connect", () => reject(new Error("polling connection was accepted")));
    client.once("connect_error", resolve);
  });
  assert.ok(error);
  client.close();
});

test("a request is answered through its ack", async () => {
  const client: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
    transports: ["websocket"],
  });
  const response = await client.emitWithAck("auth:login", { name: "a", password: "b" });
  assert.deepEqual(response, { ok: false, error: "R3 is not implemented yet" });
  client.close();
});
