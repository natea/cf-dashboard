// dashboard/orchestrator/types.ts
// Type definitions for the Agent Orchestrator

import type { AgentType, Claim, ClaimStatus } from "../server/domain/types";

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
export const SPAWNED_AGENT_TRANSITIONS: Record<
  SpawnedAgentStatus,
  SpawnedAgentStatus[]
> = {
  spawning: ["running", "failed"],
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

export interface ClaimFilter {
  status?: ClaimStatus | ClaimStatus[];
  claimant?: string;
  source?: string;
}

// WebSocket message types
export type WsMessageType =
  | "claim:created"
  | "claim:updated"
  | "claim:deleted"
  | "agent:status"
  | "orchestrator:heartbeat"
  | "orchestrator:command";

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
  context?: string;
  workingDir?: string;
  timeout?: number;
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
  maxAgents: number;
  maxRetries: number;
  retryDelayMs: number;
  pollIntervalMs: number;
  gracefulShutdownMs: number;
  workingDir?: string;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  dashboardUrl: "http://localhost:3000",
  maxAgents: 4,
  maxRetries: 2,
  retryDelayMs: 5000,
  pollIntervalMs: 5000,
  gracefulShutdownMs: 30000,
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

export type Unsubscribe = () => void;

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// Simple console logger
export const consoleLogger: Logger = {
  debug: (msg, ...args) => console.debug(`[orchestrator] ${msg}`, ...args),
  info: (msg, ...args) => console.log(`[orchestrator] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[orchestrator] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[orchestrator] ${msg}`, ...args),
};
