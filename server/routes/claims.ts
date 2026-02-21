// dashboard/server/routes/claims.ts
// Claims CRUD routes with Zod validation

import { Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import type { ClaimsStorage, ClaimFilter } from "../storage/interface";
import type { ClaimStatus, ClaimSource, Claimant, Claim } from "../domain/types";
import { authMiddleware } from "./auth";
import { hub } from "../ws/hub";
import type { ClaimCreatedEvent, ClaimUpdatedEvent, ClaimDeletedEvent } from "../ws/types";

// Zod schemas for validation
const ClaimantSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("human"),
    userId: z.string().min(1),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal("agent"),
    agentId: z.string().min(1),
    agentType: z.string().min(1),
  }),
]);

const ClaimStatusSchema = z.enum([
  "backlog",
  "active",
  "paused",
  "blocked",
  "review-requested",
  "completed",
]);

const ClaimSourceSchema = z.enum(["github", "manual", "mcp"]);

const CreateClaimSchema = z.object({
  issueId: z.string().min(1),
  source: ClaimSourceSchema,
  sourceRef: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: ClaimStatusSchema.optional().default("backlog"),
  claimant: ClaimantSchema.optional(),
  progress: z.number().min(0).max(100).optional().default(0),
  context: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateClaimSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: ClaimStatusSchema.optional(),
  claimant: ClaimantSchema.optional().nullable(),
  progress: z.number().min(0).max(100).optional(),
  context: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ClaimFilterSchema = z.object({
  status: ClaimStatusSchema.optional(),
  source: ClaimSourceSchema.optional(),
  claimantType: z.enum(["human", "agent"]).optional(),
});

export interface ClaimsRoutesDeps {
  storage: ClaimsStorage;
}

/**
 * Helper to find a claim by id or issueId.
 * Frontend uses claim.id, but storage keys by issueId.
 */
async function findClaim(storage: ClaimsStorage, identifier: string) {
  // First try direct lookup by issueId
  const claim = await storage.getClaimByIssueId(identifier);
  if (claim) return claim;

  // Fallback: search by internal id field
  const allClaims = await storage.listClaims();
  return allClaims.find((c) => c.id === identifier) ?? null;
}

/**
 * Broadcast claim created event to WebSocket clients
 */
function broadcastClaimCreated(claim: Claim): void {
  const event: ClaimCreatedEvent = {
    type: "claim.created",
    claim,
  };
  hub.broadcast(event);
}

/**
 * Broadcast claim updated event to WebSocket clients
 */
function broadcastClaimUpdated(claim: Claim, changes: Partial<Claim>): void {
  const event: ClaimUpdatedEvent = {
    type: "claim.updated",
    claim,
    changes,
  };
  hub.broadcast(event);
}

/**
 * Broadcast claim deleted event to WebSocket clients
 */
function broadcastClaimDeleted(issueId: string): void {
  const event: ClaimDeletedEvent = {
    type: "claim.deleted",
    issueId,
  };
  hub.broadcast(event);
}

/**
 * Validate claim state consistency:
 * - "active" status requires a claimant
 * - Removing claimant should reset status to "backlog"
 */
function validateClaimState(
  existing: Claim | null,
  updates: Partial<Claim>
): Partial<Claim> {
  const newStatus = updates.status ?? existing?.status;
  const newClaimant = updates.claimant !== undefined ? updates.claimant : existing?.claimant;

  // Moving to backlog should always clear the claimant
  if (newStatus === "backlog" && existing?.claimant && updates.claimant === undefined) {
    return { ...updates, claimant: undefined };
  }

  // If setting to active without a claimant, reject
  if (newStatus === "active" && !newClaimant) {
    // Auto-correct: reset to backlog if no claimant
    return { ...updates, status: "backlog" };
  }

  // If removing claimant while active, reset to backlog
  if (updates.claimant === undefined && existing?.claimant && newStatus === "active") {
    return { ...updates, status: "backlog" };
  }

  return updates;
}

export function createClaimsRoutes(deps: ClaimsRoutesDeps) {
  const claims = new Hono();

  // Apply auth middleware to all routes
  claims.use("/*", authMiddleware());

  // List claims with optional filters
  claims.get("/", async (c) => {
    const query = c.req.query();

    // Parse and validate filter
    const filterResult = ClaimFilterSchema.safeParse({
      status: query.status,
      source: query.source,
      claimantType: query.claimantType,
    });

    const filter: ClaimFilter = filterResult.success ? filterResult.data : {};

    const claimsList = await deps.storage.listClaims(filter);

    return c.json({
      claims: claimsList,
      count: claimsList.length,
      filter,
    });
  });

  // Get single claim by id or issueId
  claims.get("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const claim = await findClaim(deps.storage, issueId);

    if (!claim) {
      throw new HTTPException(404, {
        message: `Claim not found: ${issueId}`,
      });
    }

    return c.json(claim);
  });

  // Create new claim
  claims.post("/", async (c) => {
    const body = await c.req.json();

    const result = CreateClaimSchema.safeParse(body);
    if (!result.success) {
      throw new HTTPException(400, {
        message: "Validation error",
        cause: result.error.flatten(),
      });
    }

    // Check if claim already exists
    const existing = await deps.storage.getClaim(result.data.issueId);
    if (existing) {
      throw new HTTPException(409, {
        message: `Claim already exists: ${result.data.issueId}`,
      });
    }

    const claim = await deps.storage.createClaim(result.data);

    // Broadcast to WebSocket clients
    broadcastClaimCreated(claim);

    return c.json(claim, 201);
  });

  // Update existing claim
  claims.put("/:issueId", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json();

    const result = UpdateClaimSchema.safeParse(body);
    if (!result.success) {
      throw new HTTPException(400, {
        message: "Validation error",
        cause: result.error.flatten(),
      });
    }

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    // Handle null claimant (unclaim) - convert null to undefined for storage
    const { claimant, ...rest } = result.data;
    let updates: Partial<Claim> = {
      ...rest,
      ...(claimant === null ? { claimant: undefined } : claimant !== undefined ? { claimant } : {}),
    };

    // Validate state consistency (active requires claimant)
    updates = validateClaimState(existing, updates);

    const updated = await deps.storage.updateClaim(existing.issueId, updates);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, updates);
    }

    return c.json(updated);
  });

  // Partial update (PATCH)
  claims.patch("/:issueId", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json();

    const result = UpdateClaimSchema.partial().safeParse(body);
    if (!result.success) {
      throw new HTTPException(400, {
        message: "Validation error",
        cause: result.error.flatten(),
      });
    }

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    // Handle null claimant for PATCH
    const { claimant, ...rest } = result.data;
    let patchUpdates: Partial<Claim> = {
      ...rest,
      ...(claimant === null ? { claimant: undefined } : claimant !== undefined ? { claimant } : {}),
    };

    // Validate state consistency (active requires claimant)
    patchUpdates = validateClaimState(existing, patchUpdates);

    const updated = await deps.storage.updateClaim(existing.issueId, patchUpdates);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, patchUpdates);
    }

    return c.json(updated);
  });

  // Delete claim
  claims.delete("/:issueId", async (c) => {
    const identifier = c.req.param("issueId");

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    const deleted = await deps.storage.deleteClaim(existing.issueId);

    // Broadcast to WebSocket clients
    broadcastClaimDeleted(existing.issueId);

    return c.json({ deleted: true, issueId: existing.issueId });
  });

  // Claim an issue (shorthand for update with claimant)
  claims.post("/:issueId/claim", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json();

    const claimantResult = ClaimantSchema.safeParse(body.claimant);
    if (!claimantResult.success) {
      throw new HTTPException(400, {
        message: "Invalid claimant",
        cause: claimantResult.error.flatten(),
      });
    }

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    if (existing.claimant) {
      throw new HTTPException(409, {
        message: `Issue already claimed by ${existing.claimant.type === "human" ? existing.claimant.name : existing.claimant.agentId}`,
      });
    }

    const changes = {
      claimant: claimantResult.data,
      status: "active" as const,
    };
    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  // Release claim (unclaim)
  claims.post("/:issueId/release", async (c) => {
    const identifier = c.req.param("issueId");

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    const changes = {
      claimant: undefined,
      status: "backlog" as const,
    };
    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  // Update progress
  claims.post("/:issueId/progress", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json();

    const progressResult = z.number().min(0).max(100).safeParse(body.progress);
    if (!progressResult.success) {
      throw new HTTPException(400, {
        message: "Invalid progress value (must be 0-100)",
      });
    }

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    const changes = {
      progress: progressResult.data,
    };
    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  // Update status directly
  claims.put("/:issueId/status", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json();

    const statusResult = ClaimStatusSchema.safeParse(body.status);
    if (!statusResult.success) {
      throw new HTTPException(400, {
        message: "Invalid status value",
        cause: statusResult.error.flatten(),
      });
    }

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    let changes: Partial<Claim> = {
      status: statusResult.data,
    };

    // Validate state consistency (active requires claimant)
    changes = validateClaimState(existing, changes);

    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  // Request review (move to human review)
  claims.post("/:issueId/review", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json().catch(() => ({}));

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    const changes = {
      status: "review-requested" as const,
      metadata: {
        ...existing.metadata,
        reviewNotes: body.notes,
        reviewRequestedAt: new Date().toISOString(),
      },
    };
    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  // Request revision (send back for changes)
  claims.post("/:issueId/revision", async (c) => {
    const identifier = c.req.param("issueId");
    const body = await c.req.json().catch(() => ({}));

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    const changes = {
      status: "active" as const,
      metadata: {
        ...existing.metadata,
        postReview: true,
        revisionNotes: body.notes,
        revisionRequestedAt: new Date().toISOString(),
      },
    };
    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  // Mark as complete
  claims.post("/:issueId/complete", async (c) => {
    const identifier = c.req.param("issueId");

    // Find claim by id or issueId
    const existing = await findClaim(deps.storage, identifier);
    if (!existing) {
      throw new HTTPException(404, {
        message: `Claim not found: ${identifier}`,
      });
    }

    const changes = {
      status: "completed" as const,
      progress: 100,
      metadata: {
        ...existing.metadata,
        completedAt: new Date().toISOString(),
      },
    };
    const updated = await deps.storage.updateClaim(existing.issueId, changes);

    if (updated) {
      // Broadcast to WebSocket clients
      broadcastClaimUpdated(updated, changes);
    }

    return c.json(updated);
  });

  return claims;
}
