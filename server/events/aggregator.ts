// dashboard/server/events/aggregator.ts
import type { Claim } from "../domain/types";
import type { ClaimsStorage, ClaimEvent as StorageClaimEvent } from "../storage/interface";
import type {
  DashboardEvent,
  ClaimCreatedEvent,
  ClaimUpdatedEvent,
  ClaimDeletedEvent,
  AgentProgressEvent,
  AgentLogEvent,
  AgentStartedEvent,
  AgentCompletedEvent,
} from "../ws/types";
import type {
  HookPayload,
  PostTaskHookPayload,
  PostEditHookPayload,
  PostCommandHookPayload,
  AgentSpawnHookPayload,
  AgentTerminateHookPayload,
  PgNotifyPayload,
  EventListener,
} from "./types";

/**
 * Event Aggregator normalizes events from multiple sources:
 * - Storage events (ClaimsStorage.subscribe)
 * - Postgres NOTIFY events
 * - Claude Flow hook callbacks
 * - Agent stdout streams
 *
 * All events are normalized to DashboardEvent and emitted to listeners.
 */
export class EventAggregator {
  private listeners = new Set<EventListener>();
  private storageUnsubscribe: (() => void) | null = null;
  private pgClient: unknown = null;

  /**
   * Subscribe to normalized events
   */
  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit a normalized event to all listeners
   */
  emit(event: DashboardEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[event-aggregator] Listener error:", error);
      }
    }
  }

  // ===========================================================================
  // Storage Integration
  // ===========================================================================

  /**
   * Connect to storage and subscribe to events
   */
  connectStorage(storage: ClaimsStorage): void {
    this.storageUnsubscribe = storage.subscribe((event) => {
      this.handleStorageEvent(event);
    });
    console.log("[event-aggregator] Connected to storage");
  }

  /**
   * Disconnect from storage
   */
  disconnectStorage(): void {
    if (this.storageUnsubscribe) {
      this.storageUnsubscribe();
      this.storageUnsubscribe = null;
      console.log("[event-aggregator] Disconnected from storage");
    }
  }

  /**
   * Handle storage events and normalize to DashboardEvent
   */
  private handleStorageEvent(event: StorageClaimEvent): void {
    let dashboardEvent: DashboardEvent;

    switch (event.type) {
      case "created":
        dashboardEvent = {
          type: "claim.created",
          claim: event.claim,
        } satisfies ClaimCreatedEvent;
        break;

      case "updated":
        dashboardEvent = {
          type: "claim.updated",
          claim: event.claim,
          changes: event.changes ?? {},
        } satisfies ClaimUpdatedEvent;
        break;

      case "deleted":
        dashboardEvent = {
          type: "claim.deleted",
          issueId: event.claim.issueId,
        } satisfies ClaimDeletedEvent;
        break;
    }

    this.emit(dashboardEvent);
  }

  // ===========================================================================
  // Postgres NOTIFY Integration
  // ===========================================================================

  /**
   * Connect to Postgres and listen for NOTIFY events
   * @param connectionString Postgres connection URL
   */
  async connectPostgres(connectionString: string): Promise<void> {
    // Dynamic import to avoid loading postgres if not needed
    const postgres = await import("postgres");
    const sql = postgres.default(connectionString);

    // Store reference for cleanup
    this.pgClient = sql;

    // Listen on claim_changes channel
    await sql.listen("claim_changes", (payload) => {
      try {
        const data = JSON.parse(payload) as PgNotifyPayload;
        this.handlePgNotify(data);
      } catch (error) {
        console.error("[event-aggregator] Failed to parse PG NOTIFY payload:", error);
      }
    });

    console.log("[event-aggregator] Connected to Postgres LISTEN claim_changes");
  }

  /**
   * Disconnect from Postgres
   */
  async disconnectPostgres(): Promise<void> {
    if (this.pgClient) {
      const sql = this.pgClient as { end: () => Promise<void> };
      await sql.end();
      this.pgClient = null;
      console.log("[event-aggregator] Disconnected from Postgres");
    }
  }

  /**
   * Handle Postgres NOTIFY and normalize to DashboardEvent
   */
  private handlePgNotify(payload: PgNotifyPayload): void {
    // Skip if not claims table
    if (payload.table !== "claims") {
      return;
    }

    let dashboardEvent: DashboardEvent | null = null;

    switch (payload.operation) {
      case "INSERT":
        if (payload.data) {
          const claim = this.pgDataToClaim(payload.data);
          dashboardEvent = {
            type: "claim.created",
            claim,
          } satisfies ClaimCreatedEvent;
        }
        break;

      case "UPDATE":
        if (payload.data) {
          const claim = this.pgDataToClaim(payload.data);
          const changes = this.computeChanges(payload.old_data, payload.data);
          dashboardEvent = {
            type: "claim.updated",
            claim,
            changes,
          } satisfies ClaimUpdatedEvent;
        }
        break;

      case "DELETE":
        dashboardEvent = {
          type: "claim.deleted",
          issueId: payload.issueId,
        } satisfies ClaimDeletedEvent;
        break;
    }

    if (dashboardEvent) {
      this.emit(dashboardEvent);
    }
  }

  /**
   * Convert Postgres row data to Claim object
   */
  private pgDataToClaim(data: Record<string, unknown>): Claim {
    return {
      id: String(data.id),
      issueId: String(data.issue_id ?? data.issueId),
      source: (data.source as Claim["source"]) ?? "manual",
      sourceRef: data.source_ref as string | undefined,
      title: String(data.title),
      description: data.description as string | undefined,
      status: (data.status as Claim["status"]) ?? "backlog",
      claimant: data.claimant ? JSON.parse(String(data.claimant)) : undefined,
      progress: Number(data.progress ?? 0),
      context: data.context as string | undefined,
      metadata: data.metadata ? JSON.parse(String(data.metadata)) : undefined,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  /**
   * Compute changes between old and new data
   */
  private computeChanges(
    oldData: Record<string, unknown> | undefined,
    newData: Record<string, unknown>
  ): Partial<Claim> {
    if (!oldData) return {};

    const changes: Partial<Claim> = {};
    const fieldMap: Record<string, keyof Claim> = {
      status: "status",
      progress: "progress",
      claimant: "claimant",
      title: "title",
      description: "description",
      context: "context",
    };

    for (const [pgField, claimField] of Object.entries(fieldMap)) {
      if (oldData[pgField] !== newData[pgField]) {
        (changes as Record<string, unknown>)[claimField] = newData[pgField];
      }
    }

    return changes;
  }

  // ===========================================================================
  // Hook Integration
  // ===========================================================================

  /**
   * Process incoming hook payload from POST /hooks/event
   */
  processHook(payload: HookPayload): void {
    const events = this.normalizeHookPayload(payload);
    for (const event of events) {
      this.emit(event);
    }
  }

  /**
   * Normalize hook payload to DashboardEvent(s)
   */
  private normalizeHookPayload(payload: HookPayload): DashboardEvent[] {
    const events: DashboardEvent[] = [];

    switch (payload.hook) {
      case "post-task": {
        const p = payload as PostTaskHookPayload;
        events.push({
          type: "agent.progress",
          agentId: p.agentId,
          issueId: p.taskId,
          progress: p.success ? 100 : p.progress,
        } satisfies AgentProgressEvent);

        if (p.success || p.progress === 100) {
          events.push({
            type: "agent.completed",
            agentId: p.agentId,
            result: p.success ? "success" : "failure",
            issueId: p.taskId,
          } satisfies AgentCompletedEvent);
        }
        break;
      }

      case "post-edit": {
        const p = payload as PostEditHookPayload;
        events.push({
          type: "agent.log",
          agentId: p.agentId,
          level: p.success ? "info" : "warn",
          message: `${p.success ? "Edited" : "Failed to edit"} ${p.filePath}`,
          timestamp: new Date(payload.timestamp || Date.now()),
        } satisfies AgentLogEvent);
        break;
      }

      case "post-command": {
        const p = payload as PostCommandHookPayload;
        events.push({
          type: "agent.log",
          agentId: p.agentId,
          level: p.exitCode === 0 ? "info" : "error",
          message: `Command ${p.command} exited with code ${p.exitCode}`,
          timestamp: new Date(payload.timestamp || Date.now()),
        } satisfies AgentLogEvent);
        break;
      }

      case "agent-spawn": {
        const p = payload as AgentSpawnHookPayload;
        events.push({
          type: "agent.started",
          agentId: p.agentId,
          agentType: p.agentType,
          issueId: p.taskId,
        } satisfies AgentStartedEvent);
        break;
      }

      case "agent-terminate": {
        const p = payload as AgentTerminateHookPayload;
        events.push({
          type: "agent.completed",
          agentId: p.agentId,
          result: p.result,
          issueId: p.taskId,
        } satisfies AgentCompletedEvent);
        break;
      }

      default:
        // Generic log for unknown hooks
        if (payload.agentId) {
          events.push({
            type: "agent.log",
            agentId: payload.agentId,
            level: "info",
            message: `Hook: ${payload.hook}`,
            timestamp: new Date(payload.timestamp || Date.now()),
          } satisfies AgentLogEvent);
        }
    }

    return events;
  }

  // ===========================================================================
  // Agent Stdout Integration
  // ===========================================================================

  /**
   * Process agent stdout line
   */
  processAgentOutput(agentId: string, line: string, stream: "stdout" | "stderr" = "stdout"): void {
    // Parse progress from output if present (e.g., "[PROGRESS] 45%")
    const progressMatch = line.match(/\[PROGRESS\]\s*(\d+)%/);
    const progress = progressMatch ? parseInt(progressMatch[1], 10) : undefined;

    // Determine log level from stream and content
    let level: "info" | "warn" | "error" = stream === "stderr" ? "error" : "info";
    if (line.toLowerCase().includes("warn")) level = "warn";
    if (line.toLowerCase().includes("error")) level = "error";

    this.emit({
      type: "agent.log",
      agentId,
      level,
      message: line,
      timestamp: new Date(),
    } satisfies AgentLogEvent);

    // Emit progress event if detected
    if (progress !== undefined) {
      this.emit({
        type: "agent.progress",
        agentId,
        progress,
      } satisfies AgentProgressEvent);
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Shutdown and cleanup all connections
   */
  async shutdown(): Promise<void> {
    this.disconnectStorage();
    await this.disconnectPostgres();
    this.listeners.clear();
    console.log("[event-aggregator] Shutdown complete");
  }
}

// Singleton instance
export const aggregator = new EventAggregator();
