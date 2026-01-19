// dashboard/server/routes/claims.ts
import { Hono } from "hono";
import { z } from "zod";
import type { ClaimsStorage } from "../storage/interface";

const CreateClaimSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  source: z.enum(["github", "manual", "mcp"]).default("manual"),
  sourceRef: z.string().optional(),
});

const UpdateClaimSchema = z.object({
  status: z.enum(["backlog", "active", "paused", "blocked", "review-requested", "completed"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  context: z.string().optional(),
  claimant: z.string().optional(),
});

export function claimsRoutes(storage: ClaimsStorage): Hono {
  const app = new Hono();

  // List claims
  app.get("/", async (c) => {
    const status = c.req.query("status");
    const source = c.req.query("source");

    const claims = await storage.listClaims({
      status: status as any,
      source: source as any,
    });

    return c.json({ claims });
  });

  // Get single claim
  app.get("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const claim = await storage.getClaim(issueId);

    if (!claim) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({ claim });
  });

  // Create claim
  app.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = CreateClaimSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }

    const claim = await storage.createClaim({
      ...parsed.data,
      status: "backlog",
      progress: 0,
    });

    return c.json({ claim }, 201);
  });

  // Update claim
  app.patch("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const body = await c.req.json();
    const parsed = UpdateClaimSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }

    const claim = await storage.updateClaim(issueId, parsed.data);

    if (!claim) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({ claim });
  });

  // Delete claim
  app.delete("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const deleted = await storage.deleteClaim(issueId);

    if (!deleted) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({ success: true });
  });

  return app;
}
