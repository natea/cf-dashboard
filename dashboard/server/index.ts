// dashboard/server/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { claimsRoutes } from "./routes/claims";
import { MemoryStorage } from "./storage/memory";
import { WebSocketHub } from "./ws/hub";

const app = new Hono();
const storage = new MemoryStorage();
const wsHub = new WebSocketHub();

// Subscribe to storage events and broadcast
storage.subscribe((event) => {
  wsHub.broadcastToRoom("board", {
    type: `claim.${event.type}`,
    claim: event.claim,
    changes: event.changes,
  });
});

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", clients: wsHub.getClientCount() }));

// API routes
app.route("/api/claims", claimsRoutes(storage));

// Start server with WebSocket support
const port = parseInt(process.env.PORT || "3000");
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  websocket: {
    open(ws: any) {
      const clientId = nanoid();
      ws.data = { clientId };
      wsHub.addClient(clientId, ws);
      console.log(`Client connected: ${clientId}`);
    },
    message(ws: any, message: string | Buffer) {
      try {
        const data = JSON.parse(message.toString());
        const clientId = ws.data?.clientId;

        switch (data.action) {
          case "subscribe":
            for (const room of data.rooms || []) {
              wsHub.joinRoom(clientId, room);
            }
            break;
          case "unsubscribe":
            for (const room of data.rooms || []) {
              wsHub.leaveRoom(clientId, room);
            }
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
        }
      } catch (e) {
        console.error("Invalid WS message:", e);
      }
    },
    close(ws: any) {
      const clientId = ws.data?.clientId;
      if (clientId) {
        wsHub.removeClient(clientId);
        console.log(`Client disconnected: ${clientId}`);
      }
    },
  },
};
