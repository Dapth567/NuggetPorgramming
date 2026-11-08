import { randomUUID } from "node:crypto";
import type { Ack, XoGame, XoMark } from "@chat/shared";
import { findGroup } from "../repo/groups.js";
import { saveMessage } from "../repo/messages.js";
import { state } from "../state.js";
import type { ChatServer, ChatSocket } from "../types.js";
import { asRecord, INVALID_INPUT, isValidName, NOT_LOGGED_IN, requireLogin } from "../validate.js";
import { denyRoomAccess } from "./room.js";

const GAME_NOT_FOUND: Ack<never> = { ok: false, error: "GAME_NOT_FOUND" };
const NOT_YOUR_TURN: Ack<never> = { ok: false, error: "NOT_YOUR_TURN" };
const ALREADY_IN_GAME: Ack<never> = { ok: false, error: "ALREADY_IN_GAME" };
const SERVER_ERROR: Ack<never> = { ok: false, error: "SERVER_ERROR" };

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** The three cells of a completed line, or null. */
export function winLine(board: (XoMark | null)[]): number[] | null {
  return LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null;
}

const games = () => [...state.games.values()];
/** Still at the table: one of its two players, and has not left. */
const seated = (game: XoGame, name: string) => (game.x === name || game.o === name) && !game.left.includes(name);
const isPlaying = (name: string) => games().some((g) => g.status === "playing" && seated(g, name));
const isInviting = (name: string) => games().some((g) => g.status === "invited" && g.x === name);

/** The sockets that may see this room: the two people of a DM, or the sockets in a group's room (R7, R11). */
function audience(io: ChatServer, game: XoGame) {
  if (!game.roomId.startsWith("dm:")) return io.to(game.roomId);
  const ids = [game.x, game.o].flatMap((name) => {
    const id = name ? state.onlineUsers.get(name) : undefined;
    return id ? [id] : [];
  });
  // io.to([]) would reach every socket, so a DM with nobody online sends nothing.
  return ids.length > 0 ? io.to(ids) : null;
}

const publish = (io: ChatServer, game: XoGame) => audience(io, game)?.emit("game:update", game);

/** Posts the result as a normal chat message, so it stays in the room's history. */
async function saveResult(io: ChatServer, game: XoGame) {
  const loser = game.winner === game.x ? game.o : game.x;
  const text =
    game.result === "draw"
      ? `🎮 XO: ${game.x} and ${game.o} drew`
      : `🎮 XO: ${game.winner} beat ${loser}${game.result === "forfeit" ? ` (${loser} left)` : ""}`;
  const message = await saveMessage(game.roomId, game.winner ?? game.x, text);
  audience(io, game)?.emit("message:new", message);
}

/** Ends a round. The table stays open, so the same card is reused for the next round. */
function finish(io: ChatServer, game: XoGame, result: NonNullable<XoGame["result"]>, winner: string | null) {
  game.status = "over";
  game.result = result;
  game.winner = winner;
  game.rematch = [];
  publish(io, game);
  if (result === "win" || result === "draw" || result === "forfeit") {
    saveResult(io, game).catch((error) => console.error("[game] result message", error));
  }
}

/** Removes the table; every client drops its card. */
function close(io: ChatServer, game: XoGame) {
  game.status = "closed";
  state.games.delete(game.id);
  publish(io, game);
}

/**
 * The inviter withdraws, the invited person of a DM says no, a player resigns,
 * or a player leaves after a round. The table closes once nobody is left at it.
 */
function leave(io: ChatServer, game: XoGame, name: string) {
  if (game.status === "invited" && name === game.x) {
    game.result = "cancelled";
    return close(io, game);
  }
  game.left.push(name);
  if (game.status === "invited") return finish(io, game, "declined", null);
  if (game.status === "playing") return finish(io, game, "forfeit", name === game.x ? game.o : game.x);
  game.rematch = game.rematch.filter((n) => n !== name);
  if ([game.x, game.o].every((p) => p === null || game.left.includes(p))) close(io, game);
  else publish(io, game);
}

