import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { groupRoomId } from "@chat/shared";
import { createGroup } from "../src/repo/groups.js";
import {
  connectClient,
  deleteTestData,
  loginNewUser,
  nextGroup,
  nextMessage,
  recordMessages,
  startServer,
  waitForStrayMessages,
  type TestClient,
} from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];
const groupIds: string[] = [];

async function user() {
  const created = await loginNewUser(server.url);
  names.push(created.name);
  return created;
}

/** A group created by `owner`, who is its only member. */
async function groupOf(owner: string) {
  const group = await createGroup("join test", owner);
  groupIds.push(group.id);
  return group;
}

/** Wait for a `groups:list` in which this group has these members. */
function nextGroupMembers(client: TestClient, groupId: string, members: string[]) {
  return nextGroup(
    client,
    (g) =>
      g.id === groupId && g.members.length === members.length && members.every((m) => g.members.includes(m)),
  );
}

before(async () => {
  server = await startServer();
});

after(async () => {
  server.close();
  await deleteTestData(names, groupIds);
});

test("joining adds yourself and every client sees the new member list (R9, R10)", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const group = await groupOf(alice.name);
  const expected = [alice.name, bob.name];
  const seenByAlice = nextGroupMembers(alice.client, group.id, expected);
  const seenByCarol = nextGroupMembers(carol.client, group.id, expected);

  const res = await bob.client.emitWithAck("group:join", { groupId: group.id });

  assert.ok(res.ok);
  assert.equal(res.data.id, group.id);
  assert.deepEqual(res.data.members, expected);
  assert.deepEqual((await seenByAlice).members, expected);
  assert.deepEqual((await seenByCarol).members, expected);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a join request cannot add anyone else (R10)", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const group = await groupOf(alice.name);

  // Bob tries to sneak Carol in by naming her in the payload.
  const res = await bob.client.emitWithAck("group:join", {
    groupId: group.id,
    name: carol.name,
    user: carol.name,
  } as never);

  assert.ok(res.ok);
  assert.deepEqual(res.data.members, [alice.name, bob.name]);
  assert.ok(!res.data.members.includes(carol.name));
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("the creator cannot join again, and neither can a member (R10)", async () => {
  const [alice, bob] = [await user(), await user()];
  const group = await groupOf(alice.name);

  const creator = await alice.client.emitWithAck("group:join", { groupId: group.id });
  assert.deepEqual(creator, { ok: false, error: "ALREADY_A_MEMBER" });

  assert.ok((await bob.client.emitWithAck("group:join", { groupId: group.id })).ok);
  const again = await bob.client.emitWithAck("group:join", { groupId: group.id });
  assert.deepEqual(again, { ok: false, error: "ALREADY_A_MEMBER" });
  alice.client.close();
  bob.client.close();
});

test("two joins at the same time add the member once (R10)", async () => {
  const [alice, bob] = [await user(), await user()];
  const group = await groupOf(alice.name);

  const results = await Promise.all([
    bob.client.emitWithAck("group:join", { groupId: group.id }),
    bob.client.emitWithAck("group:join", { groupId: group.id }),
  ]);

  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(
    results.find((r) => !r.ok),
    { ok: false, error: "ALREADY_A_MEMBER" },
  );
  alice.client.close();
  bob.client.close();
});

test("after joining you get the group's new messages and its history (R10, R11)", async () => {
  const [alice, bob] = [await user(), await user()];
  const group = await groupOf(alice.name);
  const first = await alice.client.emitWithAck("group:send", { groupId: group.id, text: "before" });
  assert.ok(first.ok);

  // Not a member yet: nothing arrives and the history is closed.
  const bobInbox = recordMessages(bob.client);
  await alice.client.emitWithAck("group:send", { groupId: group.id, text: "still private" });
  await waitForStrayMessages();
  assert.deepEqual(bobInbox, []);

  assert.ok((await bob.client.emitWithAck("group:join", { groupId: group.id })).ok);

  const toBob = nextMessage(bob.client);
  const welcome = await alice.client.emitWithAck("group:send", { groupId: group.id, text: "welcome" });
  assert.ok(welcome.ok);
  assert.deepEqual(await toBob, welcome.data);

  const history = await bob.client.emitWithAck("room:history", { roomId: groupRoomId(group.id) });
  assert.ok(history.ok);
  assert.deepEqual(
    history.data.map((m) => m.text),
    ["before", "still private", "welcome"],
  );

  const reply = await bob.client.emitWithAck("group:send", { groupId: group.id, text: "thanks" });
  assert.ok(reply.ok);
  alice.client.close();
  bob.client.close();
});

test("a group that does not exist is reported (R10)", async () => {
  const alice = await user();
  const res = await alice.client.emitWithAck("group:join", { groupId: randomUUID() });
  assert.deepEqual(res, { ok: false, error: "GROUP_NOT_FOUND" });
  alice.client.close();
});

test("a malformed group id is rejected (R10)", async () => {
  const alice = await user();
  for (const payload of [{ groupId: "not-a-uuid" }, { groupId: 5 }, {}, "nonsense"]) {
    const res = await alice.client.emitWithAck("group:join", payload as never);
    assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" }, JSON.stringify(payload));
  }
  alice.client.close();
});

test("joining needs a login", async () => {
  const client = await connectClient(server.url);
  const res = await client.emitWithAck("group:join", { groupId: randomUUID() });
  assert.deepEqual(res, { ok: false, error: "NOT_LOGGED_IN" });
  client.close();
});
