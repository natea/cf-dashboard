// dashboard/server/routes/health.ts
// Health check endpoint for monitoring and load balancers

import { Hono } from "hono";
import type { ClaimsStorage } from "../storage/interface";
import { getConfig } from "../config";

export interface HealthRoutesDeps {
  storage: ClaimsStorage;
  startTime: Date;
}

export function createHealthRoutes(deps: HealthRoutesDeps) {
  const health = new Hono();
  const config = getConfig();

  // Basic health check - always returns 200 if server is running
  // Format: { status: 'ok', db: 'connected' } for Docker HEALTHCHECK
  health.get("/", async (c) => {
    // Quick DB check
    let dbStatus: "connected" | "disconnected" = "disconnected";
    try {
      await deps.storage.listClaims({ status: "active" });
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }

    return c.json({
      status: "ok",
      db: dbStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed health check with dependencies
  health.get("/ready", async (c) => {
    const checks: Record<string, { status: "ok" | "error"; message?: string; latencyMs?: number }> = {};

    // Check storage connectivity
    const storageStart = Date.now();
    try {
      await deps.storage.listClaims({ status: "active" });
      checks.storage = {
        status: "ok",
        latencyMs: Date.now() - storageStart,
      };
    } catch (error) {
      checks.storage = {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - storageStart,
      };
    }

    const allHealthy = Object.values(checks).every((check) => check.status === "ok");

    return c.json(
      {
        status: allHealthy ? "ready" : "degraded",
        timestamp: new Date().toISOString(),
        checks,
      },
      allHealthy ? 200 : 503
    );
  });

  // Liveness check - basic server info
  health.get("/live", (c) => {
    const uptime = Date.now() - deps.startTime.getTime();
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    return c.json({
      status: "alive",
      timestamp: new Date().toISOString(),
      uptime: {
        ms: uptime,
        formatted: `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`,
      },
      environment: config.server.env,
      version: process.env.npm_package_version ?? "0.1.0",
    });
  });

  return health;
}
