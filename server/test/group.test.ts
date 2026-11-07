import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { groupRoomId, type GroupInfo } from "@chat/shared";
import { addMember, createGroup } from "../src/repo/groups.js";
import {
  deleteTestData,
  login,
  nextMessage,
  randomName,
  recordMessages,
  registerNewUser,
  startServer,
  waitForStrayMessages,
  type TestClient,
} from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];
const groupIds: string[] = [];

async function registered() {
  const created = await registerNewUser(server.url);
  names.push(created.name);
  return created;
}

async function loggedIn() {
  const user = await registered();
  await login(user.client, user.name);
  return user;
}

/** Creates a group through the socket, the way the app does. */
async function create(client: TestClient, name = randomName("g")): Promise<GroupInfo> {
  const res = await client.emitWithAck("group:create", { name });
  assert.ok(res.ok, `group:create failed: ${res.ok ? "" : res.error}`);
  groupIds.push(res.data.id);
  return res.data;
}

/** Resolves to the group with this name from the next `groups:list` that has it. */
function groupInNextList(client: TestClient, name: string) {
  return new Promise<GroupInfo>((resolve) => {
    const onList = (groups: GroupInfo[]) => {
      const group = groups.find((g) => g.name === name);
      if (!group) return;
      client.off("groups:list", onList);
      resolve(group);
    };
    client.on("groups:list", onList);
  });
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

test("a new group has its creator as the only member (R8)", async () => {
  const { client, name } = await loggedIn();
  const groupName = randomName("g");
  const group = await create(client, groupName);
  assert.equal(group.name, groupName);
  assert.equal(group.createdBy, name);
  assert.deepEqual(group.members, [name]);
  client.close();
});

test("members sent with group:create are ignored (R8)", async () => {
  const [creator, other] = [await loggedIn(), await loggedIn()];
  const res = await creator.client.emitWithAck("group:create", {
    name: randomName("g"),
    members: [other.name],
  } as never);
  assert.ok(res.ok);
  groupIds.push(res.data.id);
  assert.deepEqual(res.data.members, [creator.name]);
  [creator, other].forEach(({ client }) => client.close());
});

test("one user can create several groups (R8)", async () => {
  const { client } = await loggedIn();
  const first = await create(client);
  const second = await create(client);
  assert.notEqual(first.id, second.id);
  client.close();
});

test("group:create needs a login and a valid name (R8)", async () => {
  const guest = await registered();
  const notLoggedIn = await guest.client.emitWithAck("group:create", { name: randomName("g") });
  assert.deepEqual(notLoggedIn, { ok: false, error: "NOT_LOGGED_IN" });

  await login(guest.client, guest.name);
  for (const name of ["", "   ", "x".repeat(51)]) {
    const res = await guest.client.emitWithAck("group:create", { name });
    assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" }, `name ${JSON.stringify(name)}`);
  }
  const malformed = await guest.client.emitWithAck("group:create", null as never);
  assert.deepEqual(malformed, { ok: false, error: "INVALID_INPUT" });
  guest.client.close();
});

test("the creator can chat in a new group without logging in again (R8, R11)", async () => {
  const { client } = await loggedIn();
  const group = await create(client);
  const delivered = nextMessage(client);
  const res = await client.emitWithAck("group:send", { groupId: group.id, text: "first" });
  assert.ok(res.ok);
  assert.deepEqual(await delivered, res.data);
  client.close();
});

test("every logged-in client sees a new group with its members (R9)", async () => {
  const [creator, viewer] = [await loggedIn(), await loggedIn()];
  const groupName = randomName("g");
  const seen = groupInNextList(viewer.client, groupName);
  const group = await create(creator.client, groupName);
  assert.deepEqual(await seen, group);
  [creator, viewer].forEach(({ client }) => client.close());
});

test("a client that logs in later gets every group, even ones it is not in (R9)", async () => {
  const creator = await loggedIn();
  const group = await create(creator.client);

  const late = await registered();
  const seen = groupInNextList(late.client, group.name);
  await login(late.client, late.name);
  assert.deepEqual(await seen, group);
  [creator, late].forEach(({ client }) => client.close());
});