/** Before starting or joining another game, leave the tables you are only waiting at. */
function release(io: ChatServer, name: string) {
  for (const g of games()) {
    if ((g.status === "invited" && g.x === name) || (g.status === "over" && seated(g, name))) leave(io, g, name);
  }
}

/** Same rule as `room:history`: only the two people of a DM, or members of the group. */
async function checkRoom(name: string, roomId: string): Promise<Ack<never> | null> {
  try {
    return await denyRoomAccess(name, roomId);
  } catch (error) {
    console.error("[game] room check", error);
    return SERVER_ERROR;
  }
}

export function registerGameHandlers(io: ChatServer, socket: ChatSocket) {
  socket.on("game:invite", async (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { roomId } = asRecord(payload);
    if (typeof roomId !== "string") return ack(INVALID_INPUT);

    const denied = await checkRoom(me, roomId);
    if (denied) return ack(denied);

    // A DM invites the other person by name; in a group any member may accept.
    let o: string | null = null;
    if (roomId.startsWith("dm:")) {
      o = roomId.slice("dm:".length).split("|").find((name) => name !== me) ?? null;
      if (!o) return ack(INVALID_INPUT);
      if (!state.onlineUsers.has(o)) return ack({ ok: false, error: "USER_OFFLINE" });
    }
    // Checked after the await, with nothing awaited before the game is stored, so two invites cannot both pass.
    if (isPlaying(me) || isInviting(me)) return ack(ALREADY_IN_GAME);
    // A finished table you are still at (e.g. the other player left) closes instead of staying on screen.
    release(io, me);

    const game: XoGame = {
      id: randomUUID(),
      roomId,
      x: me,
      o,
      status: "invited",
      board: Array(9).fill(null),
      turn: "X",
      result: null,
      winner: null,
      winLine: null,
      invitees: [],
      declined: [],
      rematch: [],
      left: [],
    };
    state.games.set(game.id, game);
    ack({ ok: true, data: game });
    publish(io, game);
  });

  socket.on("game:respond", async (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { gameId, accept } = asRecord(payload);
    if (typeof gameId !== "string" || typeof accept !== "boolean") return ack(INVALID_INPUT);

    const found = state.games.get(gameId);
    if (!found) return ack(GAME_NOT_FOUND);
    const denied = await checkRoom(me, found.roomId);
    if (denied) return ack(denied);

    // Look again after the await: someone else may have taken the seat meanwhile.
    const game = state.games.get(gameId);
    if (!game || game.status !== "invited") return ack(GAME_NOT_FOUND);
    // A DM invite names its player; a group invite is only for the members the inviter asked.
    if (game.x === me || (game.o !== null && game.o !== me) || (game.o === null && !game.invitees.includes(me))) {
      return ack(INVALID_INPUT);
    }

    if (!accept) {
      if (game.o === me) leave(io, game, me);
      else {
        if (!game.declined.includes(me)) game.declined.push(me);
        publish(io, game);
      }
      return ack({ ok: true, data: game });
    }

    if (isPlaying(me)) return ack(ALREADY_IN_GAME);
    // An open invite or a finished table of your own would put you in two games at once.
    release(io, me);

    game.o = me;
    game.status = "playing";
    ack({ ok: true, data: game });
    publish(io, game);
  });

  // No await in here, so moves are applied one at a time in the order they arrive.
  socket.on("game:move", (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { gameId, cell } = asRecord(payload);
    if (typeof gameId !== "string" || typeof cell !== "number" || !Number.isInteger(cell)) {
      return ack(INVALID_INPUT);
    }

    const game = state.games.get(gameId);
    if (!game || game.status !== "playing") return ack(GAME_NOT_FOUND);
    const mark: XoMark | null = me === game.x ? "X" : me === game.o ? "O" : null;
    if (!mark || game.turn !== mark) return ack(NOT_YOUR_TURN);
    if (cell < 0 || cell > 8 || game.board[cell] !== null) return ack(INVALID_INPUT);

    game.board[cell] = mark;
    game.winLine = winLine(game.board);
    if (game.winLine) finish(io, game, "win", me);
    else if (game.board.every((c) => c !== null)) finish(io, game, "draw", null);
    else {
      game.turn = mark === "X" ? "O" : "X";
      publish(io, game);
    }
    ack({ ok: true, data: game });
  });

  socket.on("game:leave", (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { gameId } = asRecord(payload);
    if (typeof gameId !== "string") return ack(INVALID_INPUT);

    const game = state.games.get(gameId);
    if (!game || !seated(game, me)) return ack(GAME_NOT_FOUND);
    leave(io, game, me);
    ack({ ok: true, data: game });
  });

  // In a group the inviter picks who to ask, several at once; the first of them to accept plays.
  socket.on("game:ask", async (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { gameId, names } = asRecord(payload);
    if (typeof gameId !== "string" || !Array.isArray(names) || names.length === 0 || !names.every(isValidName)) {
      return ack(INVALID_INPUT);
    }

    const found = state.games.get(gameId);
    if (!found || found.status !== "invited" || found.x !== me || !found.roomId.startsWith("group:")) {
      return ack(GAME_NOT_FOUND);
    }
    let members: string[];
    try {
      const group = await findGroup(found.roomId.slice("group:".length));
      if (!group) return ack({ ok: false, error: "GROUP_NOT_FOUND" });
      members = group.members;
    } catch (error) {
      console.error("[game:ask]", error);
      return ack(SERVER_ERROR);
    }
    // Only other members of this group, so an invite never reaches someone outside it (R11).
    if (names.some((name) => name === me || !members.includes(name))) return ack(INVALID_INPUT);
    if (names.some((name) => !state.onlineUsers.has(name))) return ack({ ok: false, error: "USER_OFFLINE" });

    // Look again after the await: the invite may have been taken or cancelled meanwhile.
    const game = state.games.get(gameId);
    if (!game || game.status !== "invited") return ack(GAME_NOT_FOUND);
    for (const name of names) if (!game.invitees.includes(name)) game.invitees.push(name);
    // Asking again someone who said no gives them the invite back.
    game.declined = game.declined.filter((name) => !names.includes(name));
    ack({ ok: true, data: game });
    publish(io, game);
  });

  // After a round both players ask for another; the second ask starts it on the same table.
  socket.on("game:rematch", (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { gameId } = asRecord(payload);
    if (typeof gameId !== "string") return ack(INVALID_INPUT);

    const game = state.games.get(gameId);
    // Once one player has left, the other invites again instead.
    if (!game || game.status !== "over" || !seated(game, me) || game.left.length > 0) return ack(GAME_NOT_FOUND);

    if (!game.rematch.includes(me)) game.rematch.push(me);
    if (game.rematch.length === 2) {
      Object.assign(game, {
        status: "playing",
        board: Array(9).fill(null),
        turn: "X",
        result: null,
        winner: null,
        winLine: null,
        rematch: [],
      } satisfies Partial<XoGame>);
    }
    ack({ ok: true, data: game });
    publish(io, game);
  });

  socket.on("game:list", async (payload, ack) => {
    const me = requireLogin(socket);
    if (!me) return ack(NOT_LOGGED_IN);
    const { roomId } = asRecord(payload);
    if (typeof roomId !== "string") return ack(INVALID_INPUT);

    const denied = await checkRoom(me, roomId);
    if (denied) return ack(denied);
    ack({ ok: true, data: games().filter((g) => g.roomId === roomId) });
  });

  // Nobody waits forever on someone who left: their invites close and their game is lost.
  socket.on("disconnect", () => {
    const { name } = socket.data;
    if (!name) return;
    for (const game of games()) if (seated(game, name)) leave(io, game, name);
  });
}
