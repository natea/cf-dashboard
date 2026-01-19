// dashboard/server/middleware/auth.ts
import type { Context, Next } from "hono";
import { timingSafeEqual } from "crypto";

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function validateSecret(provided: string, expected: string): boolean {
  // Normalize to same length for timing-safe comparison
  const maxLen = Math.max(provided.length, expected.length);
  const a = Buffer.from(provided.padEnd(maxLen, "\0"));
  const b = Buffer.from(expected.padEnd(maxLen, "\0"));

  // Even if lengths differ, we still do the full comparison
  const lengthsMatch = provided.length === expected.length;
  const contentsMatch = timingSafeEqual(a, b);

  return lengthsMatch && contentsMatch;
}

/**
 * Simple shared secret authentication middleware
 *
 * Accepts token via:
 * - Authorization: Bearer <token>
 * - Query param: ?token=<token>
 *
 * Configure secret via DASHBOARD_SECRET env var or constructor
 */
export function authMiddleware(secret: string) {
  return async (c: Context, next: Next) => {
    // Check Authorization header first
    const authHeader = c.req.header("Authorization");
    let token: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else {
      // Fall back to query param (useful for WebSocket)
      token = c.req.query("token");
    }

    if (!token) {
      return c.json({ error: "Missing authorization header" }, 401);
    }

    if (!validateSecret(token, secret)) {
      return c.json({ error: "Invalid token" }, 401);
    }

    await next();
  };
}

/**
 * Creates auth middleware from environment variable
 */
export function createAuthMiddleware() {
  const secret = process.env.DASHBOARD_SECRET;

  if (!secret) {
    console.warn("⚠️  DASHBOARD_SECRET not set - authentication disabled!");
    return async (_c: Context, next: Next) => next();
  }

  return authMiddleware(secret);
}
