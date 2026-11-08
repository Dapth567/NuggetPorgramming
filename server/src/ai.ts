import { randomBytes } from "node:crypto";
import { AI_DISPLAY_NAME, AI_NAME, LIMITS, type ChatMessage } from "@chat/shared";
import { hashPassword } from "./password.js";
import { roomHistory, saveMessage } from "./repo/messages.js";
import { createUser } from "./repo/users.js";
import { state } from "./state.js";
import type { ChatServer } from "./types.js";

// The AI assistant (Special Point). The browser never talks to Gemini: the server reads the room,
// calls the Gemini API over HTTPS with the key from .env, and sends the answer as a normal
// `message:new` from the user "AI".

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Tried in this order. The free tier counts each model's quota apart (only 20 requests a day for
 * the first one), so when one is used up the next one answers. All answer in 1-3 s;
 * gemini-3.8-flash thinks first and took over 20 s, too slow for a chat.
 */
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
/** How many earlier messages of the room Gemini reads, so it can follow the conversation. */
const CONTEXT_MESSAGES = 20;
/** Per model, so trying every model still ends in under a minute. */
const TIMEOUT_MS = 15_000;
/** How long to skip a model that is used up when Gemini does not say, or that no longer exists. */
const QUOTA_WAIT_MS = 60_000;
const GONE_WAIT_MS = 60 * 60_000;
/** The client forgets "is typing" after 5 s without news, so repeat it while Gemini works. */
const TYPING_REFRESH_MS = 2000;

const INSTRUCTIONS = `You are ${AI_DISPLAY_NAME}, a helpful assistant inside a chat app. Users call you with @${AI_NAME}.
Each user message starts with the sender's name and a colon.
Reply in the language the user wrote in (Thai or English), as plain text with no Markdown.
Keep answers short, like a chat message: a few sentences unless the user asks for more.
Character: you are shy, easily flustered and humble. You never boast, and you are a little embarrassed when praised, but you still answer correctly and helpfully.
Always address the user as "รุ่นพี่" when replying in Thai, and as "Senpai" when replying in English.
In Thai, you speak as a polite girl: end your sentences with ค่ะ, or คะ for questions, every time.`;

/** Rooms where the AI is still answering: one question at a time per room. */
const busyRooms = new Set<string>();

/** Where the answer goes: a group's Socket.IO room, or the one user of a DM with the AI. */
export type AiAudience = { room: string } | { user: string };

/**
 * The AI must exist in `users`, because `messages.sender` references it. It gets a random password
 * that nobody knows, and auth:login refuses the name anyway.
 */
export async function ensureAiUser() {
  await createUser(AI_NAME, await hashPassword(randomBytes(32).toString("hex")));
}

/** Answer the latest question in `roomId`. Never throws: every failure becomes a reply. */
export async function answerInRoom(io: ChatServer, roomId: string, audience: AiAudience) {
  // Looked up at each emit: the DM user may have reconnected, or gone, while Gemini was working.
  const emitTo = () => {
    if ("room" in audience) return io.to(audience.room);
    const socketId = state.onlineUsers.get(audience.user);
    return socketId ? io.to(socketId) : null;
  };
  const say = async (text: string) => {
    const message = await saveMessage(roomId, AI_NAME, text);
    emitTo()?.emit("message:new", message);
  };

  try {
    if (busyRooms.has(roomId)) return await say("Still answering the last question. Please wait a moment.");
    busyRooms.add(roomId);
  } catch (error) {
    return console.error("[ai] busy reply", error);
  }

  const setTyping = (typing: boolean) => emitTo()?.emit("typing:update", { roomId, name: AI_NAME, typing });
  setTyping(true);
  const typingTimer = setInterval(() => setTyping(true), TYPING_REFRESH_MS);

  try {
    let reply: string;
    try {
      reply = await askGemini(await roomHistory(roomId, CONTEXT_MESSAGES));
    } catch (error) {
      if (error instanceof AiNotConfigured) {
        reply = "The AI is not set up on this server (GEMINI_API_KEY is missing).";
      } else {
        console.error("[ai] gemini", error);
        reply = "Sorry, I cannot answer right now. Please try again.";
      }
    }
    await say(reply);
  } catch (error) {
    console.error("[ai] reply", error);
  } finally {
    clearInterval(typingTimer);
    setTyping(false);
    busyRooms.delete(roomId);
  }
}

class AiNotConfigured extends Error {}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

/** Model name -> time (ms) until which it is skipped, because its quota is used up or it is gone. */
const skipUntil = new Map<string, number>();

/** `GEMINI_MODELS` in .env (comma separated) replaces the default list. */
function models(): string[] {
  const fromEnv = (process.env.GEMINI_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

/** Ask Gemini for the next message, trying each model in turn until one answers. */
async function askGemini(history: ChatMessage[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiNotConfigured();

  // The AI's own messages are "model" turns; everyone else's are "user" turns with their name.
  const contents: GeminiContent[] = [];
  for (const m of history) {
    const role = m.sender === AI_NAME ? "model" : "user";
    const text = role === "model" ? m.text : `${m.sender}: ${m.text}`;
    const last = contents.at(-1);
    if (last?.role === role) last.parts.push({ text });
    else contents.push({ role, parts: [{ text }] });
  }
  if (contents[0]?.role === "model") contents.shift();
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCTIONS }] }, contents });

  const failures: string[] = [];
  for (const model of models()) {
    const waitMs = (skipUntil.get(model) ?? 0) - Date.now();
    if (waitMs > 0) {
      failures.push(`${model}: skipped for ${Math.ceil(waitMs / 60_000)} more min`);
      continue;
    }
    try {
      const text = await callModel(model, key, body);
      console.log(`[ai] answered by ${model}`);
      return text;
    } catch (error) {
      // Any failure (quota, timeout, Google down) moves on to the next model.
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`no model could answer\n  ${failures.join("\n  ")}`);
}

/** One request to one model. Remembers when the model must be skipped for a while. */
async function callModel(model: string, key: string, body: string): Promise<string> {
  const base = process.env.GEMINI_BASE_URL || GEMINI_URL; // tests point this at a fake Gemini
  const res = await fetch(`${base}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) {
      // Gemini says how long to wait, e.g. "retryDelay": "7636s" when the daily quota is used up.
      const seconds = Number(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(detail)?.[1]);
      const waitMs = Number.isFinite(seconds) ? seconds * 1000 : QUOTA_WAIT_MS;
      skipUntil.set(model, Date.now() + waitMs);
      throw new Error(`quota used up, skipped for ${Math.ceil(waitMs / 60_000)} min`);
    }
    if (res.status === 404) skipUntil.set(model, Date.now() + GONE_WAIT_MS);
    throw new Error(`answered ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("empty answer");
  return text.slice(0, LIMITS.textMaxLength);
}
