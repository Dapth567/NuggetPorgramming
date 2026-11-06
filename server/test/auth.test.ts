import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  connectClient,
  loginNewUser,
  nextUsersList,
  PASSWORD,
  randomName,
  startServer,
} from "./helpers.js";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});

after(() => server.close());

test("registering a taken name is refused (R3)", async () => {
  const { client, name } = await loginNewUser(server.url);
  const other = await connectClient(server.url);
  const res = await other.emitWithAck("auth:register", { name, password: PASSWORD });
  assert.deepEqual(res, { ok: false, error: "NAME_TAKEN" });
  client.close();
  other.close();
});

test("a wrong password and an unknown name give the same error (R3)", async () => {
  const { client, name } = await loginNewUser(server.url);
  const other = await connectClient(server.url);
  const wrong = await other.emitWithAck("auth:login", { name, password: "not-the-password" });
  const unknown = await other.emitWithAck("auth:login", { name: randomName("nobody"), password: PASSWORD });
  assert.deepEqual(wrong, { ok: false, error: "WRONG_CREDENTIALS" });
  assert.deepEqual(unknown, wrong);
  client.close();
  other.close();
});

test("the same account cannot be online twice (R3)", async () => {
  const { client, name } = await loginNewUser(server.url);
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
  const { client, firstUsers } = await loginNewUser(server.url, name);
  assert.ok(firstUsers.includes(name));
  client.close();
});

test("the online list includes your own name and updates on join and leave (R4)", async () => {
  const first = await loginNewUser(server.url);
  assert.ok(first.firstUsers.includes(first.name));

  const joined = nextUsersList(first.client, (names) => names.length > first.firstUsers.length);
  const second = await loginNewUser(server.url);
  assert.ok((await joined).includes(second.name));

  const left = nextUsersList(first.client, (names) => !names.includes(second.name));
  second.client.close();
  const afterLeave = await left;
  assert.ok(afterLeave.includes(first.name));

  first.client.close();
});

test("a name can log in again after the old connection drops (R3, R4)", async () => {
  const first = await loginNewUser(server.url);
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
