// dashboard/server/routes/auth.ts
// Simple shared secret authentication middleware and routes

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { getConfig } from "../config";

// Extend Hono context with auth info
declare module "hono" {
  interface ContextVariableMap {
    authValid: boolean;
    authType: "shared-secret" | "token" | "none";
    authUser?: { id: string; name: string };
  }
}

// In-memory token store: token -> user info
const tokenStore = new Map<string, { id: string; name: string }>();

/**
 * Authentication middleware
 * Validates shared secret from header or query param
 */
export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const config = getConfig();

    // Skip auth if disabled
    if (!config.auth.enabled) {
      c.set("authValid", true);
      c.set("authType", "none");
      return next();
    }

    // Check for shared secret
    const secret = config.auth.sharedSecret;
    if (!secret) {
      // No secret configured but auth is enabled - reject all
      throw new HTTPException(500, {
        message: "Authentication is enabled but no secret is configured",
      });
    }

    // Get token from header or query
    const headerToken = c.req.header(config.auth.headerName);
    const queryToken = c.req.query("token");
    const providedToken = headerToken ?? queryToken;

    if (!providedToken) {
      throw new HTTPException(401, {
        message: "Authentication required. Provide token in header or query.",
      });
    }

    // Check token store first (issued tokens from login)
    const user = tokenStore.get(providedToken);
    if (user) {
      c.set("authValid", true);
      c.set("authType", "token");
      c.set("authUser", user);
      return next();
    }

    // Fall back to shared secret comparison
    if (!timingSafeEqual(providedToken, secret)) {
      throw new HTTPException(403, {
        message: "Invalid authentication token",
      });
    }

    c.set("authValid", true);
    c.set("authType", "shared-secret");
    return next();
  };
}

/**
 * Constant-time string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to maintain constant time
    compareStrings(a, a);
    return false;
  }
  return compareStrings(a, b);
}

function compareStrings(a: string, b: string): boolean {
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Create auth routes for token validation
 */
export function createAuthRoutes() {
  const auth = new Hono();
  const config = getConfig();

  // Check if auth is required
  auth.get("/status", (c) => {
    return c.json({
      enabled: config.auth.enabled,
      headerName: config.auth.headerName,
    });
  });

  // Login endpoint - validates secret and returns user info
  auth.post("/login", async (c) => {
    const body = await c.req.json();
    const { name, secret } = body;

    if (!name || typeof name !== "string") {
      throw new HTTPException(400, { message: "Name is required" });
    }

    // If auth is disabled, allow any login
    if (!config.auth.enabled) {
      return c.json({
        id: `user-${Date.now()}`,
        name,
        token: "no-auth-required",
      });
    }

    // Validate shared secret
    const expectedSecret = config.auth.sharedSecret;
    if (!expectedSecret) {
      throw new HTTPException(500, { message: "Auth not configured" });
    }

    if (!secret || !timingSafeEqual(secret, expectedSecret)) {
      throw new HTTPException(401, { message: "Invalid credentials" });
    }

    // Generate a unique session token instead of returning the shared secret
    const userId = `user-${Date.now()}`;
    const token = crypto.randomUUID();
    tokenStore.set(token, { id: userId, name });

    return c.json({
      id: userId,
      name,
      token,
    });
  });

  // Verify endpoint - validates token from Authorization header
  auth.get("/verify", (c) => {
    // If auth is disabled, return a default user
    if (!config.auth.enabled) {
      return c.json({
        id: "default-user",
        name: "User",
        token: "no-auth-required",
      });
    }

    // Get token from Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "No token provided" });
    }

    const token = authHeader.substring(7);

    // Check token store first
    const user = tokenStore.get(token);
    if (user) {
      return c.json({
        id: user.id,
        name: user.name,
        token,
      });
    }

    // Fall back to shared secret validation
    const expectedSecret = config.auth.sharedSecret;
    if (!expectedSecret || !timingSafeEqual(token, expectedSecret)) {
      throw new HTTPException(401, { message: "Invalid token" });
    }

    return c.json({
      id: "authenticated-user",
      name: "Authenticated User",
      token,
    });
  });

  // Validate token endpoint (requires auth)
  auth.get("/validate", authMiddleware(), (c) => {
    return c.json({
      valid: c.get("authValid"),
      type: c.get("authType"),
      timestamp: new Date().toISOString(),
    });
  });

  return auth;
}

