import { useEffect, useRef, useState, type FormEvent } from "react";
import { dmRoomId, groupRoomId, LIMITS, type ErrorCode } from "@chat/shared";
import { GroupList } from "./components/GroupList";
import { ERROR_TEXT } from "./errors";
import { useChat, type ChatApi } from "./useChat";

type Room = { kind: "dm"; name: string } | { kind: "group"; id: string };

function LoginScreen({ chat }: { chat: ChatApi }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    let failure = mode === "register" ? await chat.register(name, password) : null;
    if (!failure) failure = await chat.login(name, password);
    setBusy(false);
    if (failure) setError(ERROR_TEXT[failure]);
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Socket Chat</h1>
        <input
          placeholder="Username"
          value={name}
          maxLength={LIMITS.nameMaxLength}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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
  );
}

function Avatar({ label, group }: { label: string; group?: boolean }) {
  return <div className={group ? "avatar group" : "avatar"}>{label.slice(0, 1).toUpperCase()}</div>;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function ChatScreen({ chat, me }: { chat: ChatApi; me: string }) {
  const { users, groups, messagesByRoom, openRoom } = chat;
  const [room, setRoom] = useState<Room | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const roomId = room ? (room.kind === "dm" ? dmRoomId(me, room.name) : groupRoomId(room.id)) : null;
  const group = room?.kind === "group" ? groups.find((g) => g.id === room.id) : undefined;
  const isMember = room?.kind === "dm" || group?.members.includes(me) === true;
  const current = roomId ? (messagesByRoom[roomId] ?? []) : [];

  const report = (error: ErrorCode | null) => {
    if (!error) return;
    setNotice(ERROR_TEXT[error]);
    setTimeout(() => setNotice(""), 3000);
  };

  useEffect(() => {
    if (!roomId || !isMember) return;
    openRoom(roomId).then(report);
  }, [roomId, isMember, openRoom]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [current.length, roomId]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!room || !body) return;
    setText("");
    report(room.kind === "dm" ? await chat.sendDm(room.name, body) : await chat.sendGroup(room.id, body));
  };

  const createGroup = async () => {
    const name = window.prompt("Group name")?.trim();
    if (!name) return;
    const res = await chat.createGroup(name);
    if ("groupId" in res) setRoom({ kind: "group", id: res.groupId });
    else report(res.error);
  };

  const title = room?.kind === "dm" ? room.name : group?.name;
  const subtitle = group ? group.members.join(", ") : room ? "Direct message" : "";

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <Avatar label={me} />
          <strong>{me}</strong>
          <button className="small logout" onClick={chat.logout}>
            Log out
          </button>
        </header>
        <div className="list">
          <div className="section">
            <span>Online ({users.length})</span>
          </div>
          {users.map((name) =>
            name === me ? (
              <div key={name} className="item self">
                <Avatar label={name} />
                <span className="item-name">{name} (you)</span>
                <span className="dot" />
              </div>
            ) : (
              <button
                key={name}
                className={room?.kind === "dm" && room.name === name ? "item active" : "item"}
                onClick={() => setRoom({ kind: "dm", name })}
              >
                <Avatar label={name} />
                <span className="item-name">{name}</span>
                <span className="dot" />
              </button>
            ),
          )}
          <div className="section">
            <span>Groups</span>
            <button className="small" onClick={createGroup}>
              + New
            </button>
          </div>
          <GroupList
            groups={groups}
            me={me}
            activeId={room?.kind === "group" ? room.id : undefined}
            onOpen={(id) => setRoom({ kind: "group", id })}
          />
        </div>
      </aside>

      <section className="chat">
        {!room ? (
          <div className="empty">Select a chat to start messaging</div>
        ) : (
          <>
            <header className="chat-head">
              <Avatar label={title ?? "?"} group={room.kind === "group"} />
              <div>
                <strong>{title ?? "Group not found"}</strong>
                <div className="sub">{subtitle}</div>
              </div>
            </header>
            <div className="messages">
              {current.map((m) => (
                <div key={m.id} className={m.sender === me ? "msg mine" : "msg"}>
                  {m.sender !== me && room.kind === "group" && <div className="sender">{m.sender}</div>}
                  <div className="bubble">{m.text}</div>
                  <div className="time">{formatTime(m.sentAt)}</div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {notice && <div className="notice">{notice}</div>}
            {isMember ? (
              <form className="composer" onSubmit={send}>
                <input
                  placeholder="Type a message"
                  value={text}
                  maxLength={LIMITS.textMaxLength}
                  onChange={(e) => setText(e.target.value)}
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
