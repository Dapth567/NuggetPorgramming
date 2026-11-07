import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { LIMITS, type UserAvatar } from "@chat/shared";
import { connectClient, deleteTestData, login, loginNewUser, registerNewUser, startServer, type TestClient } from "./helpers.js";

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];

async function user() {
  const result = await loginNewUser(server.url);
  names.push(result.name);
  return result;
}

function nextAvatarUpdate(client: TestClient) {
  return new Promise<{ name: string; image: string | null }>((resolve) =>
    client.once("avatar:updated", resolve),
  );
}

before(async () => { server = await startServer(); });
after(async () => {
  server.close();
  await deleteTestData(names);
});

test("setting a photo needs a login", async () => {
  const client = await connectClient(server.url);
  try {
    const res = await client.emitWithAck("profile:avatar", { image: IMAGE });
    assert.deepEqual(res, { ok: false, error: "NOT_LOGGED_IN" });
  } finally {
    client.close();
  }
});

test("anything but a small jpeg, png or webp is rejected", async () => {
  const { client } = await user();
  const longest = LIMITS.avatarMaxLength - "data:image/png;base64,".length;
  const bad: unknown[] = [
    undefined,
    42,
    "",
    "https://example.com/a.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:text/html;base64,PGI+",
    "data:image/png;base64,not base64!",
    `data:image/png;base64,${"A".repeat(longest + 1)}`,
  ];
  try {
    for (const image of bad) {
      const res = await client.emitWithAck("profile:avatar", { image } as { image: string });
      assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" }, `accepted ${String(image).slice(0, 40)}`);
    }
  } finally {
    client.close();
  }
});

test("a new photo reaches everyone online and the next login, and can be removed", async () => {
  const alice = await user();
  const bob = await user();
  const late = await registerNewUser(server.url);
  names.push(late.name);
  try {
    const seenByBob = nextAvatarUpdate(bob.client);
    const seenByAlice = nextAvatarUpdate(alice.client);
    assert.ok((await alice.client.emitWithAck("profile:avatar", { image: IMAGE })).ok);
    assert.deepEqual(await seenByBob, { name: alice.name, image: IMAGE });
    assert.deepEqual(await seenByAlice, { name: alice.name, image: IMAGE });

    const list = new Promise<UserAvatar[]>((resolve) => late.client.once("avatars:list", resolve));
    await login(late.client, late.name);
    assert.ok((await list).some((a) => a.name === alice.name && a.image === IMAGE));

    const removed = nextAvatarUpdate(bob.client);
    assert.ok((await alice.client.emitWithAck("profile:avatar", { image: null })).ok);
    assert.deepEqual(await removed, { name: alice.name, image: null });
  } finally {
    alice.client.close();
    bob.client.close();
    late.client.close();
  }
});
