import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { AI_NAME, dmRoomId, groupRoomId, mentionsAi, type ChatMessage } from "@chat/shared";
import { db } from "../src/db.js";
import {
  connectClient,
  deleteTestData,
  loginNewUser,
  PASSWORD,
  recordMessages,
  startServer,
  waitForStrayMessages,
  type TestClient,
} from "./helpers.js";

// Without a key the AI answers "not set up", so these tests check where answers go
// without calling Gemini or needing internet.
delete process.env.GEMINI_API_KEY;

let server: Awaited<ReturnType<typeof startServer>>;
const names: string[] = [];
const groupIds: string[] = [];
const rooms: string[] = [];

async function user() {
  const created = await loginNewUser(server.url);
  names.push(created.name);
  return created;
}

/** The next `message:new` sent by the AI. */
function nextAiMessage(client: TestClient) {
  return new Promise<ChatMessage>((resolve) => {
    const onMessage = (message: ChatMessage) => {
      if (message.sender !== AI_NAME) return;
      client.off("message:new", onMessage);
      resolve(message);
    };
    client.on("message:new", onMessage);
  });
}

before(async () => {
  server = await startServer();
});

after(async () => {
  server.close();
  // The AI's answers are not removed by sender name, so remove them by room.
  const { error } = await db.from("messages").delete().eq("sender", AI_NAME).in("room_id", rooms);
  if (error) throw new Error(error.message);
  await deleteTestData(names, groupIds);
});

test("@AI is found as a word in any case, not inside other words", () => {
  assert.ok(mentionsAi("@AI สรุปให้หน่อย"));
  assert.ok(mentionsAi("ช่วยหน่อย @ai"));
  assert.ok(mentionsAi("hey @Ai, what time is it?"));
  assert.equal(mentionsAi("email me at a@ai.com"), false);
  assert.equal(mentionsAi("@AIbot hello"), false);
  assert.equal(mentionsAi("AI is cool"), false);
});

test("nobody can register or log in as the AI (R3)", async () => {
  const client = await connectClient(server.url);
  for (const name of [AI_NAME, "ai", "Ai"]) {
    assert.deepEqual(await client.emitWithAck("auth:register", { name, password: PASSWORD }), {
      ok: false,
      error: "NAME_TAKEN",
    });
  }
  assert.deepEqual(await client.emitWithAck("auth:login", { name: AI_NAME, password: PASSWORD }), {
    ok: false,
    error: "WRONG_CREDENTIALS",
  });
  client.close();
});

test("a DM to the AI is answered to the asker only", async () => {
  const [alice, bob] = [await user(), await user()];
  rooms.push(dmRoomId(alice.name, AI_NAME));
  const bobInbox = recordMessages(bob.client);
  const answer = nextAiMessage(alice.client);

  const res = await alice.client.emitWithAck("dm:send", { to: AI_NAME, text: "สวัสดี AI" });
  assert.ok(res.ok);
  assert.equal(res.data.roomId, dmRoomId(alice.name, AI_NAME));

  const reply = await answer;
  assert.equal(reply.roomId, dmRoomId(alice.name, AI_NAME));
  assert.match(reply.text, /not set up/);

  const history = await alice.client.emitWithAck("room:history", { roomId: reply.roomId });
  assert.ok(history.ok);
  assert.deepEqual(history.data.map((m) => m.sender), [alice.name, AI_NAME]);

  await waitForStrayMessages();
  assert.deepEqual(bobInbox, []);
});

test("when a model is out of quota the next one answers, and the used-up one is skipped", async () => {
  // A fake Gemini on this machine: model "busy" is out of quota, model "spare" answers.
  const calls: string[] = [];
  const fake = createServer((req, res) => {
    const model = /models\/([^:]+):/.exec(req.url ?? "")?.[1] ?? "";
    calls.push(model);
    req.resume().on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (model === "busy") {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { code: 429, details: [{ retryDelay: "3600s" }] } }));
      }
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: `hello from ${model}` }] } }] }));
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, {
    GEMINI_API_KEY: "test-key",
    GEMINI_BASE_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}/models`,
    GEMINI_MODELS: "busy, spare",
  });

  try {
    const alice = await user();
    rooms.push(dmRoomId(alice.name, AI_NAME));
    for (const text of ["first question", "second question"]) {
      const answer = nextAiMessage(alice.client);
      await alice.client.emitWithAck("dm:send", { to: AI_NAME, text });
      assert.equal((await answer).text, "hello from spare");
    }
    // "busy" was asked once; after its 429 it is skipped instead of asked again.
    assert.deepEqual(calls, ["busy", "spare", "spare"]);
  } finally {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_BASE_URL;
    delete process.env.GEMINI_MODELS;
    fake.close();
  }
});

test("@AI in a group is answered to its members, and the AI does not join (R8, R9, R11)", async () => {
  const [alice, outsider] = [await user(), await user()];
  const created = await alice.client.emitWithAck("group:create", { name: "AI test group" });
  assert.ok(created.ok);
  groupIds.push(created.data.id);
  const roomId = groupRoomId(created.data.id);
  rooms.push(roomId);
  const outsiderInbox = recordMessages(outsider.client);

  // A message without @AI gets no answer.
  const aliceInbox = recordMessages(alice.client);
  await alice.client.emitWithAck("group:send", { groupId: created.data.id, text: "hello everyone" });
  await waitForStrayMessages();
  assert.deepEqual(aliceInbox.filter((m) => m.sender === AI_NAME), []);

  const answer = nextAiMessage(alice.client);
  await alice.client.emitWithAck("group:send", { groupId: created.data.id, text: "@AI summarize please" });
  const reply = await answer;
  assert.equal(reply.roomId, roomId);

  const { data: members, error } = await db
    .from("group_members").select("user_name").eq("group_id", created.data.id);
  assert.equal(error, null);
  assert.deepEqual(members?.map((m) => m.user_name), [alice.name]);

  await waitForStrayMessages();
  assert.deepEqual(outsiderInbox, []);
});
