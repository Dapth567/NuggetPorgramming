import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AI_DISPLAY_NAME, AI_NAME, dmRoomId, groupRoomId, LIMITS, NAME_PATTERN, type ErrorCode } from "@chat/shared";
import { toAvatar } from "./avatar";
import { GroupList } from "./components/GroupList";
import { invitesFor, XoBadge, XoGameCard, XoInviteButton } from "./components/XoGame";
import nugget from "./assets/nugget.png";
import aiPhoto from "./assets/ai-mash.jpg";
import { ERROR_TEXT } from "./errors";
import { useChat, type ChatApi } from "./useChat";

type Room = { kind: "dm"; name: string } | { kind: "group"; id: string };

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand-compact" : "brand"}>
      <span className="brand-mark"><img src={nugget} alt="" /></span>
      <span className="brand-name">Nugget <span>Porgramming</span><small>BY CARTOON NETWORK</small></span>
    </div>
  );
}

/**
 * The rules the server checks, said plainly so the user knows what to fix.
 * The server still checks again and answers INVALID_INPUT if anything slips through.
 */
function formProblem(mode: "login" | "register", name: string, password: string): string | null {
  if (!NAME_PATTERN.test(name)) return "Username can only use letters, numbers and _ (no spaces or symbols)";
  if (mode === "register" && password.length < LIMITS.passwordMinLength) {
    return `Password must be at least ${LIMITS.passwordMinLength} characters`;
  }
  return null;
}

function LoginScreen({ chat }: { chat: ChatApi }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = formProblem(mode, name, password);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    let failure = mode === "register" ? await chat.register(name, password) : null;
    if (!failure) failure = await chat.login(name, password);
    setBusy(false);
    if (failure) setError(ERROR_TEXT[failure]);
  };

  return (
    <div className="login">
      <div className="login-shell">
        <section className="login-hero">
          <Brand />
          <div className="hero-copy">
            <h1>Chat with your friends.</h1>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span className="nugget-spark spark-one">✦</span>
            <img src={nugget} alt="" />
            <span className="nugget-spark spark-two">✦</span>
            <span className="nugget-sticker">100% chat</span>
          </div>
        </section>
      <form className="login-card" onSubmit={submit}>
        <div className="login-mobile-brand"><Brand compact /></div>
        <h2>{mode === "login" ? "Log in" : "Sign up"}</h2>
        <label htmlFor="username">USERNAME</label>
        <input
          id="username"
          placeholder="Username"
          autoComplete="username"
          value={name}
          maxLength={LIMITS.nameMaxLength}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label htmlFor="password">PASSWORD</label>
        <input
          id="password"
          type="password"
          placeholder="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && (
          <p className="hint">
            Username: letters, numbers or _ (up to {LIMITS.nameMaxLength}) · Password: at least{" "}
            {LIMITS.passwordMinLength} characters
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={!chat.connected || busy || !name || !password}>
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
        </button>
        {!chat.connected && <p className="hint">Connecting to server...</p>}
      </form>
      </div>
    </div>
  );
}

