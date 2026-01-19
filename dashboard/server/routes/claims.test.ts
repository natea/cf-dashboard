// dashboard/server/routes/claims.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { claimsRoutes } from "./claims";
import { MemoryStorage } from "../storage/memory";

describe("Claims API", () => {
  let app: Hono;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    app = new Hono();
    app.route("/claims", claimsRoutes(storage));
  });

  test("GET /claims returns empty list", async () => {
    const res = await app.request("/claims");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.claims).toEqual([]);
  });

  test("POST /claims creates a claim", async () => {
    const res = await app.request("/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: "TEST-001",
        title: "Test Issue",
        source: "manual",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.claim.issueId).toBe("TEST-001");
    expect(data.claim.status).toBe("backlog");
  });

  test("PATCH /claims/:issueId updates status", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await app.request("/claims/TEST-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active", progress: 25 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.claim.status).toBe("active");
  });

  test("DELETE /claims/:issueId removes claim", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await app.request("/claims/TEST-001", { method: "DELETE" });
    expect(res.status).toBe(200);

    const check = await storage.getClaim("TEST-001");
    expect(check).toBeNull();
  });
});
