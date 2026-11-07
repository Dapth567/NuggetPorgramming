import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { dmRoomId, groupRoomId, type TypingUpdate } from "@chat/shared";
import {
  connectClient,
  deleteTestData,
  loginNewUser,
  randomName,
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

/** Collect every `typing:update`, to prove a client received nothing. */
function recordTyping(client: TestClient) {
  const received: TypingUpdate[] = [];
  client.on("typing:update", (update) => received.push(update));
  return received;
}

function nextTyping(client: TestClient) {
  return new Promise<TypingUpdate>((resolve) => client.once("typing:update", resolve));
}

/** alice creates a group and bob joins it through the socket, as the app does; carol stays outside. */
async function groupWithOutsider() {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const created = await alice.client.emitWithAck("group:create", { name: randomName("g") });
  assert.ok(created.ok);
  groupIds.push(created.data.id);
  assert.ok((await bob.client.emitWithAck("group:join", { groupId: created.data.id })).ok);
  return { alice, bob, carol, roomId: groupRoomId(created.data.id) };
}

before(async () => {
  server = await startServer();
});

after(async () => {
  server.close();
  await deleteTestData(names, groupIds);
});

test("group members see who is typing, the typist and outsiders do not", async () => {
  const { alice, bob, carol, roomId } = await groupWithOutsider();
  const aliceInbox = recordTyping(alice.client);
  const carolInbox = recordTyping(carol.client);
  const toBob = nextTyping(bob.client);

  const res = await alice.client.emitWithAck("typing:set", { roomId, typing: true });

  assert.ok(res.ok);
  assert.deepEqual(await toBob, { roomId, name: alice.name, typing: true });
  await waitForStrayMessages();
  assert.deepEqual(aliceInbox, []);
  assert.deepEqual(carolInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("stopping is passed on too", async () => {
  const { alice, bob, carol, roomId } = await groupWithOutsider();
  const toBob = nextTyping(bob.client);
  await alice.client.emitWithAck("typing:set", { roomId, typing: false });
  assert.deepEqual(await toBob, { roomId, name: alice.name, typing: false });
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("someone outside a group cannot send typing into it", async () => {
  const { alice, bob, carol, roomId } = await groupWithOutsider();
  const aliceInbox = recordTyping(alice.client);
  const bobInbox = recordTyping(bob.client);

  const res = await carol.client.emitWithAck("typing:set", { roomId, typing: true });

  assert.deepEqual(res, { ok: false, error: "NOT_A_MEMBER" });
  await waitForStrayMessages();
  assert.deepEqual(aliceInbox, []);
  assert.deepEqual(bobInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("in a DM only the other person sees typing", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const roomId = dmRoomId(alice.name, bob.name);
  const aliceInbox = recordTyping(alice.client);
  const carolInbox = recordTyping(carol.client);
  const toBob = nextTyping(bob.client);

  const res = await alice.client.emitWithAck("typing:set", { roomId, typing: true });

  assert.ok(res.ok);
  assert.deepEqual(await toBob, { roomId, name: alice.name, typing: true });
  await waitForStrayMessages();
  assert.deepEqual(aliceInbox, []);
  assert.deepEqual(carolInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a DM between two other people is refused", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const bobInbox = recordTyping(bob.client);

  const res = await carol.client.emitWithAck("typing:set", {
    roomId: dmRoomId(alice.name, bob.name),
    typing: true,
  });

  assert.deepEqual(res, { ok: false, error: "NOT_A_MEMBER" });
  await waitForStrayMessages();
  assert.deepEqual(bobInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("malformed room ids and flags are rejected", async () => {
  const alice = await user();
  const payloads = [
    { roomId: "abc", typing: true },
    { roomId: "group:not-a-uuid", typing: true },
    { roomId: `dm:${alice.name}|${alice.name}`, typing: true },
    { roomId: "dm:b|a", typing: true },
    { roomId: groupRoomId(randomUUID()), typing: "yes" },
    { roomId: 5, typing: true },
    {},
    "nonsense",
  ];
  for (const payload of payloads) {
    const res = await alice.client.emitWithAck("typing:set", payload as never);
    assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" }, JSON.stringify(payload));
  }
  alice.client.close();
});

test("a group you are not in is refused even if it does not exist", async () => {
  const alice = await user();
  const res = await alice.client.emitWithAck("typing:set", { roomId: groupRoomId(randomUUID()), typing: true });
  assert.deepEqual(res, { ok: false, error: "NOT_A_MEMBER" });
  alice.client.close();
});

test("typing needs a login", async () => {
  const client = await connectClient(server.url);
  const res = await client.emitWithAck("typing:set", { roomId: dmRoomId("a", "b"), typing: true });
  assert.deepEqual(res, { ok: false, error: "NOT_LOGGED_IN" });
  client.close();
});
