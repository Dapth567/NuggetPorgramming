import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AI_NAME } from "@chat/shared";
import {
  connectClient,
  deleteTestData,
  loginNewUser,
  nextUsersList,
  PASSWORD,
  randomName,
  startServer,
} from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;
/** Every account these tests create, removed at the end so it does not appear in the app. */
const names: string[] = [];

async function user(name?: string) {
  const created = await loginNewUser(server.url, name);
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

test("registering a taken name is refused (R3)", async () => {
  const { client, name } = await user();
  const other = await connectClient(server.url);
  const res = await other.emitWithAck("auth:register", { name, password: PASSWORD });
  assert.deepEqual(res, { ok: false, error: "NAME_TAKEN" });
  client.close();
  other.close();
});

test("a wrong password and an unknown name give the same error (R3)", async () => {
  const { client, name } = await user();
  const other = await connectClient(server.url);
  const wrong = await other.emitWithAck("auth:login", { name, password: "not-the-password" });
  const unknown = await other.emitWithAck("auth:login", { name: randomName("nobody"), password: PASSWORD });
  assert.deepEqual(wrong, { ok: false, error: "WRONG_CREDENTIALS" });
  assert.deepEqual(unknown, wrong);
  client.close();
  other.close();
});

test("the same account cannot be online twice (R3)", async () => {
  const { client, name } = await user();
  const second = await connectClient(server.url);
  const res = await second.emitWithAck("auth:login", { name, password: PASSWORD });
  assert.deepEqual(res, { ok: false, error: "ALREADY_ONLINE" });
  client.close();
  second.close();
});

test("invalid names and short passwords are rejected (R3)", async () => {
  const client = await connectClient(server.url);
  const badName = await client.emitWithAck("auth:register", { name: "a|b", password: PASSWORD });
  const shortPassword = await client.emitWithAck("auth:register", { name: randomName(), password: "123" });
  assert.deepEqual(badName, { ok: false, error: "INVALID_INPUT" });
  assert.deepEqual(shortPassword, { ok: false, error: "INVALID_INPUT" });
  client.close();
});

test("a Thai name can register and log in (R3)", async () => {
  const name = `สมชาย_${randomName("")}`;
  const { client, firstUsers } = await user(name);
  assert.ok(firstUsers.includes(name));
  client.close();
});

test("the online list includes your own name and updates on join and leave (R4)", async () => {
  const first = await user();
  assert.ok(first.firstUsers.includes(first.name));

  const joined = nextUsersList(first.client, (names) => names.length > first.firstUsers.length);
  const second = await user();
  assert.ok((await joined).includes(second.name));

  const left = nextUsersList(first.client, (names) => !names.includes(second.name));
  second.client.close();
  const afterLeave = await left;
  assert.ok(afterLeave.includes(first.name));

  first.client.close();
});

test("users:all lists offline users too, not the AI, and updates when someone registers", async () => {
  const alice = await connectClient(server.url);
  const aliceName = randomName();
  const firstAll = new Promise<string[]>((resolve) => alice.once("users:all", resolve));
  assert.ok((await alice.emitWithAck("auth:register", { name: aliceName, password: PASSWORD })).ok);
  names.push(aliceName);
  assert.ok((await alice.emitWithAck("auth:login", { name: aliceName, password: PASSWORD })).ok);

  const all = await firstAll;
  assert.ok(all.includes(aliceName));
  assert.equal(all.includes(AI_NAME), false);

  // Bob registers but does not log in: Alice sees him at once, offline.
  const bobName = randomName();
  const withBob = new Promise<string[]>((resolve) => {
    const onAll = (list: string[]) => {
      if (!list.includes(bobName)) return;
      alice.off("users:all", onAll);
      resolve(list);
    };
    alice.on("users:all", onAll);
  });
  const bob = await connectClient(server.url);
  assert.ok((await bob.emitWithAck("auth:register", { name: bobName, password: PASSWORD })).ok);
  names.push(bobName);
  assert.ok((await withBob).includes(aliceName));

  alice.close();
  bob.close();
});

test("a name can log in again after the old connection drops (R3, R4)", async () => {
  const first = await user();
  first.client.close();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const again = await connectClient(server.url);
  const res = await again.emitWithAck("auth:login", { name: first.name, password: PASSWORD });
  assert.deepEqual(res, { ok: true, data: { name: first.name } });
  again.close();
});

test("a malformed login payload is rejected without crashing the server (R3)", async () => {
  const client = await connectClient(server.url);
  const res = await client.emitWithAck("auth:login", null as never);
  assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" });
  client.close();
});
