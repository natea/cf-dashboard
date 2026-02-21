// orchestrator/types.ts
// Type definitions for the Agent Orchestrator

import type { AgentType, Claim, ClaimStatus } from "../shared/types";
import type { ClaimFilter as SharedClaimFilter } from "../shared/filters";

// Re-export shared types for convenience
export type { Unsubscribe } from "../shared/filters";

// ============================================================================
// Orchestrator Core Types
// ============================================================================

export type OrchestratorStatus = "idle" | "running" | "paused" | "stopped";

export interface OrchestratorState {
  id: string;
  status: OrchestratorStatus;
  activeAgents: Map<string, SpawnedAgent>;
  maxConcurrentAgents: number;
  dashboardUrl: string;
  wsConnected: boolean;
  lastHeartbeat: Date | null;
  startedAt: Date;
  claimsProcessed: number;
  claimsSucceeded: number;
  claimsFailed: number;
}

// Valid state transitions for orchestrator
export const ORCHESTRATOR_TRANSITIONS: Record<
  OrchestratorStatus,
  OrchestratorStatus[]
> = {
  idle: ["running"],
  running: ["paused", "stopped"],
  paused: ["running", "stopped"],
  stopped: [], // Terminal state
};

// ============================================================================
// Spawned Agent Types
// ============================================================================

export type ModelTier = "wasm" | "haiku" | "sonnet" | "opus";
export type SpawnedAgentStatus = "spawning" | "running" | "completed" | "failed";

export interface SpawnedAgent {
  agentId: string;
  agentType: AgentType;
  modelTier: ModelTier;
  claimId: string;
  issueId: string;
  status: SpawnedAgentStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  spawnedAt: Date;
  completedAt?: Date;
}

// Valid state transitions for spawned agents
// Note: spawning can go directly to completed for fast-completing agents
export const SPAWNED_AGENT_TRANSITIONS: Record<
  SpawnedAgentStatus,
  SpawnedAgentStatus[]
> = {
  spawning: ["running", "completed", "failed"],
  running: ["completed", "failed"],
  completed: [], // Terminal
  failed: ["spawning"], // Can retry
};

// ============================================================================
// Task Routing Types
// ============================================================================

export interface RoutingResult {
  agentType: AgentType;
  modelTier: ModelTier;
  useAgentBooster: boolean;
  confidence: number;
  reasoning?: string;
}

export interface TaskContext {
  issueId: string;
  title: string;
  description?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Dashboard Client Types
// ============================================================================

export interface DashboardConfig {
  url: string;
  wsPath?: string;
  apiKey?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// Re-export ClaimFilter from shared (was locally defined)
export type { SharedClaimFilter as ClaimFilter };

// WebSocket message types
export type WsMessageType =
  | "claim:created"
  | "claim:updated"
  | "claim:deleted"
  | "agent:status"
  | "orchestrator:heartbeat"
  | "orchestrator:command"
  | "pong";

export interface WsMessage {
  type: WsMessageType;
  payload: unknown;
  timestamp: string;
}

export interface ClaimCreatedPayload {
  claim: Claim;
}

export interface ClaimUpdatedPayload {
  claim: Claim;
  changes: Partial<Claim>;
}

export interface ClaimDeletedPayload {
  claimId: string;
}

export interface AgentStatusPayload {
  agentId: string;
  claimId: string;
  status: SpawnedAgentStatus;
  progress?: number;
  error?: string;
}

export interface OrchestratorCommandPayload {
  command: "pause" | "resume" | "stop" | "spawn";
  args?: Record<string, unknown>;
}

// ============================================================================
// Agent Spawner Types
// ============================================================================

export interface SpawnOptions {
  agentType: AgentType;
  modelTier: ModelTier;
  claimId: string;
  issueId: string;
  title: string;
  description?: string;
  context?: string;
  workingDir?: string;
  timeout?: number;
  /** Pre-generated agent ID (used when claiming before spawning) */
  agentId?: string;
}

export interface SpawnResult {
  success: boolean;
  agentId?: string;
  error?: string;
  pid?: number;
}

export interface AgentHookPayload {
  agentId: string;
  claimId: string;
  issueId: string;
  event: "started" | "progress" | "completed" | "failed";
  progress?: number;
  error?: string;
  result?: unknown;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface OrchestratorConfig {
  dashboardUrl: string;
  apiKey?: string;
  maxAgents: number;
  maxRetries: number;
  retryDelayMs: number;
  pollIntervalMs: number;
  gracefulShutdownMs: number;
  workingDir?: string;
  /** Use git worktrees to isolate each agent's work (default: true) */
  useWorktrees: boolean;
  /** Remove worktrees after agent completes (default: false - keep for review) */
  cleanupWorktrees: boolean;
  /** Use claude-flow CLI for agent spawning instead of direct claude CLI (default: false).
   *  claude-flow agent spawn only registers metadata — it does NOT execute code.
   *  Use claude -p (direct CLI) for actual task execution. */
  useClaudeFlow: boolean;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  dashboardUrl: "http://localhost:3000",
  maxAgents: 4,
  maxRetries: 2,
  retryDelayMs: 5000,
  pollIntervalMs: 5000,
  gracefulShutdownMs: 30000,
  useWorktrees: true,
  cleanupWorktrees: false,
  useClaudeFlow: false,
};

// ============================================================================
// Event Types
// ============================================================================

export type OrchestratorEvent =
  | { type: "orchestrator:started"; orchestratorId: string; timestamp: Date }
  | {
      type: "orchestrator:stopped";
      orchestratorId: string;
      reason: string;
      timestamp: Date;
    }
  | { type: "agent:spawned"; agent: SpawnedAgent; timestamp: Date }
  | {
      type: "agent:completed";
      agentId: string;
      claimId: string;
      success: boolean;
      timestamp: Date;
    }
  | {
      type: "agent:failed";
      agentId: string;
      claimId: string;
      error: string;
      willRetry: boolean;
      timestamp: Date;
    }
  | {
      type: "claim:assigned";
      claimId: string;
      agentId: string;
      routing: RoutingResult;
      timestamp: Date;
    }
  | {
      type: "pool:capacity_reached";
      activeCount: number;
      maxCount: number;
      timestamp: Date;
    };

// ============================================================================
// Utility Types
// ============================================================================

// Unsubscribe is re-exported from shared/filters at the top of this file.

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

// Colored console logger - cyan prefix makes orchestrator logs stand out
export const consoleLogger: Logger = {
  debug: (msg, ...args) =>
    console.debug(`${colors.cyan}[orchestrator]${colors.reset} ${colors.dim}${msg}${colors.reset}`, ...args),
  info: (msg, ...args) =>
    console.log(`${colors.cyan}[orchestrator]${colors.reset} ${msg}`, ...args),
  warn: (msg, ...args) =>
    console.warn(`${colors.yellow}[orchestrator]${colors.reset} ${msg}`, ...args),
  error: (msg, ...args) =>
    console.error(`${colors.red}[orchestrator]${colors.reset} ${msg}`, ...args),
};
