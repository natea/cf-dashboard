// dashboard/server/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { claimsRoutes } from "./routes/claims";
import { MemoryStorage } from "./storage/memory";
import { WebSocketHub } from "./ws/hub";
import { createAuthMiddleware, validateSecret } from "./middleware/auth";
import { GitHubSync } from "./github/sync";

const app = new Hono();
const storage = new MemoryStorage();
const wsHub = new WebSocketHub();

// Get secret for WebSocket auth
const dashboardSecret = process.env.DASHBOARD_SECRET;

// GitHub sync configuration
const githubOwner = process.env.GITHUB_OWNER;
const githubRepo = process.env.GITHUB_REPO;

if (githubOwner && githubRepo) {
  const githubSync = new GitHubSync(
    {
      owner: githubOwner,
      repo: githubRepo,
      token: process.env.GITHUB_TOKEN,
      labels: process.env.GITHUB_LABELS?.split(",").map((l) => l.trim()),
      pollInterval: parseInt(process.env.GITHUB_POLL_INTERVAL || "60"),
    },
    storage
  );
  githubSync.start();
  console.log(`GitHub sync enabled for ${githubOwner}/${githubRepo}`);
} else {
  console.log("GitHub sync disabled (set GITHUB_OWNER and GITHUB_REPO to enable)");
}

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

// Health check (public - no auth required)
app.get("/health", (c) => c.json({ status: "ok", clients: wsHub.getClientCount() }));

// Root route - helpful message for development
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head><title>Claims Dashboard API</title></head>
      <body style="font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto;">
        <h1>Claims Dashboard API</h1>
        <p>This is the backend API server.</p>
        <h2>Development</h2>
        <p>Run the frontend with: <code>bun run dev:client</code></p>
        <p>Then open: <a href="http://localhost:5173">http://localhost:5173</a></p>
        <h2>API Endpoints</h2>
        <ul>
          <li><a href="/health">/health</a> - Health check</li>
          <li>/api/claims - Claims REST API</li>
          <li>/ws - WebSocket endpoint</li>
        </ul>
      </body>
    </html>
  `);
});

// Auth middleware for protected routes
const authMiddleware = createAuthMiddleware();
app.use("/api/*", authMiddleware);

// API routes
app.route("/api/claims", claimsRoutes(storage));

// Start server with WebSocket support
const port = parseInt(process.env.PORT || "3000");
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade
    if (url.pathname.startsWith("/ws")) {
      // Validate token if DASHBOARD_SECRET is set
      if (dashboardSecret) {
        const token = url.searchParams.get("token");
        if (!token || !validateSecret(token, dashboardSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      // Upgrade to WebSocket
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Handle regular HTTP requests
    return app.fetch(req);
  },
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
