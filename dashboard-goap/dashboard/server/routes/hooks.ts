// dashboard/server/routes/hooks.ts
import { Hono } from "hono";
import { z } from "zod";
import { aggregator } from "../events/aggregator";
import type { HookPayload } from "../events/types";

/**
 * Hook receiver routes for Claude Flow integration
 *
 * Receives callbacks from:
 * - post-task: Agent completed a task
 * - post-edit: Agent edited a file
 * - post-command: Agent ran a command
 * - agent-spawn: Agent spawned
 * - agent-terminate: Agent terminated
 */
const hooks = new Hono();

// ===========================================================================
// Validation Schemas
// ===========================================================================

const hookPayloadSchema = z.object({
  hook: z.string(),
  timestamp: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  success: z.boolean().optional(),
  progress: z.number().min(0).max(100).optional(),
}).passthrough(); // Allow additional fields

const postTaskSchema = hookPayloadSchema.extend({
  hook: z.literal("post-task"),
  taskId: z.string(),
  agentId: z.string(),
  success: z.boolean(),
  progress: z.number(),
});

const postEditSchema = hookPayloadSchema.extend({
  hook: z.literal("post-edit"),
  agentId: z.string(),
  filePath: z.string(),
  success: z.boolean(),
});

const postCommandSchema = hookPayloadSchema.extend({
  hook: z.literal("post-command"),
  agentId: z.string(),
  command: z.string(),
  exitCode: z.number(),
});

const agentSpawnSchema = hookPayloadSchema.extend({
  hook: z.literal("agent-spawn"),
  agentId: z.string(),
  agentType: z.string(),
  taskId: z.string().optional(),
});

const agentTerminateSchema = hookPayloadSchema.extend({
  hook: z.literal("agent-terminate"),
  agentId: z.string(),
  result: z.enum(["success", "failure"]),
  taskId: z.string().optional(),
});

// ===========================================================================
// Routes
// ===========================================================================

/**
 * POST /hooks/event
 *
 * Main entry point for all hook events from Claude Flow
 *
 * @example
 * curl -X POST http://localhost:3000/hooks/event \
 *   -H "Content-Type: application/json" \
 *   -d '{"hook": "post-task", "agentId": "coder-1", "taskId": "issue-123", "success": true, "progress": 100}'
 */
