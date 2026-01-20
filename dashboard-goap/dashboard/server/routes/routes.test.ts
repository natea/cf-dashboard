// dashboard/server/routes/routes.test.ts
// Integration tests for Hono routes

import { describe, test, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { MemoryStorage } from "../storage/memory";
import { createHealthRoutes } from "./health";
import { createClaimsRoutes } from "./claims";
import { createAuthRoutes, authMiddleware } from "./auth";

describe("Health Routes", () => {
  const storage = new MemoryStorage();
  const startTime = new Date();
  const healthApp = new Hono();
  healthApp.route("/health", createHealthRoutes({ storage, startTime }));

  test("GET /health returns healthy status", async () => {
    const res = await healthApp.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(body.timestamp).toBeDefined();
  });

  test("GET /health/ready checks storage", async () => {
    const res = await healthApp.request("/health/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.checks.storage.status).toBe("ok");
  });

  test("GET /health/live returns uptime info", async () => {
    const res = await healthApp.request("/health/live");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("alive");
    expect(body.uptime).toBeDefined();
    expect(body.uptime.ms).toBeGreaterThan(0);
  });
});

describe("Claims Routes", () => {
  let storage: MemoryStorage;
  let claimsApp: Hono;

  beforeEach(() => {
    storage = new MemoryStorage();
    claimsApp = new Hono();
    // Note: Auth is disabled by default in development mode
    claimsApp.route("/api/claims", createClaimsRoutes({ storage }));
  });

  test("POST /api/claims creates a claim", async () => {
    const res = await claimsApp.request("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: "issue-1",
        source: "manual",
        title: "Test Claim",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.issueId).toBe("issue-1");
    expect(body.title).toBe("Test Claim");
    expect(body.status).toBe("backlog");
    expect(body.progress).toBe(0);
    expect(body.id).toBeDefined();
  });

  test("GET /api/claims lists all claims", async () => {
    // Create a claim first
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await claimsApp.request("/api/claims");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  test("GET /api/claims/:issueId returns single claim", async () => {
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await claimsApp.request("/api/claims/issue-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issueId).toBe("issue-1");
  });

  test("GET /api/claims/:issueId returns 404 for missing claim", async () => {
    const res = await claimsApp.request("/api/claims/nonexistent");
    expect(res.status).toBe(404);
  });

  test("PUT /api/claims/:issueId updates claim", async () => {
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await claimsApp.request("/api/claims/issue-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "active",
        progress: 50,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
    expect(body.progress).toBe(50);
  });

  test("DELETE /api/claims/:issueId removes claim", async () => {
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await claimsApp.request("/api/claims/issue-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const getRes = await claimsApp.request("/api/claims/issue-1");
    expect(getRes.status).toBe(404);
  });

  test("POST /api/claims/:issueId/claim assigns claimant", async () => {
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await claimsApp.request("/api/claims/issue-1/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimant: {
          type: "agent",
          agentId: "coder-1",
          agentType: "coder",
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claimant?.type).toBe("agent");
    expect(body.claimant?.agentId).toBe("coder-1");
    expect(body.status).toBe("active");
  });

  test("POST /api/claims/:issueId/release removes claimant", async () => {
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "active",
      progress: 50,
      claimant: { type: "agent", agentId: "coder-1", agentType: "coder" },
    });

    const res = await claimsApp.request("/api/claims/issue-1/release", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claimant).toBeUndefined();
    expect(body.status).toBe("backlog");
  });

  test("POST /api/claims/:issueId/progress updates progress", async () => {
    await storage.createClaim({
      issueId: "issue-1",
      source: "manual",
      title: "Test",
      status: "active",
      progress: 0,
    });

    const res = await claimsApp.request("/api/claims/issue-1/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: 75 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toBe(75);
  });

  test("filters claims by status", async () => {
    await storage.createClaim({ issueId: "1", source: "manual", title: "A", status: "backlog", progress: 0 });
    await storage.createClaim({ issueId: "2", source: "manual", title: "B", status: "active", progress: 0 });
    await storage.createClaim({ issueId: "3", source: "manual", title: "C", status: "active", progress: 0 });

    const res = await claimsApp.request("/api/claims?status=active");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claims).toHaveLength(2);
  });

  test("validates claim creation input", async () => {
    const res = await claimsApp.request("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Missing required fields
        source: "invalid-source",
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("Auth Routes", () => {
  const authApp = new Hono();
  authApp.route("/auth", createAuthRoutes());

  test("GET /auth/status returns auth configuration", async () => {
    const res = await authApp.request("/auth/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBeDefined();
    expect(body.headerName).toBeDefined();
  });
});
