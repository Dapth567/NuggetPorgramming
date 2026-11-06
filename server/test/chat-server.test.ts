import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import {
  dmRoomId,
  NAME_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@chat/shared";
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
  const response = await client.emitWithAck("dm:send", { to: "a", text: "b" });
  assert.deepEqual(response, { ok: false, error: "NOT_IMPLEMENTED" });
  client.close();
});

test("a DM room id is the same from both sides", () => {
  assert.equal(dmRoomId("bob", "alice"), "dm:alice|bob");
  assert.equal(dmRoomId("alice", "bob"), "dm:alice|bob");
});

test("names allow Thai but not the DM separator", () => {
  assert.match("สมชาย_1", NAME_PATTERN);
  assert.doesNotMatch("a|b", NAME_PATTERN);
});
