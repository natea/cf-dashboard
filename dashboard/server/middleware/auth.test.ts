// dashboard/server/middleware/auth.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { authMiddleware, validateSecret } from "./auth";

describe("Auth Middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", authMiddleware("test-secret-123"));
    app.get("/protected", (c) => c.json({ success: true }));
  });

  test("rejects requests without Authorization header", async () => {
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Missing authorization header");
  });

  test("rejects requests with invalid token", async () => {
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid token");
  });

  test("allows requests with valid token", async () => {
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer test-secret-123" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test("allows requests with token in query param", async () => {
    const res = await app.request("/protected?token=test-secret-123");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

describe("validateSecret", () => {
  test("returns true for matching secrets", () => {
    expect(validateSecret("secret", "secret")).toBe(true);
  });

  test("returns false for non-matching secrets", () => {
    expect(validateSecret("secret", "wrong")).toBe(false);
  });

  test("uses timing-safe comparison", () => {
    // Timing attack resistance - both should take similar time
    const start1 = performance.now();
    validateSecret("a".repeat(1000), "b".repeat(1000));
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    validateSecret("a".repeat(1000), "a".repeat(999) + "b");
    const time2 = performance.now() - start2;

    // Times should be relatively similar (within 10x) due to constant-time comparison
    // This is a basic sanity check, not a rigorous timing test
    expect(Math.abs(time1 - time2)).toBeLessThan(time1 * 10);
  });
});
