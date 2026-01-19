// dashboard/server/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { claimsRoutes } from "./routes/claims";
import { MemoryStorage } from "./storage/memory";

const app = new Hono();
const storage = new MemoryStorage();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// API routes
app.route("/api/claims", claimsRoutes(storage));

// Start server
const port = parseInt(process.env.PORT || "3000");
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