function Avatar({ label, group, image, small }: {
  label: string;
  group?: boolean;
  image?: string;
  small?: boolean;
}) {
  const className = ["avatar", group && "group", small && "small"].filter(Boolean).join(" ");
  return (
    <span className={className}>
      {image ? <img src={image} alt="" /> : label.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The AI's user name is "AI", but the screen shows its character's name. */
function shownName(name: string) {
  return name === AI_NAME ? AI_DISPLAY_NAME : name;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** "bob is typing", "bob and carol are typing", or "Several people are typing". */
function typingLine(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return "Several people are typing";
}

function ChatScreen({ chat, me }: { chat: ChatApi; me: string }) {
  const { users, groups, messagesByRoom, avatars, openRoom, typingByRoom, notifyTyping, stopTyping } = chat;
  const [room, setRoom] = useState<Room | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const roomId = room ? (room.kind === "dm" ? dmRoomId(me, room.name) : groupRoomId(room.id)) : null;
  const group = room?.kind === "group" ? groups.find((g) => g.id === room.id) : undefined;
  const isMember = room?.kind === "dm" || group?.members.includes(me) === true;
  const current = roomId ? (messagesByRoom[roomId] ?? []) : [];
  // An invite you declined in a group stays open for the others, so only you stop seeing it.
  const roomGames = Object.values(chat.games).filter(
    (g) => g.roomId === roomId && !(g.status === "invited" && g.declined.includes(me)),
  );
  const invites = invitesFor(chat.games, me);
  const typing = roomId
    ? typingLine((typingByRoom[roomId] ?? []).filter((name) => name !== me).map(shownName))
    : null;
  // The AI never logs in, so it cannot upload a photo: its picture ships with the app.
  const photoOf = (name: string) => (name === AI_NAME ? aiPhoto : avatars.get(name));

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 3000);
  };

  const report = (error: ErrorCode | null) => {
    if (error) showNotice(ERROR_TEXT[error]);
  };

  useEffect(() => {
    if (!roomId || !isMember) return;
    openRoom(roomId).then(report);
  }, [roomId, isMember, openRoom]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [current.length, roomId, roomGames.length]);

  // Leaving a room (or logging out) tells it you stopped typing there.
  useEffect(() => stopTyping, [roomId, stopTyping]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!room || !body) return;
    setText("");
    report(room.kind === "dm" ? await chat.sendDm(room.name, body) : await chat.sendGroup(room.id, body));
  };

  const pickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // Or choosing the same file again would not fire this event.
    if (!file) return;
    let image: string;
    try {
      image = await toAvatar(file);
    } catch {
      return showNotice("Could not use that image. Try a different one.");
    }
    report(await chat.changeAvatar(image));
  };

  const createGroup = async () => {
    const name = window.prompt("Group name")?.trim();
    if (!name) return;
    const res = await chat.createGroup(name);
    if ("groupId" in res) setRoom({ kind: "group", id: res.groupId });
    else report(res.error);
  };

  const deleteGroup = async () => {
    if (!group || !window.confirm(`Delete "${group.name}" and all its messages for everyone?`)) return;
    setDeleting(true);
    try {
      report(await chat.deleteGroup(group.id));
    } finally {
      setDeleting(false);
    }
  };

  const deleteMessage = async (messageId: string, messageRoomId: string) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    setDeleting(true);
    try {
      report(await chat.deleteMessage(messageId, messageRoomId));
    } finally {
      setDeleting(false);
    }
  };

  const withAi = room?.kind === "dm" && room.name === AI_NAME;
  const title = room?.kind === "dm" ? shownName(room.name) : group?.name;
  const subtitle = group
    ? group.members.join(", ")
    : withAi ? "AI assistant · Google Gemini" : room ? "Direct message" : "";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand compact /></div>
        <header className="sidebar-head">
          <div className="avatar-control">
            <label className="avatar-edit" title="Change profile photo">
              <Avatar label={me} image={avatars.get(me)} />
              <input
                className="avatar-input"
                type="file"
                accept="image/*"
                aria-label="Change profile photo"
                onChange={pickAvatar}
              />
            </label>
            {avatars.has(me) && (
              <button
                className="avatar-remove"
                type="button"
                title="Remove profile photo"
                aria-label="Remove profile photo"
                onClick={async () => report(await chat.changeAvatar(null))}
              >
                ×
              </button>
            )}
          </div>
          <div className="profile-name"><strong>{me}</strong></div>
          <button className="small logout" onClick={chat.logout}>
            Log out
          </button>
        </header>
        <div className="list">
          {/* Always here: the AI is not a logged-in user, so it is not in the online list (R4). */}
          <div className="section">
            <span>AI ASSISTANT</span>
          </div>
          <button
            className={withAi ? "item ai active" : "item ai"}
            onClick={() => setRoom({ kind: "dm", name: AI_NAME })}
          >
            <Avatar label={AI_NAME} image={aiPhoto} />
            <span className="item-name">{AI_DISPLAY_NAME}</span>
            <span className="ai-tag">Gemini</span>
          </button>
          <div className="section">
            <span>ONLINE <span className="section-count">{users.length}</span></span>
          </div>
          {users.map((name) =>
            name === me ? (
              <div key={name} className="item self">
                <Avatar label={name} image={avatars.get(name)} />
                <span className="item-name">{name} (you)</span>
                <span className="dot" />
              </div>
            ) : (
              <button
                key={name}
                className={room?.kind === "dm" && room.name === name ? "item active" : "item"}
                onClick={() => setRoom({ kind: "dm", name })}
              >
                <Avatar label={name} image={avatars.get(name)} />
                <span className="item-name">{name}</span>
                {invites.has(dmRoomId(me, name)) && <XoBadge />}
                <span className="dot" />
              </button>
            ),
          )}
          <div className="section">
            <span>GROUPS</span>
            <button className="small" onClick={createGroup}>
              + New
            </button>
          </div>
          <GroupList
            groups={groups}
            me={me}
            activeId={room?.kind === "group" ? room.id : undefined}
            invites={invites}
            onOpen={(id) => setRoom({ kind: "group", id })}
          />
        </div>
      </aside>

      <section className="chat">
        {notice && <div className="notice" role="status">{notice}</div>}
        {!room || (room.kind === "group" && chat.deletedGroupIds.has(room.id)) ? (
          <div className="empty">
            <div className="empty-art"><span className="nugget-spark spark-one" aria-hidden="true">✦</span><img src={nugget} alt="" /><span className="nugget-spark spark-two" aria-hidden="true">✦</span></div>
            <h2>Pick a chat to get started</h2>
          </div>
        ) : (
          <>
            <header className="chat-head">
              <Avatar
                label={title ?? "?"}
                group={room.kind === "group"}
                image={room.kind === "dm" ? photoOf(room.name) : undefined}
              />
              <div>
                <strong>{title ?? "Group not found"}</strong>
                <div className="sub">{subtitle}</div>
              </div>
              {group?.createdBy === me && (
                <button className="delete-group" type="button" disabled={deleting} onClick={deleteGroup}>
                  Delete group
                </button>
              )}
            </header>
            <div className="messages">
              {current.map((m, index) => {
                const mine = m.sender === me;
                // A run of messages from one person shows their photo and name only once.
                const first = index === 0 || current[index - 1].sender !== m.sender;
                const className = ["msg", mine && "mine", !first && "followup"].filter(Boolean).join(" ");
                return (
                  <div key={m.id} className={className}>
                    {!mine && (
                      <div className="msg-avatar">
                        {first && <Avatar label={m.sender} image={photoOf(m.sender)} small />}
                      </div>
                    )}
                    <div className="msg-body">
                      {!mine && first && room.kind === "group" && <div className="sender">{shownName(m.sender)}</div>}
                      <div className="bubble">{m.text}</div>
                      <div className="message-meta">
                        <span className="time">{formatTime(m.sentAt)}</span>
                        {mine && (
                          <button className="delete-message" type="button" disabled={deleting}
                            aria-label="Delete message" onClick={() => deleteMessage(m.id, m.roomId)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {roomGames.map((g) => (
                <XoGameCard key={g.id} game={g} me={me} chat={chat} report={report} />
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="typing" aria-live="polite">
              {typing && (
                <>
                  {typing}
                  <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
                </>
              )}
            </div>
            {isMember ? (
              <form className="composer" onSubmit={send}>
                {!withAi && <XoInviteButton chat={chat} me={me} roomId={roomId} report={report} />}
                <input
                  placeholder={room.kind === "group" ? `Type a message, or start with @${AI_NAME} to ask ${AI_DISPLAY_NAME.split(" ")[0]}` : withAi ? `Ask ${AI_DISPLAY_NAME.split(" ")[0]} anything` : "Type a message"}
                  value={text}
                  maxLength={LIMITS.textMaxLength}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (roomId) notifyTyping(roomId, e.target.value.trim().length > 0);
                  }}
                />
                <button className="primary" disabled={!text.trim()}>
                  Send
                </button>
              </form>
            ) : (
              <div className="composer join">
                <button
                  className="primary"
                  onClick={async () => room.kind === "group" && report(await chat.joinGroup(room.id))}
                >
                  Join group
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export function App() {
  // `?preview` skips login and uses sample data. It only works in `npm run dev`.
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const chat = useChat(preview);

  return chat.me ? <ChatScreen chat={chat} me={chat.me} /> : <LoginScreen chat={chat} />;
}
