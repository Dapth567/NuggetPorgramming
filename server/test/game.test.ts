import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { dmRoomId, groupRoomId, type XoGame } from "@chat/shared";
import { addMember, createGroup } from "../src/repo/groups.js";
import {
  connectClient,
  deleteTestData,
  login,
  loginNewUser,
  nextMessage,
  registerNewUser,
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

/** Resolves to the next `game:update` that satisfies `predicate`. */
function nextGame(client: TestClient, predicate: (game: XoGame) => boolean = () => true) {
  return new Promise<XoGame>((resolve) => {
    const onGame = (game: XoGame) => {
      if (!predicate(game)) return;
      client.off("game:update", onGame);
      resolve(game);
    };
    client.on("game:update", onGame);
  });
}

/** Collect every `game:update`, to prove a client received nothing. */
function recordGames(client: TestClient) {
  const seen: XoGame[] = [];
  client.on("game:update", (game) => seen.push(game));
  return seen;
}

async function invite(client: TestClient, roomId: string) {
  const res = await client.emitWithAck("game:invite", { roomId });
  assert.ok(res.ok, `game:invite failed: ${res.ok ? "" : res.error}`);
  return res.data;
}

/** A DM game between two new users that has already started. */
async function dmGame() {
  const [alice, bob] = [await user(), await user()];
  const game = await invite(alice.client, dmRoomId(alice.name, bob.name));
  assert.ok((await bob.client.emitWithAck("game:respond", { gameId: game.id, accept: true })).ok);
  return { alice, bob, game };
}

async function move(client: TestClient, gameId: string, cell: number) {
  const res = await client.emitWithAck("game:move", { gameId, cell });
  assert.ok(res.ok, `move ${cell} failed: ${res.ok ? "" : res.error}`);
  return res.data;
}

/** A group of alice, bob and carol, with dave outside. Login comes last so sockets join the group room. */
async function groupWithOutsider() {
  const created = [];
  for (let i = 0; i < 4; i++) {
    const u = await registerNewUser(server.url);
    names.push(u.name);
    created.push(u);
  }
  const [alice, bob, carol, dave] = created;
  const group = await createGroup("game test", alice.name);
  groupIds.push(group.id);
  await addMember(group.id, bob.name);
  await addMember(group.id, carol.name);
  for (const { client, name } of created) await login(client, name);
  return { alice, bob, carol, dave, roomId: groupRoomId(group.id) };
}

before(async () => {
  server = await startServer();
});

after(async () => {
  server.close();
  await deleteTestData(names, groupIds);
});

test("a DM invite reaches only the two people in it, and a no ends it", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const carolSees = recordGames(carol.client);
  const bobGets = nextGame(bob.client);

  const game = await invite(alice.client, dmRoomId(alice.name, bob.name));
  assert.equal(game.status, "invited");
  assert.equal(game.x, alice.name);
  assert.equal(game.o, bob.name);
  assert.deepEqual(await bobGets, game);

  const aliceGets = nextGame(alice.client, (g) => g.status === "over");
  const res = await bob.client.emitWithAck("game:respond", { gameId: game.id, accept: false });
  assert.ok(res.ok);
  assert.equal((await aliceGets).result, "declined");

  await waitForStrayMessages();
  assert.deepEqual(carolSees, []);
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("a DM game is played to a win and the result is saved in that chat", async () => {
  const { alice, bob, game } = await dmGame();

  assert.deepEqual(await bob.client.emitWithAck("game:move", { gameId: game.id, cell: 0 }), {
    ok: false,
    error: "NOT_YOUR_TURN",
  });
  await move(alice.client, game.id, 0);
  assert.deepEqual(await alice.client.emitWithAck("game:move", { gameId: game.id, cell: 1 }), {
    ok: false,
    error: "NOT_YOUR_TURN",
  });
  for (const cell of [0, 9, -1, 1.5]) {
    const res = await bob.client.emitWithAck("game:move", { gameId: game.id, cell });
    assert.deepEqual(res, { ok: false, error: "INVALID_INPUT" }, `cell ${cell}`);
  }

  await move(bob.client, game.id, 3);
  await move(alice.client, game.id, 1);
  await move(bob.client, game.id, 4);
  const bobSeesEnd = nextGame(bob.client, (g) => g.status === "over");
  const result = nextMessage(bob.client);
  const end = await move(alice.client, game.id, 2);

  assert.equal(end.status, "over");
  assert.equal(end.result, "win");
  assert.equal(end.winner, alice.name);
  assert.deepEqual(end.winLine, [0, 1, 2]);
  assert.deepEqual(await bobSeesEnd, end);

  const message = await result;
  assert.equal(message.roomId, dmRoomId(alice.name, bob.name));
  assert.equal(message.sender, alice.name);
  assert.match(message.text, new RegExp(`${alice.name} beat ${bob.name}`));

  const history = await bob.client.emitWithAck("room:history", { roomId: message.roomId });
  assert.ok(history.ok);
  assert.deepEqual(history.data.at(-1), message);

  // The game is gone once it is over.
  assert.deepEqual(await alice.client.emitWithAck("game:move", { gameId: game.id, cell: 8 }), {
    ok: false,
    error: "GAME_NOT_FOUND",
  });
  alice.client.close();
  bob.client.close();
});

test("a full board with no line is a draw", async () => {
  const { alice, bob, game } = await dmGame();
  // X O X / X O O / O X X
  const moves: [TestClient, number][] = [
    [alice.client, 0], [bob.client, 1], [alice.client, 2], [bob.client, 4], [alice.client, 3],
    [bob.client, 5], [alice.client, 7], [bob.client, 6],
  ];
  for (const [client, cell] of moves) assert.equal((await move(client, game.id, cell)).status, "playing");

  const end = await move(alice.client, game.id, 8);
  assert.equal(end.result, "draw");
  assert.equal(end.winner, null);
  assert.equal(end.winLine, null);
  alice.client.close();
  bob.client.close();
});

test("anyone in a group can accept, only the first one plays, and outsiders see nothing (R11)", async () => {
  const { alice, bob, carol, dave, roomId } = await groupWithOutsider();
  const daveSees = recordGames(dave.client);

  assert.deepEqual(await dave.client.emitWithAck("game:invite", { roomId }), {
    ok: false,
    error: "NOT_A_MEMBER",
  });

  const carolGetsInvite = nextGame(carol.client);
  const game = await invite(alice.client, roomId);
  assert.equal(game.o, null);
  assert.deepEqual(await carolGetsInvite, game);

  assert.deepEqual(await dave.client.emitWithAck("game:respond", { gameId: game.id, accept: true }), {
    ok: false,
    error: "NOT_A_MEMBER",
  });

  const answers = await Promise.all([
    bob.client.emitWithAck("game:respond", { gameId: game.id, accept: true }),
    carol.client.emitWithAck("game:respond", { gameId: game.id, accept: true }),
  ]);
  const winners = answers.filter((a) => a.ok);
  assert.equal(winners.length, 1);
  assert.deepEqual(
    answers.find((a) => !a.ok),
    { ok: false, error: "GAME_NOT_FOUND" },
  );
  const started = winners[0].ok ? winners[0].data : null;
  assert.equal(started?.status, "playing");

  // The member who lost the race watches: they get the moves but cannot play.
  const [player, watcher] = started?.o === bob.name ? [bob, carol] : [carol, bob];
  const watcherSeesMove = nextGame(watcher.client, (g) => g.board[4] === "X");
  await move(alice.client, game.id, 4);
  await watcherSeesMove;
  assert.deepEqual(await watcher.client.emitWithAck("game:move", { gameId: game.id, cell: 0 }), {
    ok: false,
    error: "NOT_YOUR_TURN",
  });
  await move(player.client, game.id, 0);

  await waitForStrayMessages();
  assert.deepEqual(daveSees, []);
  [alice, bob, carol, dave].forEach(({ client }) => client.close());
});

test("a group member can say no without closing the invite for the others", async () => {
  const { alice, bob, carol, dave, roomId } = await groupWithOutsider();
  const game = await invite(alice.client, roomId);

  const no = await carol.client.emitWithAck("game:respond", { gameId: game.id, accept: false });
  assert.ok(no.ok);
  assert.equal(no.data.status, "invited");
  assert.deepEqual(no.data.declined, [carol.name]);

  const yes = await bob.client.emitWithAck("game:respond", { gameId: game.id, accept: true });
  assert.ok(yes.ok);
  assert.equal(yes.data.o, bob.name);
  assert.equal(yes.data.status, "playing");
  [alice, bob, carol, dave].forEach(({ client }) => client.close());
});

test("deleting a group ends its games, so the players can start new ones", async () => {
  const { alice, bob, carol, dave, roomId } = await groupWithOutsider();
  try {
    const game = await invite(alice.client, roomId);
    assert.ok((await bob.client.emitWithAck("game:respond", { gameId: game.id, accept: true })).ok);

    const deleted = await alice.client.emitWithAck("group:delete", { groupId: roomId.slice("group:".length) });
    assert.deepEqual(deleted, { ok: true }, "is supabase/delete_group.sql installed?");
    assert.deepEqual(await alice.client.emitWithAck("game:move", { gameId: game.id, cell: 0 }), {
      ok: false,
      error: "GAME_NOT_FOUND",
    });
    const next = await invite(alice.client, dmRoomId(alice.name, bob.name));
    assert.ok((await bob.client.emitWithAck("game:respond", { gameId: next.id, accept: true })).ok);
  } finally {
    [alice, bob, carol, dave].forEach(({ client }) => client.close());
  }
});

test("you cannot invite yourself or someone offline, or be in two games at once", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const offline = await registerNewUser(server.url);
  names.push(offline.name);

  assert.deepEqual(await alice.client.emitWithAck("game:invite", { roomId: dmRoomId(alice.name, alice.name) }), {
    ok: false,
    error: "INVALID_INPUT",
  });
  assert.deepEqual(await alice.client.emitWithAck("game:invite", { roomId: dmRoomId(alice.name, offline.name) }), {
    ok: false,
    error: "USER_OFFLINE",
  });

  const toBob = await invite(alice.client, dmRoomId(alice.name, bob.name));
  assert.deepEqual(await alice.client.emitWithAck("game:invite", { roomId: dmRoomId(alice.name, carol.name) }), {
    ok: false,
    error: "ALREADY_IN_GAME",
  });

  // Accepting someone else's invite withdraws your own, so nobody plays two games.
  const fromCarol = await invite(carol.client, dmRoomId(carol.name, alice.name));
  const bobSeesCancel = nextGame(bob.client, (g) => g.id === toBob.id && g.status === "over");
  const accepted = await alice.client.emitWithAck("game:respond", { gameId: fromCarol.id, accept: true });
  assert.ok(accepted.ok);
  assert.equal((await bobSeesCancel).result, "cancelled");

  const busy = await invite(bob.client, dmRoomId(bob.name, alice.name));
  assert.deepEqual(await alice.client.emitWithAck("game:respond", { gameId: busy.id, accept: true }), {
    ok: false,
    error: "ALREADY_IN_GAME",
  });
  [alice, bob, carol, offline].forEach(({ client }) => client.close());
});

test("the inviter can cancel, and a player who resigns or disconnects loses", async () => {
  const [alice, bob] = [await user(), await user()];
  const invited = await invite(alice.client, dmRoomId(alice.name, bob.name));
  const cancelled = await alice.client.emitWithAck("game:leave", { gameId: invited.id });
  assert.ok(cancelled.ok);
  assert.equal(cancelled.data.result, "cancelled");

  const second = await invite(alice.client, dmRoomId(alice.name, bob.name));
  assert.ok((await bob.client.emitWithAck("game:respond", { gameId: second.id, accept: true })).ok);
  const resigned = await bob.client.emitWithAck("game:leave", { gameId: second.id });
  assert.ok(resigned.ok);
  assert.equal(resigned.data.result, "forfeit");
  assert.equal(resigned.data.winner, alice.name);

  const third = await invite(alice.client, dmRoomId(alice.name, bob.name));
  assert.ok((await bob.client.emitWithAck("game:respond", { gameId: third.id, accept: true })).ok);
  const aliceSeesEnd = nextGame(alice.client, (g) => g.id === third.id && g.status === "over");
  bob.client.close();
  const end = await aliceSeesEnd;
  assert.equal(end.result, "forfeit");
  assert.equal(end.winner, alice.name);
  alice.client.close();
});

test("game:list gives a room's open games to its members only", async () => {
  const [alice, bob, carol] = [await user(), await user(), await user()];
  const roomId = dmRoomId(alice.name, bob.name);
  const game = await invite(alice.client, roomId);

  const list = await bob.client.emitWithAck("game:list", { roomId });
  assert.deepEqual(list, { ok: true, data: [game] });
  assert.deepEqual(await carol.client.emitWithAck("game:list", { roomId }), {
    ok: false,
    error: "NOT_A_MEMBER",
  });
  [alice, bob, carol].forEach(({ client }) => client.close());
});

test("every game event needs a login", async () => {
  const client = await connectClient(server.url);
  const id = "00000000-0000-0000-0000-000000000000";
  const answers = await Promise.all([
    client.emitWithAck("game:invite", { roomId: "dm:a|b" }),
    client.emitWithAck("game:respond", { gameId: id, accept: true }),
    client.emitWithAck("game:move", { gameId: id, cell: 0 }),
    client.emitWithAck("game:leave", { gameId: id }),
    client.emitWithAck("game:list", { roomId: "dm:a|b" }),
  ]);
  for (const res of answers) assert.deepEqual(res, { ok: false, error: "NOT_LOGGED_IN" });
  client.close();
});
