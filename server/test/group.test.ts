import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { groupRoomId } from "@chat/shared";
import { addMember, createGroup } from "../src/repo/groups.js";
import {
  deleteTestData,
  login,
  nextMessage,
  recordMessages,
  registerNewUser,
  startServer,
  waitForStrayMessages,
} from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];
const groupIds: string[] = [];

async function registered() {
  const created = await registerNewUser(server.url);
  names.push(created.name);
  return created;
}

/** A group of alice and bob with carol outside. Login comes last so sockets join the group room. */
async function groupWithOutsider() {
  const [alice, bob, carol] = [await registered(), await registered(), await registered()];
  const group = await createGroup("test group", alice.name);
  groupIds.push(group.id);
  await addMember(group.id, bob.name);
  for (const { client, name } of [alice, bob, carol]) await login(client, name);
  return { alice, bob, carol, group };
}

before(async () => {
  server = await startServer();
});

after(async () => {
  server.close();
  await deleteTestData(names, groupIds);
});

test("only members get a group message (R5, R6, R11)", async () => {
  const { alice, bob, carol, group } = await groupWithOutsider();
  const carolInbox = recordMessages(carol.client);
  const toAlice = nextMessage(alice.client);
  const toBob = nextMessage(bob.client);

  const res = await alice.client.emitWithAck("group:send", { groupId: group.id, text: "สวัสดีทุกคน" });

  assert.ok(res.ok);
  assert.equal(res.data.roomId, groupRoomId(group.id));
  assert.deepEqual(await toBob, res.data);
  assert.deepEqual(await toAlice, res.data);

  await waitForStrayMessages();
  assert.deepEqual(carolInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a client outside the group cannot send to it (R11)", async () => {
  const { alice, bob, carol, group } = await groupWithOutsider();
  const aliceInbox = recordMessages(alice.client);

  const res = await carol.client.emitWithAck("group:send", { groupId: group.id, text: "let me in" });

  assert.deepEqual(res, { ok: false, error: "NOT_A_MEMBER" });
  await waitForStrayMessages();
  assert.deepEqual(aliceInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a group that does not exist is reported (R11)", async () => {
  const alice = await registered();
  await login(alice.client, alice.name);
  const res = await alice.client.emitWithAck("group:send", { groupId: randomUUID(), text: "hello" });
  assert.deepEqual(res, { ok: false, error: "GROUP_NOT_FOUND" });
  alice.client.close();
});
