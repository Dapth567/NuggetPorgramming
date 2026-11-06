import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { dmRoomId, groupRoomId } from "@chat/shared";
import { addMember, createGroup } from "../src/repo/groups.js";
import { connectClient, deleteTestData, loginNewUser, startServer } from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];
const groupIds: string[] = [];

async function user() {
  const created = await loginNewUser(server.url);
  names.push(created.name);
  return created;
}

before(async () => {
  server = await startServer();
});

after(async () => {
  server.close();
  await deleteTestData(names, groupIds);
});

test("history is ordered from old to new (R6)", async () => {
  const [alice, bob] = [await user(), await user()];
  for (const text of ["one", "two", "three"]) {
    await alice.client.emitWithAck("dm:send", { to: bob.name, text });
  }

  const roomId = dmRoomId(alice.name, bob.name);
  const res = await bob.client.emitWithAck("room:history", { roomId });

  assert.ok(res.ok);
  assert.deepEqual(res.data.map((m) => m.text), ["one", "two", "three"]);
  alice.client.close();
  bob.client.close();
});

test("each pair of clients has its own room (R5)", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  await alice.client.emitWithAck("dm:send", { to: bob.name, text: "for bob" });
  await alice.client.emitWithAck("dm:send", { to: carol.name, text: "for carol" });

  const withBob = await alice.client.emitWithAck("room:history", {
    roomId: dmRoomId(alice.name, bob.name),
  });
  const withCarol = await alice.client.emitWithAck("room:history", {
    roomId: dmRoomId(alice.name, carol.name),
  });

  assert.ok(withBob.ok && withCarol.ok);
  assert.deepEqual(withBob.data.map((m) => m.text), ["for bob"]);
  assert.deepEqual(withCarol.data.map((m) => m.text), ["for carol"]);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a client outside a DM cannot read its history (R7)", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  await alice.client.emitWithAck("dm:send", { to: bob.name, text: "private" });

  const res = await carol.client.emitWithAck("room:history", {
    roomId: dmRoomId(alice.name, bob.name),
  });

  assert.deepEqual(res, { ok: false, error: "NOT_A_MEMBER" });
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a client outside a group cannot read its history (R11)", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const group = await createGroup("test group", alice.name);
  groupIds.push(group.id);
  await addMember(group.id, bob.name);
  const roomId = groupRoomId(group.id);

  assert.deepEqual(await carol.client.emitWithAck("room:history", { roomId }), {
    ok: false,
    error: "NOT_A_MEMBER",
  });
  assert.deepEqual(await bob.client.emitWithAck("room:history", { roomId }), {
    ok: true,
    data: [],
  });
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a group that does not exist is reported (R5)", async () => {
  const alice = await user();
  const res = await alice.client.emitWithAck("room:history", {
    roomId: groupRoomId(randomUUID()),
  });
  assert.deepEqual(res, { ok: false, error: "GROUP_NOT_FOUND" });
  alice.client.close();
});

test("a malformed room id is rejected (R5)", async () => {
  const alice = await user();
  const roomIds = ["abc", "dm:alice", "dm:b|a", "dm:a|b|c", "group:not-a-uuid", 5, undefined];
  for (const roomId of roomIds) {
    const res = await alice.client.emitWithAck("room:history", { roomId } as never);
    assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" }, `roomId ${roomId}`);
  }
  alice.client.close();
});

test("reading history needs a login", async () => {
  const client = await connectClient(server.url);
  const res = await client.emitWithAck("room:history", { roomId: dmRoomId("a", "b") });
  assert.deepEqual(res, { ok: false, error: "NOT_LOGGED_IN" });
  client.close();
});
