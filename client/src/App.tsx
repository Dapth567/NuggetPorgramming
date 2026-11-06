import { useEffect, useState } from "react";
import { SERVER_URL, socket } from "./socket";

export function App() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <main>
      <h1>Socket Chat</h1>
      <p>
        {SERVER_URL}: {connected ? "connected" : "disconnected"}
      </p>
    </main>
  );
}
