import { useState } from "react";
import { groupRoomId, type ErrorCode, type XoGame, type XoMark } from "@chat/shared";
import type { ChatApi, Result } from "../useChat";
import "./XoGame.css";

type Report = (error: ErrorCode | null) => void;

/**
 * Whether `me` sees this game's card: not after leaving its table, and an invite
 * only if it is theirs or for them (a group invite goes to the members the inviter picked).
 */
export function showsGame(game: XoGame, me: string): boolean {
  if (game.left.includes(me)) return false;
  if (game.status !== "invited") return true;
  return game.x === me || game.o === me || (game.invitees.includes(me) && !game.declined.includes(me));
}

/** Rooms where an invite is waiting for `me`, to flag them in the sidebar. */
export function invitesFor(games: Record<string, XoGame>, me: string): Set<string> {
  const waiting = Object.values(games).filter((g) => g.status === "invited" && g.x !== me && showsGame(g, me));
  return new Set(waiting.map((g) => g.roomId));
}

export function XoBadge() {
  return (
    <span className="xo-badge" title="XO invite" aria-label="XO invite">
      🎮
    </span>
  );
}

/** The 🎮 button beside the message box. You can be in only one game at a time. */
export function XoInviteButton({
  chat,
  me,
  roomId,
  report,
}: {
  chat: ChatApi;
  me: string;
  roomId: string | null;
  report: Report;
}) {
  // A finished table in this room has its own buttons; one in another room is left when you invite.
  const busy = Object.values(chat.games).some(
    (g) =>
      (g.x === me || g.o === me) &&
      !g.left.includes(me) &&
      (g.status === "playing" || (g.status === "invited" && g.x === me) || (g.status === "over" && g.roomId === roomId)),
  );
  return (
    <button
      type="button"
      className="xo-invite"
      disabled={!roomId || busy}
      title={busy ? "You are already in a game" : "Play XO"}
      aria-label="Invite to a game of XO"
      onClick={async () => roomId && report(await chat.inviteGame(roomId))}
    >
      🎮
    </button>
  );
}

/** X is two strokes and O a ring, each drawn in when placed. */
function Mark({ mark }: { mark: XoMark }) {
  return (
    <svg className={mark === "X" ? "xo-mark x" : "xo-mark o"} viewBox="0 0 40 40" aria-hidden="true">
      {mark === "X" ? (
        <>
          <line x1="11" y1="11" x2="29" y2="29" />
          <line x1="29" y1="11" x2="11" y2="29" />
        </>
      ) : (
        <circle cx="20" cy="20" r="11" transform="rotate(-90 20 20)" />
      )}
    </svg>
  );
}

function Player({ name, mark, me, active }: { name: string | null; mark: XoMark; me: string; active: boolean }) {
  return (
    <span className={active ? "xo-player active" : "xo-player"}>
      <span className={mark === "X" ? "xo-chip x" : "xo-chip o"}>{mark}</span>
      <span className="xo-player-name">{name === null ? "Open seat" : name === me ? "You" : name}</span>
    </span>
  );
}

type Tone = "turn" | "wait" | "win" | "lose" | "plain";

function describe(game: XoGame, me: string): [string, Tone] {
  const { x, o, winner } = game;
  const inGroup = game.roomId.startsWith("group:");
  const playing = me === x || me === o;
  const loser = winner === x ? o : x;

  if (game.status === "invited") {
    if (me !== x) return [`${x} wants to play with you`, "plain"];
    if (!inGroup) return [`Waiting for ${o} to accept`, "wait"];
    const waiting = game.invitees.filter((name) => !game.declined.includes(name));
    if (waiting.length === 0) return ["Invite friends to play", "wait"];
    return [`Waiting for ${waiting.length > 2 ? `${waiting.length} friends` : waiting.join(" and ")} to accept`, "wait"];
  }
  if (game.status === "playing") {
    const current = game.turn === "X" ? x : o;
    if (current === me) return ["Your turn", "turn"];
    return [playing ? `Waiting for ${me === x ? o : x}` : `${current}'s turn`, "wait"];
  }
  switch (game.result) {
    case "win":
      if (winner === me) return ["You win! 🏆", "win"];
      return playing ? [`${winner} wins. Good game!`, "lose"] : [`${winner} wins 🏆`, "plain"];
    case "draw":
      return ["It's a draw 🤝", "plain"];
    case "forfeit":
      return winner === me ? [`You win! ${loser} left 🏆`, "win"] : [`${winner} wins, ${loser} left`, "plain"];
    default:
      return [`${o} said no`, "lose"];
  }
}

/** The line under the result: who still has to decide about another round. */
function rematchNote(game: XoGame, me: string, other: string | null): string | null {
  if (game.status !== "over" || !other) return null;
  // A forfeit or a no already says that they left.
  if (game.left.includes(other)) return game.result === "win" || game.result === "draw" ? `${other} left` : null;
  if (game.rematch.includes(me)) return `Waiting for ${other} to decide…`;
  return game.rematch.includes(other) ? `${other} wants to play again` : null;
}

