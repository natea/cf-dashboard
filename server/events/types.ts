// server/events/types.ts
import type { Claim } from "../../shared/types";
export type { DashboardEvent } from "../../shared/events";

/**
 * Event sources that feed into the aggregator
 */
export type EventSource = "storage" | "hook" | "postgres-notify" | "agent-stdout";

/**
 * Base interface for all raw events
 */
export interface RawEvent {
  source: EventSource;
  timestamp: Date;
}

// ============================================================================
// Storage Events (from ClaimsStorage subscribe)
// ============================================================================

export interface StorageClaimCreated extends RawEvent {
  source: "storage";
  eventType: "claim.created";
  claim: Claim;
}

export interface StorageClaimUpdated extends RawEvent {
  source: "storage";
  eventType: "claim.updated";
  claim: Claim;
  changes: Partial<Claim>;
}

export interface StorageClaimDeleted extends RawEvent {
  source: "storage";
  eventType: "claim.deleted";
  claim: Claim;
}

export type StorageEvent = StorageClaimCreated | StorageClaimUpdated | StorageClaimDeleted;

// ============================================================================
// Postgres NOTIFY Events (from pg_notify)
// ============================================================================

/**
 * Payload structure from Postgres NOTIFY
 */
export interface PgNotifyPayload {
  operation: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  id: string;
  issueId: string;
  data?: Record<string, unknown>;
  old_data?: Record<string, unknown>;
}

export interface PostgresNotifyEvent extends RawEvent {
  source: "postgres-notify";
  channel: string;
  payload: PgNotifyPayload;
}

// ============================================================================
// Hook Events (from POST /hooks/event)
// ============================================================================

/**
 * Base hook payload
 */
export interface HookPayload {
  hook: string;
  timestamp?: string;
  agentId?: string;
  taskId?: string;
  success?: boolean;
  progress?: number;
  [key: string]: unknown;
}

/**
 * Specific hook types from Claude Flow
 */
export interface PostTaskHookPayload extends HookPayload {
  hook: "post-task";
  taskId: string;
  agentId: string;
  success: boolean;
  progress: number;
  result?: unknown;
}

export interface PostEditHookPayload extends HookPayload {
  hook: "post-edit";
  agentId: string;
  filePath: string;
  success: boolean;
}

export interface PostCommandHookPayload extends HookPayload {
  hook: "post-command";
  agentId: string;
  command: string;
  exitCode: number;
}

export interface AgentSpawnHookPayload extends HookPayload {
  hook: "agent-spawn";
  agentId: string;
  agentType: string;
  taskId?: string;
}

export interface AgentTerminateHookPayload extends HookPayload {
  hook: "agent-terminate";
  agentId: string;
  result: "success" | "failure";
  taskId?: string;
}

export type ClaudeFlowHookPayload =
  | PostTaskHookPayload
  | PostEditHookPayload
  | PostCommandHookPayload
  | AgentSpawnHookPayload
  | AgentTerminateHookPayload;

export interface HookEvent extends RawEvent {
  source: "hook";
  payload: HookPayload;
}

// ============================================================================
// Agent Stdout Events (from spawned processes)
// ============================================================================

export interface AgentStdoutEvent extends RawEvent {
  source: "agent-stdout";
  agentId: string;
  stream: "stdout" | "stderr";
  line: string;
  progress?: number;
}

// ============================================================================
// Union of all raw events
// ============================================================================

export type AnyRawEvent = StorageEvent | PostgresNotifyEvent | HookEvent | AgentStdoutEvent;

// ============================================================================
// Type Guards
// ============================================================================

export function isStorageEvent(event: AnyRawEvent): event is StorageEvent {
  return event.source === "storage";
}

export function isPostgresNotifyEvent(event: AnyRawEvent): event is PostgresNotifyEvent {
  return event.source === "postgres-notify";
}

export function isHookEvent(event: AnyRawEvent): event is HookEvent {
  return event.source === "hook";
}

export function isAgentStdoutEvent(event: AnyRawEvent): event is AgentStdoutEvent {
  return event.source === "agent-stdout";
}

// ============================================================================
// Event Emitter Types
// ============================================================================

import type { DashboardEvent } from "../../shared/events";

export type EventListener = (event: DashboardEvent) => void;

export interface EventEmitter {
  on(listener: EventListener): () => void;
  emit(event: DashboardEvent): void;
}
