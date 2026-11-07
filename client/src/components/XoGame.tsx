import type { ErrorCode, XoGame, XoMark } from "@chat/shared";
import type { ChatApi, Result } from "../useChat";
import "./XoGame.css";

type Report = (error: ErrorCode | null) => void;

/** Rooms where an invite is waiting for `me`, to flag them in the sidebar. */
export function invitesFor(games: Record<string, XoGame>, me: string): Set<string> {
  const waiting = Object.values(games).filter(
    (g) => g.status === "invited" && g.x !== me && (g.o === me || g.o === null) && !g.declined.includes(me),
  );
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
  const busy = Object.values(chat.games).some(
    (g) => (g.status === "playing" && (g.x === me || g.o === me)) || (g.status === "invited" && g.x === me),
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
      <span className="xo-player-name">{name === null ? "Anyone" : name === me ? "You" : name}</span>
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
    if (me === x) return [inGroup ? "Waiting for someone to accept" : `Waiting for ${o} to accept`, "wait"];
    return [inGroup ? `${x} is looking for an opponent` : `${x} wants to play with you`, "plain"];
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
      if (winner === me) return [`You win! ${loser} left 🏆`, "win"];
      return me === loser ? ["You left the game", "lose"] : [`${winner} wins, ${loser} left`, "plain"];
    case "declined":
      return me === x ? [`${o} said no`, "lose"] : ["You said no", "plain"];
    default:
      return me === x ? ["Invite cancelled", "plain"] : [`${x} cancelled the invite`, "plain"];
  }
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
  const myTurn = game.status === "playing" && game.turn === myMark;
  const canAnswer = game.status === "invited" && me !== game.x && (game.o === null || game.o === me);
  const played = game.result === "win" || game.result === "draw" || game.result === "forfeit";
  const canRematch = game.status === "over" && (myMark === "X" || (myMark === "O" && played));
  const [text, tone] = describe(game, me);
  const winning = new Set(game.winLine ?? []);
  const run = async (action: Promise<Result>) => report(await action);

  const rematch = async () => {
    const error = await chat.inviteGame(game.roomId);
    if (!error) chat.dismissGame(game.id);
    report(error);
  };

  return (
    <section
      className={`xo-card ${game.status}${game.winLine ? " decided" : ""}`}
      aria-label={`XO game: ${game.x} against ${game.o ?? "an open seat"}`}
    >
      <header className="xo-head">
        <span className="xo-title">🎮 XO</span>
        {game.status === "over" && (
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

      <div className="xo-actions">
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
        {canRematch && (
          <button className="primary" onClick={rematch}>
            {played ? "Play again" : "Invite again"}
          </button>
        )}
      </div>
    </section>
  );
}
