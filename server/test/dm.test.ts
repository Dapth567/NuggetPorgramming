import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { dmRoomId } from "@chat/shared";
import {
  connectClient,
  deleteTestData,
  login,
  loginNewUser,
  nextMessage,
  randomName,
  recordMessages,
  registerNewUser,
  startServer,
  waitForStrayMessages,
} from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];

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
  await deleteTestData(names);
});

test("the sender and receiver get the message, a third client does not (R6, R7)", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const carolInbox = recordMessages(carol.client);
  const toAlice = nextMessage(alice.client);
  const toBob = nextMessage(bob.client);

  const res = await alice.client.emitWithAck("dm:send", { to: bob.name, text: "สวัสดี" });

  assert.ok(res.ok);
  assert.equal(res.data.sender, alice.name);
  assert.equal(res.data.roomId, dmRoomId(alice.name, bob.name));
  assert.deepEqual(await toBob, res.data);
  assert.deepEqual(await toAlice, res.data);

  await waitForStrayMessages();
  assert.deepEqual(carolInbox, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a message to an offline user is saved for later (R7)", async () => {
  const alice = await user();
  const bob = await registerNewUser(server.url);
  names.push(bob.name);

  const res = await alice.client.emitWithAck("dm:send", { to: bob.name, text: "see you later" });
  assert.ok(res.ok);

  await login(bob.client, bob.name);
  const history = await bob.client.emitWithAck("room:history", { roomId: res.data.roomId });
  assert.ok(history.ok);
  assert.deepEqual(history.data, [res.data]);
  alice.client.close();
  bob.client.close();
});

test("a receiver without an account is refused (R7)", async () => {
  const alice = await user();
  const res = await alice.client.emitWithAck("dm:send", { to: randomName(), text: "hello" });
  assert.deepEqual(res, { ok: false, error: "USER_NOT_FOUND" });
  alice.client.close();
});

test("blank and malformed messages are rejected (R6)", async () => {
  const alice = await user();
  const bob = await user();
  const payloads = [
    { to: bob.name, text: "   " },
    { to: bob.name, text: "x".repeat(2001) },
    { to: "not|a|name", text: "hello" },
    { to: bob.name },
    "nonsense",
  ];
  for (const payload of payloads) {
    const res = await alice.client.emitWithAck("dm:send", payload as never);
    assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" });
  }
  alice.client.close();
  bob.client.close();
});

test("a DM to yourself is rejected (R7)", async () => {
  const alice = await user();
  const res = await alice.client.emitWithAck("dm:send", { to: alice.name, text: "hello me" });
  assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" });
  alice.client.close();
});

test("sending needs a login", async () => {
  const client = await connectClient(server.url);
  const res = await client.emitWithAck("dm:send", { to: "someone", text: "hello" });
  assert.deepEqual(res, { ok: false, error: "NOT_LOGGED_IN" });
  client.close();
});
