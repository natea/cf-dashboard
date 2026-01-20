// dashboard/server/index.ts
// Hono server entry point for Claims Dashboard

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { HTTPException } from "hono/http-exception";

import { getConfig } from "./config";
import { createStorage, closeStorage, type ClaimsStorage } from "./storage";
import { createHealthRoutes } from "./routes/health";
import { createAuthRoutes } from "./routes/auth";
import { createClaimsRoutes } from "./routes/claims";
import hooksRoutes from "./routes/hooks";
import { hub, type WebSocketData } from "./ws/hub";
import { createGitHubSyncFromEnv, type GitHubSyncService } from "./github/sync";
import { aggregator } from "./events/aggregator";

// Server state
let storage: ClaimsStorage | null = null;
let githubSync: GitHubSyncService | null = null;
const startTime = new Date();

async function createApp() {
  const config = getConfig();
  const app = new Hono();

  // Initialize storage
  storage = await createStorage(config);

  // Initialize GitHub sync if configured
  githubSync = createGitHubSyncFromEnv(storage);
  if (githubSync) {
    githubSync.start();
  }

  // Connect WebSocket hub to storage for snapshot delivery
  hub.setStorage(storage);
  hub.startHeartbeat();

  // Connect event aggregator to hub for agent activity logs
  // This broadcasts agent events (started, progress, log, completed) to the "logs" room
  aggregator.on((event) => {
    // hub.broadcast() internally calls getEventRooms() to determine target rooms
    hub.broadcast(event);
  });

  // Global middleware
  app.use("*", cors({
    origin: "*", // Configure appropriately for production
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", config.auth.headerName],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 86400,
  }));

  if (config.server.logLevel === "debug") {
    app.use("*", logger());
  }

  app.use("*", prettyJSON());

  // Request ID middleware
  app.use("*", async (c, next) => {
    const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.res.headers.set("X-Request-Id", requestId);
    await next();
  });

  // Mount routes
  app.route("/health", createHealthRoutes({ storage, startTime }));
  app.route("/api/auth", createAuthRoutes());
  app.route("/api/claims", createClaimsRoutes({ storage }));
  app.route("/api/hooks", hooksRoutes);

  // Root endpoint
  app.get("/", (c) => {
    return c.json({
      name: "Claims Dashboard API",
      version: "0.1.0",
      endpoints: {
        health: "/health",
        healthReady: "/health/ready",
        healthLive: "/health/live",
        authStatus: "/api/auth/status",
        authLogin: "/api/auth/login",
        authVerify: "/api/auth/verify",
        claims: "/api/claims",
      },
    });
  });

  // Global error handler
  app.onError((err, c) => {
    console.error("[error]", err);

    if (err instanceof HTTPException) {
      const response: { error: string; status: number; details?: unknown } = {
        error: err.message,
        status: err.status,
      };
      if (err.cause) {
        response.details = err.cause;
      }
      return c.json(response, err.status);
    }

    // Unknown error
    return c.json(
      {
        error: "Internal Server Error",
        status: 500,
        message: config.server.env === "development" ? err.message : undefined,
      },
      500
    );
  });

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: "Not Found",
        status: 404,
        path: c.req.path,
      },
      404
    );
  });

  return app;
}

// Graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`\n[server] Received ${signal}, shutting down gracefully...`);

  // Stop GitHub sync
  if (githubSync) {
    githubSync.stop();
    console.log("[server] GitHub sync stopped");
  }

  // Close WebSocket connections
  hub.closeAll("Server shutdown");
  console.log("[server] WebSocket connections closed");

  if (storage) {
    await closeStorage(storage);
    console.log("[server] Storage connection closed");
  }

  process.exit(0);
}

// Main entry point
async function main() {
  const config = getConfig();

  console.log(`[server] Starting Claims Dashboard API...`);
  console.log(`[server] Environment: ${config.server.env}`);
  console.log(`[server] Database: ${config.database.type}`);
  console.log(`[server] Auth: ${config.auth.enabled ? "enabled" : "disabled"}`);

  const app = await createApp();

  // Register shutdown handlers
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start server with WebSocket support
  const server = Bun.serve<WebSocketData>({
    port: config.server.port,
    hostname: config.server.host,
    fetch(req, server) {
      // Handle WebSocket upgrade
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: {
            id: "",
            subscribedRooms: new Set<string>(),
            connectedAt: new Date(),
          },
        });
        if (upgraded) {
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // Handle regular HTTP requests
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        hub.handleOpen(ws);
      },
      message(ws, message) {
        hub.handleMessage(ws, message);
      },
      close(ws, code, reason) {
        hub.handleClose(ws, code, reason);
      },
    },
  });

  console.log(`[server] Listening on http://${server.hostname}:${server.port}`);
  console.log(`[server] Health check: http://${server.hostname}:${server.port}/health`);
}

// Run if this is the main module
main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});

export { createApp };
