import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { groupRoomId } from "@chat/shared";
import { db } from "../src/db.js";
import { deleteTestData, loginNewUser, startServer, waitForStrayMessages } from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];
const groupIds: string[] = [];

async function user() {
  const result = await loginNewUser(server.url);
  names.push(result.name);
  return result;
}

before(async () => { server = await startServer(); });
after(async () => {
  server.close();
  await deleteTestData(names, groupIds);
});

test("message deletion is restricted to the sender and notifies only the DM participants", { timeout: 30000 }, async () => {
  const alice = await user();
  const bob = await user();
  const outsider = await user();
  try {
    const sent = await alice.client.emitWithAck("dm:send", { to: bob.name, text: "delete me" });
    assert.ok(sent.ok);
    const id = sent.data.id;
    const roomId = sent.data.roomId;
    const denied = await bob.client.emitWithAck("message:delete", { messageId: id });
    assert.deepEqual(denied, { ok: false, error: "MESSAGE_NOT_FOUND" });
    const otherEvents: unknown[] = [];
    outsider.client.on("message:deleted", (event) => otherEvents.push(event));
    const delivered = new Promise((resolve) => bob.client.once("message:deleted", resolve));
    assert.deepEqual(await alice.client.emitWithAck("message:delete", { messageId: id }), { ok: true });
    assert.deepEqual(await delivered, { messageId: id, roomId });
    const history = await bob.client.emitWithAck("room:history", { roomId });
    assert.ok(history.ok);
    assert.equal(history.data.some((message) => message.id === id), false);
    assert.deepEqual(await alice.client.emitWithAck("message:delete", { messageId: id }),
      { ok: false, error: "MESSAGE_NOT_FOUND" });
    await waitForStrayMessages();
    assert.deepEqual(otherEvents, []);
  } finally {
    [alice, bob, outsider].forEach(({ client }) => client.close());
  }
});

test("message deletion in a group notifies members but not outsiders", { timeout: 30000 }, async () => {
  const alice = await user();
  const bob = await user();
  const outsider = await user();
  try {
    const created = await alice.client.emitWithAck("group:create", { name: "Message deletion test" });
    assert.ok(created.ok);
    const groupId = created.data.id;
    groupIds.push(groupId);
    assert.ok((await bob.client.emitWithAck("group:join", { groupId })).ok);
    const sent = await bob.client.emitWithAck("group:send", { groupId, text: "group message" });
    assert.ok(sent.ok);
    assert.deepEqual(await alice.client.emitWithAck("message:delete", { messageId: sent.data.id }),
      { ok: false, error: "MESSAGE_NOT_FOUND" });
    const otherEvents: unknown[] = [];
    outsider.client.on("message:deleted", (event) => otherEvents.push(event));
    const delivered = new Promise((resolve) => alice.client.once("message:deleted", resolve));
    assert.deepEqual(await bob.client.emitWithAck("message:delete", { messageId: sent.data.id }), { ok: true });
    assert.deepEqual(await delivered, { messageId: sent.data.id, roomId: groupRoomId(groupId) });
    const history = await alice.client.emitWithAck("room:history", { roomId: groupRoomId(groupId) });
    assert.ok(history.ok);
    assert.equal(history.data.some((message) => message.id === sent.data.id), false);
    await waitForStrayMessages();
    assert.deepEqual(otherEvents, []);
  } finally {
    [alice, bob, outsider].forEach(({ client }) => client.close());
  }
});

test("group deletion is restricted to its creator and removes group history for everyone", { timeout: 30000 }, async () => {
  const alice = await user();
  const bob = await user();
  try {
    const created = await alice.client.emitWithAck("group:create", { name: "Delete test" });
    assert.ok(created.ok);
    const groupId = created.data.id;
    groupIds.push(groupId);
    assert.ok((await bob.client.emitWithAck("group:join", { groupId })).ok);
    assert.ok((await bob.client.emitWithAck("group:send", { groupId, text: "group message" })).ok);
    assert.deepEqual(await bob.client.emitWithAck("group:delete", { groupId }),
      { ok: false, error: "FORBIDDEN" });
    const event = new Promise((resolve) => bob.client.once("group:deleted", resolve));
    assert.deepEqual(await alice.client.emitWithAck("group:delete", { groupId }), { ok: true });
    assert.deepEqual(await event, { groupId });
    const remaining = await db.from("messages").select("id").eq("room_id", groupRoomId(groupId));
    assert.equal(remaining.error, null);
    assert.deepEqual(remaining.data, []);
    assert.deepEqual(await bob.client.emitWithAck("room:history", { roomId: groupRoomId(groupId) }),
      { ok: false, error: "GROUP_NOT_FOUND" });
    assert.deepEqual(await bob.client.emitWithAck("group:send", { groupId, text: "too late" }),
      { ok: false, error: "GROUP_NOT_FOUND" });
    assert.deepEqual(await alice.client.emitWithAck("group:delete", { groupId }),
      { ok: false, error: "GROUP_NOT_FOUND" });
  } finally {
    [alice, bob].forEach(({ client }) => client.close());
  }
});

test("delete requests require login and valid identifiers", { timeout: 30000 }, async () => {
  const { connectClient } = await import("./helpers.js");
  const client = await connectClient(server.url);
  try {
    assert.deepEqual(await client.emitWithAck("message:delete", { messageId: randomUUID() }),
      { ok: false, error: "NOT_LOGGED_IN" });
    assert.deepEqual(await client.emitWithAck("group:delete", { groupId: randomUUID() }),
      { ok: false, error: "NOT_LOGGED_IN" });
  } finally {
    client.close();
  }
  const alice = await user();
  try {
    assert.deepEqual(await alice.client.emitWithAck("message:delete", { messageId: "invalid" }),
      { ok: false, error: "INVALID_INPUT" });
    assert.deepEqual(await alice.client.emitWithAck("group:delete", { groupId: "invalid" }),
      { ok: false, error: "INVALID_INPUT" });
  } finally {
    alice.client.close();
  }
});
