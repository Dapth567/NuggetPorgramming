import { createChatServer } from "./chat-server.js";

const PORT = Number(process.env.PORT ?? 3000);

if (!process.env.GEMINI_API_KEY) console.warn("[ai] GEMINI_API_KEY is not set: the AI will say it is not set up.");

const { httpServer } = createChatServer();

// 0.0.0.0 accepts connections from other computers, not just this one (R1).
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Chat server listening on port ${PORT}`);
});
