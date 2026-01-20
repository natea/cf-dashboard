// dashboard/orchestrator/orchestrator.ts
// Main orchestrator class that coordinates all dashboard components

import { DashboardClient } from "./dashboard-client";
import { TaskRouter } from "./task-router";
import { AgentSpawner, type AgentLifecycleEvent } from "./agent-spawner";
import type {
  OrchestratorConfig,
  OrchestratorState,
  OrchestratorStatus,
  OrchestratorEvent,
  SpawnedAgent,
  SpawnedAgentStatus,
  WsMessage,
  ClaimCreatedPayload,
  ClaimUpdatedPayload,
  RoutingResult,
  Logger,
  Unsubscribe,
} from "./types";
import {
  ORCHESTRATOR_TRANSITIONS,
  SPAWNED_AGENT_TRANSITIONS,
  consoleLogger,
  DEFAULT_CONFIG,
} from "./types";
import type { Claim } from "../server/domain/types";

// ============================================================================
// Types
// ============================================================================

interface RetryInfo {
  claimId: string;
  issueId: string;
  attempts: number;
  nextRetryAt: Date;
  lastError?: string;
}

type EventCallback = (event: OrchestratorEvent) => void;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique orchestrator ID
 */
function generateOrchestratorId(): string {
  return `orch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number = 60000
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Orchestrator Class
// ============================================================================

/**
 * Main orchestrator that coordinates dashboard polling, task routing,
 * and agent spawning for the claims dashboard system.
 */
export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly logger: Logger;
  private readonly dashboardClient: DashboardClient;
  private readonly taskRouter: TaskRouter;
  private readonly agentSpawner: AgentSpawner;

  // State
  private id: string;
  private status: OrchestratorStatus = "idle";
  private activeAgents: Map<string, SpawnedAgent> = new Map();
  private wsConnected: boolean = false;
  private lastHeartbeat: Date | null = null;
  private startedAt: Date = new Date();
  private claimsProcessed: number = 0;
  private claimsSucceeded: number = 0;
  private claimsFailed: number = 0;

  // Internal tracking
  private retryQueue: Map<string, RetryInfo> = new Map();
  private processingClaims: Set<string> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private wsUnsubscribe: Unsubscribe | null = null;
  private eventSubscribers: Set<EventCallback> = new Set();
  private shutdownPromise: Promise<void> | null = null;
  private shutdownResolve: (() => void) | null = null;

  constructor(config: Partial<OrchestratorConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? consoleLogger;
    this.id = generateOrchestratorId();

    // Initialize components
    this.dashboardClient = new DashboardClient(
      { url: this.config.dashboardUrl },
      this.logger
    );

    this.taskRouter = new TaskRouter(this.logger);

    this.agentSpawner = new AgentSpawner({
      dashboardUrl: this.config.dashboardUrl,
      workingDir: this.config.workingDir,
      logger: this.logger,
      onAgentLifecycle: (event) => this.handleAgentLifecycleEvent(event),
    });

    this.logger.info(`Orchestrator ${this.id} initialized`);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start the orchestrator.
   * Connects to the dashboard, subscribes to events, and begins the main loop.
   */
  async start(): Promise<void> {
    if (!this.canTransitionTo("running")) {
      throw new Error(
        `Cannot start orchestrator from status '${this.status}'. Valid transitions: ${ORCHESTRATOR_TRANSITIONS[this.status].join(", ") || "none"}`
      );
    }

    this.logger.info(`Starting orchestrator ${this.id}...`);
    this.startedAt = new Date();

    try {
      // Connect to dashboard WebSocket
      await this.dashboardClient.connect();
      this.wsConnected = true;
      this.logger.info("Connected to dashboard WebSocket");

      // Subscribe to WebSocket events
      this.wsUnsubscribe = this.dashboardClient.subscribe((msg) =>
        this.handleWsMessage(msg)
      );

      // Transition to running
      this.status = "running";

      // Start the polling loop
      this.startPollingLoop();

      // Start the retry processor
      this.startRetryProcessor();

      // Emit started event
      this.emitEvent({
        type: "orchestrator:started",
        orchestratorId: this.id,
        timestamp: new Date(),
      });

      this.logger.info(`Orchestrator ${this.id} started successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to start orchestrator: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Stop the orchestrator gracefully.
   * Waits for active agents to complete (up to gracefulShutdownMs).
   */
  async stop(reason: string = "Manual shutdown"): Promise<void> {
    if (!this.canTransitionTo("stopped")) {
      this.logger.warn(
        `Cannot stop orchestrator from status '${this.status}'`
      );
      return;
    }

    this.logger.info(`Stopping orchestrator ${this.id}: ${reason}`);

    // Stop accepting new work immediately
    this.status = "stopped";

    // Stop polling and retry processor
    this.stopPollingLoop();
    this.stopRetryProcessor();

    // Unsubscribe from WebSocket events
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }

    // Wait for active agents to complete
    if (this.activeAgents.size > 0) {
      this.logger.info(
        `Waiting for ${this.activeAgents.size} active agent(s) to complete...`
      );

      const shutdownDeadline = Date.now() + this.config.gracefulShutdownMs;

      // Create a promise that resolves when all agents complete
      this.shutdownPromise = new Promise((resolve) => {
        this.shutdownResolve = resolve;
      });

      // Set up timeout for graceful shutdown
      const timeoutId = setTimeout(async () => {
        if (this.activeAgents.size > 0) {
          this.logger.warn(
            `Graceful shutdown timeout reached. Terminating ${this.activeAgents.size} remaining agent(s).`
          );
          await this.agentSpawner.terminateAll();
          this.activeAgents.clear();
          this.shutdownResolve?.();
        }
      }, this.config.gracefulShutdownMs);

      // Wait for shutdown to complete or timeout
      await this.shutdownPromise;
      clearTimeout(timeoutId);
    }

    // Disconnect from dashboard
    this.dashboardClient.disconnect();
    this.wsConnected = false;

    // Emit stopped event
    this.emitEvent({
      type: "orchestrator:stopped",
      orchestratorId: this.id,
      reason,
      timestamp: new Date(),
    });

    this.logger.info(`Orchestrator ${this.id} stopped`);
  }

  /**
   * Pause the orchestrator.
   * Stops processing new claims but keeps existing agents running.
   */
  pause(): void {
    if (!this.canTransitionTo("paused")) {
      this.logger.warn(
        `Cannot pause orchestrator from status '${this.status}'`
      );
      return;
    }

    this.logger.info(`Pausing orchestrator ${this.id}`);
    this.status = "paused";

    // Stop polling but keep agents running
    this.stopPollingLoop();
    this.stopRetryProcessor();
  }

  /**
   * Resume the orchestrator from paused state.
   */
  resume(): void {
    if (!this.canTransitionTo("running")) {
      this.logger.warn(
        `Cannot resume orchestrator from status '${this.status}'`
      );
      return;
    }

    this.logger.info(`Resuming orchestrator ${this.id}`);
    this.status = "running";

    // Restart polling
    this.startPollingLoop();
    this.startRetryProcessor();
  }

  /**
   * Get the current orchestrator state.
   */
  getState(): OrchestratorState {
    return {
      id: this.id,
      status: this.status,
      activeAgents: new Map(this.activeAgents),
      maxConcurrentAgents: this.config.maxAgents,
      dashboardUrl: this.config.dashboardUrl,
      wsConnected: this.wsConnected,
      lastHeartbeat: this.lastHeartbeat,
      startedAt: this.startedAt,
      claimsProcessed: this.claimsProcessed,
      claimsSucceeded: this.claimsSucceeded,
      claimsFailed: this.claimsFailed,
    };
  }

  /**
   * Subscribe to orchestrator events.
   * Returns an unsubscribe function.
   */
  subscribe(callback: EventCallback): Unsubscribe {
    this.eventSubscribers.add(callback);
    return () => {
      this.eventSubscribers.delete(callback);
    };
  }

  // ============================================================================
  // State Transition Helpers
  // ============================================================================

  /**
   * Check if a transition to the target status is valid.
   */
  private canTransitionTo(target: OrchestratorStatus): boolean {
    const validTransitions = ORCHESTRATOR_TRANSITIONS[this.status];
    return validTransitions.includes(target);
  }

  /**
   * Check if we're under capacity and can spawn more agents.
   */
  private isUnderCapacity(): boolean {
    return this.activeAgents.size < this.config.maxAgents;
  }

  /**
   * Check if we should process new claims.
   */
  private shouldProcessClaims(): boolean {
    return this.status === "running" && this.isUnderCapacity();
  }

  // ============================================================================
  // Main Loop
  // ============================================================================

  /**
   * Start the main polling loop.
   */
  private startPollingLoop(): void {
    if (this.pollInterval) {
      return;
    }

    this.logger.debug(
      `Starting poll loop with interval ${this.config.pollIntervalMs}ms`
    );

    // Immediate first poll
    this.pollDashboard();

    // Schedule subsequent polls
    this.pollInterval = setInterval(() => {
      this.pollDashboard();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the polling loop.
   */
  private stopPollingLoop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.debug("Stopped poll loop");
    }
  }

  /**
   * Poll the dashboard for backlog claims and process them.
   */
  private async pollDashboard(): Promise<void> {
    if (!this.shouldProcessClaims()) {
      this.logger.debug(
        `Skipping poll: status=${this.status}, capacity=${this.activeAgents.size}/${this.config.maxAgents}`
      );
      return;
    }

    try {
      // Fetch backlog claims
      const claims = await this.dashboardClient.fetchClaims({
        status: "backlog",
      });

      this.logger.debug(`Fetched ${claims.length} backlog claim(s)`);

      // Process claims up to capacity
      for (const claim of claims) {
        if (!this.shouldProcessClaims()) {
          this.logger.debug("Reached capacity, stopping claim processing");
          break;
        }

        // Skip if already processing this claim
        if (this.processingClaims.has(claim.id)) {
          continue;
        }

        // Skip if in retry queue
        if (this.retryQueue.has(claim.id)) {
          continue;
        }

        // Process the claim
        await this.processClaim(claim);
      }
    } catch (error) {
      this.logger.error(
        `Poll failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ============================================================================
  // Claim Processing
  // ============================================================================

  /**
   * Process a single claim: route it and spawn an agent.
   */
  private async processClaim(claim: Claim): Promise<void> {
    this.logger.info(`Processing claim ${claim.id}: ${claim.title}`);
    this.processingClaims.add(claim.id);

    try {
      // Route the claim to determine agent type and model
      const routing = await this.taskRouter.route({
        issueId: claim.issueId,
        title: claim.title,
        description: claim.description,
        labels: claim.metadata?.labels as string[] | undefined,
        metadata: claim.metadata,
      });

      this.logger.debug(
        `Routing result for ${claim.id}: ${routing.agentType}/${routing.modelTier} (confidence: ${routing.confidence})`
      );

      // Spawn the agent first to get the agentId
      const spawnResult = await this.agentSpawner.spawn({
        agentType: routing.agentType,
        modelTier: routing.modelTier,
        claimId: claim.id,
        issueId: claim.issueId,
        context: claim.context ?? claim.description,
        workingDir: this.config.workingDir,
      });

      if (spawnResult.success && spawnResult.agentId) {
        // Track the spawned agent FIRST, before any async operations
        // This ensures lifecycle callbacks can find the agent even if it completes quickly
        const spawnedAgent: SpawnedAgent = {
          agentId: spawnResult.agentId,
          agentType: routing.agentType,
          modelTier: routing.modelTier,
          claimId: claim.id,
          issueId: claim.issueId,
          status: "spawning",
          attempts: 1,
          maxAttempts: this.config.maxRetries + 1,
          spawnedAt: new Date(),
        };

        this.activeAgents.set(spawnResult.agentId, spawnedAgent);
        this.claimsProcessed++;

        // Claim the issue with the agent as the claimant
        // This sets the claimant and status to "active" in one API call
        await this.dashboardClient.claimIssue(claim.id, {
          type: "agent",
          agentId: spawnResult.agentId,
          agentType: routing.agentType,
        });

        // Emit events
        this.emitEvent({
          type: "agent:spawned",
          agent: spawnedAgent,
          timestamp: new Date(),
        });

        this.emitEvent({
          type: "claim:assigned",
          claimId: claim.id,
          agentId: spawnResult.agentId,
          routing,
          timestamp: new Date(),
        });

        this.logger.info(
          `Spawned agent ${spawnResult.agentId} for claim ${claim.id}`
        );

        // Check if we've reached capacity
        if (!this.isUnderCapacity()) {
          this.emitEvent({
            type: "pool:capacity_reached",
            activeCount: this.activeAgents.size,
            maxCount: this.config.maxAgents,
            timestamp: new Date(),
          });
        }
      } else {
        // Spawn failed, add to retry queue
        this.handleClaimFailure(
          claim.id,
          claim.issueId,
          spawnResult.error ?? "Unknown spawn error",
          1
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process claim ${claim.id}: ${errorMsg}`);
      this.handleClaimFailure(claim.id, claim.issueId, errorMsg, 1);
    } finally {
      this.processingClaims.delete(claim.id);
    }
  }

  /**
   * Handle a claim failure - either retry or mark as failed.
   */
  private handleClaimFailure(
    claimId: string,
    issueId: string,
    error: string,
    attempts: number
  ): void {
    const willRetry = attempts <= this.config.maxRetries;

    if (willRetry) {
      // Add to retry queue with exponential backoff
      const delay = calculateBackoffDelay(
        attempts - 1,
        this.config.retryDelayMs
      );
      const nextRetryAt = new Date(Date.now() + delay);

      this.retryQueue.set(claimId, {
        claimId,
        issueId,
        attempts,
        nextRetryAt,
        lastError: error,
      });

      this.logger.info(
        `Claim ${claimId} scheduled for retry ${attempts}/${this.config.maxRetries} at ${nextRetryAt.toISOString()}`
      );
    } else {
      // Max retries exceeded, mark as failed
      this.claimsFailed++;
      this.retryQueue.delete(claimId);

      // Try to update claim status to blocked
      this.dashboardClient.updateClaimStatus(claimId, "blocked").catch((e) => {
        this.logger.warn(
          `Failed to update claim ${claimId} status: ${e instanceof Error ? e.message : String(e)}`
        );
      });

      this.logger.error(
        `Claim ${claimId} failed after ${attempts} attempts: ${error}`
      );
    }

    // Emit failure event
    this.emitEvent({
      type: "agent:failed",
      agentId: "", // No agent ID for spawn failures
      claimId,
      error,
      willRetry,
      timestamp: new Date(),
    });
  }

  // ============================================================================
  // Retry Processing
  // ============================================================================

  /**
   * Start the retry processor.
   */
  private startRetryProcessor(): void {
    if (this.retryInterval) {
      return;
    }

    // Check retry queue every second
    this.retryInterval = setInterval(() => {
      this.processRetryQueue();
    }, 1000);
  }

  /**
   * Stop the retry processor.
   */
  private stopRetryProcessor(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }

  /**
   * Process the retry queue, re-attempting failed claims.
   */
  private async processRetryQueue(): Promise<void> {
    if (!this.shouldProcessClaims()) {
      return;
    }

    const now = new Date();

    for (const [claimId, retryInfo] of this.retryQueue) {
      if (!this.shouldProcessClaims()) {
        break;
      }

      if (now >= retryInfo.nextRetryAt) {
        this.retryQueue.delete(claimId);

        this.logger.info(
          `Retrying claim ${claimId} (attempt ${retryInfo.attempts + 1})`
        );

        try {
          // Fetch fresh claim data
          const claim = await this.dashboardClient.fetchClaim(claimId);

          if (!claim) {
            this.logger.warn(`Claim ${claimId} no longer exists, skipping retry`);
            continue;
          }

          // Only retry if claim is still in a retryable state
          if (claim.status !== "backlog" && claim.status !== "blocked") {
            this.logger.info(
              `Claim ${claimId} status changed to ${claim.status}, skipping retry`
            );
            continue;
          }

          // Process the claim again
          await this.processClaim(claim);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          this.handleClaimFailure(
            claimId,
            retryInfo.issueId,
            errorMsg,
            retryInfo.attempts + 1
          );
        }
      }
    }
  }

  // ============================================================================
  // WebSocket Event Handling
  // ============================================================================

  /**
   * Handle incoming WebSocket messages from the dashboard.
   */
  private handleWsMessage(msg: WsMessage): void {
    this.lastHeartbeat = new Date();

    switch (msg.type) {
      case "claim:created":
        this.handleClaimCreated(msg.payload as ClaimCreatedPayload);
        break;

      case "claim:updated":
        this.handleClaimUpdated(msg.payload as ClaimUpdatedPayload);
        break;

      case "agent:status":
        this.handleAgentStatus(msg.payload as {
          agentId: string;
          claimId: string;
          status: SpawnedAgentStatus;
          progress?: number;
          error?: string;
        });
        break;

      case "orchestrator:command":
        this.handleOrchestratorCommand(msg.payload as {
          command: "pause" | "resume" | "stop" | "spawn";
          args?: Record<string, unknown>;
        });
        break;

      case "orchestrator:heartbeat":
        // Just update lastHeartbeat, already done above
        break;

      default:
        this.logger.debug(`Unhandled WebSocket message type: ${msg.type}`);
    }
  }

  /**
   * Handle a new claim creation event.
   */
  private handleClaimCreated(payload: ClaimCreatedPayload): void {
    const { claim } = payload;
    this.logger.debug(`Claim created: ${claim.id} (${claim.status})`);

    // If it's a backlog claim and we have capacity, process it immediately
    if (claim.status === "backlog" && this.shouldProcessClaims()) {
      // Don't await - let it process asynchronously
      this.processClaim(claim).catch((error) => {
        this.logger.error(
          `Failed to process new claim ${claim.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  }

  /**
   * Handle a claim update event.
   */
  private handleClaimUpdated(payload: ClaimUpdatedPayload): void {
    const { claim, changes } = payload;
    this.logger.debug(
      `Claim updated: ${claim.id} - changes: ${JSON.stringify(changes)}`
    );

    // If claim was moved back to backlog, consider processing it
    if (changes.status === "backlog" && this.shouldProcessClaims()) {
      // Don't await - let it process asynchronously
      this.processClaim(claim).catch((error) => {
        this.logger.error(
          `Failed to process updated claim ${claim.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  }

  /**
   * Handle agent lifecycle events from the spawner.
   * This is the direct callback from the spawner when agents complete or fail.
   */
  private handleAgentLifecycleEvent(event: AgentLifecycleEvent): void {
    this.logger.debug(
      `Agent lifecycle event: ${event.type} for agent ${event.agentId}`
    );

    // Map lifecycle events to agent status updates
    switch (event.type) {
      case "started":
        this.handleAgentStatus({
          agentId: event.agentId,
          claimId: event.claimId,
          status: "running",
        });
        break;

      case "progress":
        this.handleAgentStatus({
          agentId: event.agentId,
          claimId: event.claimId,
          status: "running",
          progress: event.progress,
        });
        break;

      case "completed":
        this.handleAgentStatus({
          agentId: event.agentId,
          claimId: event.claimId,
          status: "completed",
          progress: 100,
        });
        break;

      case "failed":
        this.handleAgentStatus({
          agentId: event.agentId,
          claimId: event.claimId,
          status: "failed",
          error: event.error,
        });
        break;
    }
  }

  /**
   * Handle an agent status update.
   */
  private handleAgentStatus(payload: {
    agentId: string;
    claimId: string;
    status: SpawnedAgentStatus;
    progress?: number;
    error?: string;
  }): void {
    const { agentId, claimId, status, progress, error } = payload;

    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      this.logger.warn(`Received status for unknown agent ${agentId}`);
      return;
    }

    // Validate state transition
    const validTransitions = SPAWNED_AGENT_TRANSITIONS[agent.status];
    if (!validTransitions.includes(status)) {
      this.logger.warn(
        `Invalid agent state transition: ${agent.status} -> ${status}`
      );
      return;
    }

    // Update agent status
    agent.status = status;
    if (error) {
      agent.lastError = error;
    }

    this.logger.debug(
      `Agent ${agentId} status: ${status}${progress !== undefined ? ` (${progress}%)` : ""}`
    );

    // Handle terminal states
    if (status === "completed") {
      agent.completedAt = new Date();
      this.claimsSucceeded++;
      this.activeAgents.delete(agentId);

      // Move claim to needs_review status (not completed - that requires human approval)
      this.dashboardClient
        .updateClaimStatus(claimId, "needs_review", 100)
        .catch((e) => {
          this.logger.warn(
            `Failed to update claim ${claimId} status: ${e instanceof Error ? e.message : String(e)}`
          );
        });

      // Emit completion event
      this.emitEvent({
        type: "agent:completed",
        agentId,
        claimId,
        success: true,
        timestamp: new Date(),
      });

      this.logger.info(
        `Agent ${agentId} completed claim ${claimId} - moved to needs_review`
      );

      // Check if we're shutting down and all agents are done
      this.checkShutdownComplete();
    } else if (status === "failed") {
      agent.completedAt = new Date();

      // Check if we should retry
      const willRetry = agent.attempts < agent.maxAttempts;

      if (willRetry) {
        // Schedule retry
        this.handleClaimFailure(
          claimId,
          agent.issueId,
          error ?? "Agent failed",
          agent.attempts
        );
      } else {
        this.claimsFailed++;

        // Update claim status to blocked
        this.dashboardClient.updateClaimStatus(claimId, "blocked").catch((e) => {
          this.logger.warn(
            `Failed to update claim ${claimId} status: ${e instanceof Error ? e.message : String(e)}`
          );
        });
      }

      // Remove from active agents
      this.activeAgents.delete(agentId);

      // Emit failure event
      this.emitEvent({
        type: "agent:failed",
        agentId,
        claimId,
        error: error ?? "Agent failed",
        willRetry,
        timestamp: new Date(),
      });

      this.logger.error(
        `Agent ${agentId} failed: ${error}${willRetry ? " (will retry)" : ""}`
      );

      // Check if we're shutting down and all agents are done
      this.checkShutdownComplete();
    } else if (status === "running") {
      // Update progress on the claim if provided
      if (progress !== undefined) {
        this.dashboardClient
          .updateClaimStatus(claimId, "active", progress)
          .catch((e) => {
            this.logger.warn(
              `Failed to update claim ${claimId} progress: ${e instanceof Error ? e.message : String(e)}`
            );
          });
      }
    }
  }

  /**
   * Handle orchestrator commands from WebSocket.
   */
  private handleOrchestratorCommand(payload: {
    command: "pause" | "resume" | "stop" | "spawn";
    args?: Record<string, unknown>;
  }): void {
    this.logger.info(`Received orchestrator command: ${payload.command}`);

    switch (payload.command) {
      case "pause":
        this.pause();
        break;

      case "resume":
        this.resume();
        break;

      case "stop":
        const reason = (payload.args?.reason as string) ?? "Remote stop command";
        this.stop(reason).catch((e) => {
          this.logger.error(
            `Stop command failed: ${e instanceof Error ? e.message : String(e)}`
          );
        });
        break;

      case "spawn":
        // Manual spawn command - not typically used
        this.logger.debug("Spawn command received, triggering poll");
        this.pollDashboard().catch((e) => {
          this.logger.error(
            `Poll failed: ${e instanceof Error ? e.message : String(e)}`
          );
        });
        break;
    }
  }

  // ============================================================================
  // Event Emission
  // ============================================================================

  /**
   * Emit an event to all subscribers.
   */
  private emitEvent(event: OrchestratorEvent): void {
    for (const callback of this.eventSubscribers) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error(
          `Event subscriber error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  // ============================================================================
  // Shutdown Helpers
  // ============================================================================

  /**
   * Check if shutdown is complete (all agents finished).
   */
  private checkShutdownComplete(): void {
    if (
      this.status === "stopped" &&
      this.activeAgents.size === 0 &&
      this.shutdownResolve
    ) {
      this.shutdownResolve();
      this.shutdownResolve = null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and optionally start an orchestrator instance.
 */
export async function createOrchestrator(
  config?: Partial<OrchestratorConfig>,
  options?: { autoStart?: boolean; logger?: Logger }
): Promise<Orchestrator> {
  const orchestrator = new Orchestrator(config, options?.logger);

  if (options?.autoStart) {
    await orchestrator.start();
  }

  return orchestrator;
}

// ============================================================================
// Exports
// ============================================================================

export type { EventCallback, RetryInfo };
