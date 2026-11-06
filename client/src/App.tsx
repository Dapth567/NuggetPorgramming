import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  dmRoomId,
  groupRoomId,
  LIMITS,
  type ChatMessage,
  type ErrorCode,
  type GroupInfo,
} from "@chat/shared";
import { socket } from "./socket";

type Room = { kind: "dm"; name: string } | { kind: "group"; id: string };

const ERROR_TEXT: Record<ErrorCode, string> = {
  INVALID_INPUT: "Invalid input",
  NOT_LOGGED_IN: "You are not logged in",
  NAME_TAKEN: "This name is already taken",
  WRONG_CREDENTIALS: "Wrong username or password",
  ALREADY_ONLINE: "This account is already online",
  USER_NOT_FOUND: "User not found",
  GROUP_NOT_FOUND: "Group not found",
  NOT_A_MEMBER: "You are not a member of this group",
  ALREADY_A_MEMBER: "You are already a member of this group",
  SERVER_ERROR: "Server error",
  NOT_IMPLEMENTED: "This feature is not available yet",
};

function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
    };
  }, []);
  return connected;
}

function LoginScreen({ connected, onLogin }: { connected: boolean; onLogin: (name: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const login = () => {
    socket.emit("auth:login", { name, password }, (res) => {
      setBusy(false);
      if (res.ok) onLogin(res.data.name);
      else setError(ERROR_TEXT[res.error]);
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (mode === "login") return login();
    socket.emit("auth:register", { name, password }, (res) => {
      if (res.ok) login();
      else {
        setBusy(false);
        setError(ERROR_TEXT[res.error]);
      }
    });
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
        <button className="primary" disabled={!connected || busy || !name || !password}>
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
        {!connected && <p className="hint">Connecting to server...</p>}
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

// Dev-only sample data so the chat screen can be viewed without a server.
const PREVIEW_ME = "you";
const PREVIEW_GROUP: GroupInfo = { id: "g1", name: "Study group", createdBy: "alice", members: ["alice", "you", "bob"] };
const at = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const PREVIEW_MESSAGES: Record<string, ChatMessage[]> = {
  [dmRoomId(PREVIEW_ME, "alice")]: [
    { id: "1", roomId: dmRoomId(PREVIEW_ME, "alice"), sender: "alice", text: "Hi! How is the project going?", sentAt: at(9) },
    { id: "2", roomId: dmRoomId(PREVIEW_ME, "alice"), sender: PREVIEW_ME, text: "The UI is done, I just need to connect the server", sentAt: at(7) },
    { id: "3", roomId: dmRoomId(PREVIEW_ME, "alice"), sender: "alice", text: "Great!", sentAt: at(5) },
  ],
  [groupRoomId("g1")]: [
    { id: "4", roomId: groupRoomId("g1"), sender: "bob", text: "What time is the presentation rehearsal tomorrow?", sentAt: at(3) },
    { id: "5", roomId: groupRoomId("g1"), sender: PREVIEW_ME, text: "2 PM", sentAt: at(2) },
  ],
};

function Chat({ me, preview = false }: { me: string; preview?: boolean }) {
  const [users, setUsers] = useState<string[]>(preview ? [me, "alice", "bob"] : []);
  const [groups, setGroups] = useState<GroupInfo[]>(preview ? [PREVIEW_GROUP] : []);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(preview ? PREVIEW_MESSAGES : {});
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const roomId = room ? (room.kind === "dm" ? dmRoomId(me, room.name) : groupRoomId(room.id)) : null;
  const group = room?.kind === "group" ? groups.find((g) => g.id === room.id) : undefined;
  const isMember = room?.kind === "dm" || group?.members.includes(me) === true;

  useEffect(() => {
    if (preview) return;
    const onUsers = (names: string[]) => setUsers(names);
    const onGroups = (list: GroupInfo[]) => setGroups(list);
    const onMessage = (m: ChatMessage) =>
      setMessages((prev) => {
        const list = prev[m.roomId] ?? [];
        return list.some((x) => x.id === m.id) ? prev : { ...prev, [m.roomId]: [...list, m] };
      });
    socket.on("users:list", onUsers);
    socket.on("groups:list", onGroups);
    socket.on("message:new", onMessage);
    return () => {
      socket.off("users:list", onUsers);
      socket.off("groups:list", onGroups);
      socket.off("message:new", onMessage);
    };
  }, [preview]);

  useEffect(() => {
    if (preview || !roomId || !isMember) return;
    socket.emit("room:history", { roomId }, (res) => {
      if (res.ok) setMessages((prev) => ({ ...prev, [roomId]: res.data }));
    });
  }, [preview, roomId, isMember]);

  const current = roomId ? (messages[roomId] ?? []) : [];
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [current.length, roomId]);

  const report = (error: ErrorCode) => {
    setNotice(ERROR_TEXT[error]);
    setTimeout(() => setNotice(""), 3000);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!room || !body) return;
    const done = (res: { ok: boolean; error?: ErrorCode }) => {
      if (!res.ok && res.error) report(res.error);
    };
    setText("");
    if (preview && roomId) {
      const m: ChatMessage = { id: String(Date.now()), roomId, sender: me, text: body, sentAt: new Date().toISOString() };
      setMessages((prev) => ({ ...prev, [roomId]: [...(prev[roomId] ?? []), m] }));
      return;
    }
    if (room.kind === "dm") socket.emit("dm:send", { to: room.name, text: body }, done);
    else socket.emit("group:send", { groupId: room.id, text: body }, done);
  };

  const createGroup = () => {
    if (preview) return;
    const name = window.prompt("Group name")?.trim();
    if (!name) return;
    socket.emit("group:create", { name }, (res) => {
      if (res.ok) setRoom({ kind: "group", id: res.data.id });
      else report(res.error);
    });
  };

  const joinGroup = (groupId: string) => {
    if (preview) return;
    socket.emit("group:join", { groupId }, (res) => {
      if (!res.ok) report(res.error);
    });
  };

  const title = room?.kind === "dm" ? room.name : group?.name;
  const subtitle = group ? group.members.join(", ") : room ? "Direct message" : "";

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <Avatar label={me} />
          <strong>{me}</strong>
        </header>
        <div className="list">
          <div className="section">
            <span>Online ({users.length})</span>
          </div>
          {users
            .filter((n) => n !== me)
            .map((name) => (
              <button
                key={name}
                className={room?.kind === "dm" && room.name === name ? "item active" : "item"}
                onClick={() => setRoom({ kind: "dm", name })}
              >
                <Avatar label={name} />
                <span className="item-name">{name}</span>
                <span className="dot" />
              </button>
            ))}
          <div className="section">
            <span>Groups</span>
            <button className="small" onClick={createGroup}>
              + New
            </button>
          </div>
          {groups.map((g) => (
            <button
              key={g.id}
              className={room?.kind === "group" && room.id === g.id ? "item active" : "item"}
              onClick={() => setRoom({ kind: "group", id: g.id })}
            >
              <Avatar label={g.name} group />
              <span className="item-name">{g.name}</span>
              <span className="count">{g.members.length}</span>
            </button>
          ))}
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
                <button className="primary" onClick={() => joinGroup(room.kind === "group" ? room.id : "")}>
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
  const connected = useConnected();
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (!connected && !preview) setMe(null);
  }, [connected, preview]);

  if (preview) return <Chat me={PREVIEW_ME} preview />;
  return me ? <Chat me={me} /> : <LoginScreen connected={connected} onLogin={setMe} />;
}
