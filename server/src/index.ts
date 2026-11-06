import { createChatServer } from "./chat-server.js";

const PORT = Number(process.env.PORT ?? 3000);

const { httpServer } = createChatServer();

// 0.0.0.0 accepts connections from other computers, not just this one (R1).
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Chat server listening on port ${PORT}`);
});