/** Online members of the group, ticked to invite several at once. Someone who said no can be asked again. */
function InvitePicker({ game, me, chat, report, onDone }: {
  game: XoGame;
  me: string;
  chat: ChatApi;
  report: Report;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const members = chat.groups.find((g) => groupRoomId(g.id) === game.roomId)?.members ?? [];
  const choices = members.filter(
    (name) =>
      name !== me && chat.users.includes(name) && (!game.invitees.includes(name) || game.declined.includes(name)),
  );
  const toggle = (name: string, on: boolean) =>
    setPicked((prev) => (on ? [...prev, name] : prev.filter((n) => n !== name)));

  const send = async () => {
    const error = await chat.askGame(game.id, picked);
    report(error);
    if (!error) onDone();
  };

  if (choices.length === 0) return <p className="xo-note">No other members of this group are online right now</p>;
  return (
    <fieldset className="xo-picker">
      <legend>Invite friends (online now)</legend>
      <div className="xo-pick-list">
        {choices.map((name) => (
          <label key={name} className="xo-pick">
            <input type="checkbox" checked={picked.includes(name)} onChange={(e) => toggle(name, e.target.checked)} />
            <span>{name}</span>
          </label>
        ))}
      </div>
      <button type="button" className="primary" disabled={picked.length === 0} onClick={send}>
        {picked.length > 0 ? `Invite ${picked.length}` : "Invite"}
      </button>
    </fieldset>
  );
}

/** One game, shown in its chat room below the messages. */
export function XoGameCard({
  game,
  me,
  chat,
  report,
}: {
  game: XoGame;
  me: string;
  chat: ChatApi;
  report: Report;
}) {
  const myMark: XoMark | null = me === game.x ? "X" : me === game.o ? "O" : null;
  const other = myMark === "X" ? game.o : myMark === "O" ? game.x : null;
  const myTurn = game.status === "playing" && game.turn === myMark;
  const canAnswer = game.status === "invited" && me !== game.x && showsGame(game, me);
  // After a round: both still here choose play again or leave; alone, invite again or leave.
  const deciding = game.status === "over" && myMark !== null;
  const alone = deciding && other !== null && game.left.includes(other);
  const asked = game.rematch.includes(me);
  const inGroup = game.roomId.startsWith("group:");
  // A new group invite opens with the member list, since nobody is asked yet.
  const canPick = game.status === "invited" && inGroup && me === game.x;
  const [picking, setPicking] = useState(game.invitees.length === 0);
  const [text, tone] = describe(game, me);
  const note = myMark ? rematchNote(game, me, other) : null;
  const winning = new Set(game.winLine ?? []);
  const run = async (action: Promise<Result>) => report(await action);

  return (
    <section
      className={`xo-card ${game.status}${game.winLine ? " decided" : ""}`}
      aria-label={`XO game: ${game.x} against ${game.o ?? "an open seat"}`}
    >
      <header className="xo-head">
        <span className="xo-title">🎮 XO</span>
        {game.status === "over" && !myMark && (
          <button className="xo-close" title="Close" aria-label="Close game" onClick={() => chat.dismissGame(game.id)}>
            ✕
          </button>
        )}
      </header>
      <div className="xo-players">
        <Player name={game.x} mark="X" me={me} active={game.status === "playing" && game.turn === "X"} />
        <span className="xo-vs">vs</span>
        <Player name={game.o} mark="O" me={me} active={game.status === "playing" && game.turn === "O"} />
      </div>

      <p className={`xo-status ${tone}`} aria-live="polite">
        {text}
      </p>
      {note && <p className="xo-note">{note}</p>}

      <div className="xo-board">
        {game.board.map((cell, i) => (
          <button
            key={i}
            className={winning.has(i) ? "xo-cell win" : "xo-cell"}
            disabled={!myTurn || cell !== null}
            data-ghost={myTurn && cell === null ? myMark : undefined}
            aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${cell ?? "empty"}`}
            onClick={() => run(chat.moveGame(game.id, i))}
          >
            {cell && <Mark mark={cell} />}
          </button>
        ))}
      </div>

      {game.status === "invited" && game.declined.length > 0 && (
        <p className="xo-note">Said no: {game.declined.join(", ")}</p>
      )}
      {canPick && picking && (
        <InvitePicker game={game} me={me} chat={chat} report={report} onDone={() => setPicking(false)} />
      )}

      <div className="xo-actions">
        {canPick && !picking && (
          <button className="primary" onClick={() => setPicking(true)}>
            Invite friends
          </button>
        )}
        {canAnswer && (
          <>
            <button className="primary" onClick={() => run(chat.respondGame(game.id, true))}>
              Accept
            </button>
            <button className="xo-secondary" onClick={() => run(chat.respondGame(game.id, false))}>
              Decline
            </button>
          </>
        )}
        {game.status === "invited" && me === game.x && (
          <button className="xo-secondary" onClick={() => run(chat.leaveGame(game.id))}>
            Cancel invite
          </button>
        )}
        {game.status === "playing" && myMark && (
          <button className="link" onClick={() => window.confirm("Resign this game?") && run(chat.leaveGame(game.id))}>
            Resign
          </button>
        )}
        {deciding && (
          <>
            {alone ? (
              <button className="primary" onClick={() => run(chat.inviteGame(game.roomId))}>
                {inGroup ? "Invite friends" : "Invite again"}
              </button>
            ) : (
              <button className="primary" disabled={asked} onClick={() => run(chat.rematchGame(game.id))}>
                {asked ? "Waiting…" : "Play again"}
              </button>
            )}
            <button className="xo-secondary" onClick={() => run(chat.leaveGame(game.id))}>
              Leave
            </button>
          </>
        )}
      </div>
    </section>
  );
}
