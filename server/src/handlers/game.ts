import { randomUUID } from "node:crypto";
import type { Ack, XoGame, XoMark } from "@chat/shared";
import { saveMessage } from "../repo/messages.js";
import { state } from "../state.js";
import type { ChatServer, ChatSocket } from "../types.js";
import { asRecord, INVALID_INPUT, NOT_LOGGED_IN, requireLogin } from "../validate.js";
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
const isPlaying = (name: string) =>
  games().some((g) => g.status === "playing" && (g.x === name || g.o === name));
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

function finish(io: ChatServer, game: XoGame, result: NonNullable<XoGame["result"]>, winner: string | null) {
  game.status = "over";
  game.result = result;
  game.winner = winner;
  state.games.delete(game.id);
  publish(io, game);
  if (result === "win" || result === "draw" || result === "forfeit") {
    saveResult(io, game).catch((error) => console.error("[game] result message", error));
  }
}

/** A player resigns, the inviter withdraws, or the invited person of a DM says no. */
function leave(io: ChatServer, game: XoGame, name: string) {
  if (game.status === "playing") finish(io, game, "forfeit", name === game.x ? game.o : game.x);
  else finish(io, game, name === game.x ? "cancelled" : "declined", null);
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
      declined: [],
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
    if (game.x === me || (game.o !== null && game.o !== me)) return ack(INVALID_INPUT);

    if (!accept) {
      if (game.o === me) finish(io, game, "declined", null);
      else {
        if (!game.declined.includes(me)) game.declined.push(me);
        publish(io, game);
      }
      return ack({ ok: true, data: game });
    }

    if (isPlaying(me)) return ack(ALREADY_IN_GAME);
    // An open invite of your own would put you in two games at once.
    for (const own of games()) if (own.status === "invited" && own.x === me) finish(io, own, "cancelled", null);

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
    if (!game || (game.x !== me && game.o !== me)) return ack(GAME_NOT_FOUND);
    leave(io, game, me);
    ack({ ok: true, data: game });
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
    for (const game of games()) if (game.x === name || game.o === name) leave(io, game, name);
  });
}