hooks.post("/event", async (c) => {
  const body = await c.req.json();

  // Validate base structure
  const baseResult = hookPayloadSchema.safeParse(body);
  if (!baseResult.success) {
    return c.json(
      {
        error: "Invalid hook payload",
        details: baseResult.error.issues,
      },
      400
    );
  }

  const payload = body as HookPayload;

  // Validate specific hook schemas
  let validatedPayload: HookPayload;
  switch (payload.hook) {
    case "post-task": {
      const result = postTaskSchema.safeParse(payload);
      if (!result.success) {
        return c.json(
          {
            error: "Invalid post-task payload",
            details: result.error.issues,
          },
          400
        );
      }
      validatedPayload = result.data as HookPayload;
      break;
    }

    case "post-edit": {
      const result = postEditSchema.safeParse(payload);
      if (!result.success) {
        return c.json(
          {
            error: "Invalid post-edit payload",
            details: result.error.issues,
          },
          400
        );
      }
      validatedPayload = result.data as HookPayload;
      break;
    }

    case "post-command": {
      const result = postCommandSchema.safeParse(payload);
      if (!result.success) {
        return c.json(
          {
            error: "Invalid post-command payload",
            details: result.error.issues,
          },
          400
        );
      }
      validatedPayload = result.data as HookPayload;
      break;
    }

    case "agent-spawn": {
      const result = agentSpawnSchema.safeParse(payload);
      if (!result.success) {
        return c.json(
          {
            error: "Invalid agent-spawn payload",
            details: result.error.issues,
          },
          400
        );
      }
      validatedPayload = result.data as HookPayload;
      break;
    }

    case "agent-terminate": {
      const result = agentTerminateSchema.safeParse(payload);
      if (!result.success) {
        return c.json(
          {
            error: "Invalid agent-terminate payload",
            details: result.error.issues,
          },
          400
        );
      }
      validatedPayload = result.data as HookPayload;
      break;
    }

    default:
      // Accept unknown hooks but still process them
      validatedPayload = payload;
  }

  // Add timestamp if not present
  if (!validatedPayload.timestamp) {
    validatedPayload.timestamp = new Date().toISOString();
  }

  // Process the hook through the event aggregator
  try {
    aggregator.processHook(validatedPayload);

    return c.json({
      ok: true,
      hook: validatedPayload.hook,
      timestamp: validatedPayload.timestamp,
    });
  } catch (error) {
    console.error("[hooks] Error processing hook:", error);
    return c.json(
      {
        error: "Failed to process hook",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * POST /hooks/batch
 *
 * Batch endpoint for multiple hook events
 *
 * @example
 * curl -X POST http://localhost:3000/hooks/batch \
 *   -H "Content-Type: application/json" \
 *   -d '{"events": [...]}'
 */
hooks.post("/batch", async (c) => {
  const body = await c.req.json();

  if (!body.events || !Array.isArray(body.events)) {
    return c.json(
      {
        error: "Invalid batch payload",
        message: "Expected { events: HookPayload[] }",
      },
      400
    );
  }

  const results: Array<{ ok: boolean; hook?: string; error?: string }> = [];

  for (const event of body.events) {
    const baseResult = hookPayloadSchema.safeParse(event);
    if (!baseResult.success) {
      results.push({
        ok: false,
        error: "Invalid hook payload",
      });
      continue;
    }

    try {
      const payload = event as HookPayload;
      if (!payload.timestamp) {
        payload.timestamp = new Date().toISOString();
      }
      aggregator.processHook(payload);
      results.push({
        ok: true,
        hook: payload.hook,
      });
    } catch (error) {
      results.push({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return c.json({
    processed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

/**
 * GET /hooks/health
 *
 * Health check for hook receiver
 */
hooks.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "hooks",
    timestamp: new Date().toISOString(),
  });
});

// ===========================================================================
// Agent Orchestrator Hook Endpoint
// ===========================================================================

const agentHookSchema = z.object({
  agentId: z.string(),
  claimId: z.string(),
  issueId: z.string(),
  event: z.enum(["started", "progress", "completed", "failed"]),
  progress: z.number().min(0).max(100).optional(),
  error: z.string().optional(),
  result: z.unknown().optional(),
  timestamp: z.string().optional(),
});

/**
 * POST /hooks/agent
 *
 * Endpoint for agent orchestrator to report agent lifecycle events.
 * This receives status updates from spawned agents.
 *
 * @example
 * curl -X POST http://localhost:3000/api/hooks/agent \
 *   -H "Content-Type: application/json" \
 *   -d '{"agentId": "coder-abc123", "claimId": "xyz", "issueId": "123", "event": "completed"}'
 */
hooks.post("/agent", async (c) => {
  const body = await c.req.json();

  const result = agentHookSchema.safeParse(body);
  if (!result.success) {
    return c.json(
      {
        error: "Invalid agent hook payload",
        details: result.error.issues,
      },
      400
    );
  }

  const payload = result.data;

  // Add timestamp if not present
  if (!payload.timestamp) {
    payload.timestamp = new Date().toISOString();
  }

  // Log the agent event
  console.log(
    `[hooks] Agent ${payload.agentId} event: ${payload.event}` +
      (payload.progress !== undefined ? ` (${payload.progress}%)` : "") +
      (payload.error ? ` - Error: ${payload.error}` : "")
  );

  // Convert to HookPayload format and process through aggregator
  try {
    const hookPayload: HookPayload = {
      hook: payload.event === "completed" || payload.event === "failed"
        ? "agent-terminate"
        : payload.event === "started"
          ? "agent-spawn"
          : "post-task",
      agentId: payload.agentId,
      taskId: payload.claimId,
      timestamp: payload.timestamp,
      success: payload.event === "completed",
      progress: payload.progress,
      // Pass through additional data
      ...(payload.event === "started" && { agentType: "orchestrator-agent" }),
      ...(payload.event === "completed" || payload.event === "failed" && {
        result: payload.event === "completed" ? "success" : "failure",
      }),
      ...(payload.error && { error: payload.error }),
    };

    aggregator.processHook(hookPayload);

    return c.json({
      ok: true,
      event: payload.event,
      agentId: payload.agentId,
      claimId: payload.claimId,
      timestamp: payload.timestamp,
    });
  } catch (error) {
    console.error("[hooks] Error processing agent hook:", error);
    return c.json(
      {
        error: "Failed to process agent hook",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default hooks;
