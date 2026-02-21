// shared/events.ts
// Unified event types — single source of truth for all WebSocket and domain events.

import type { Claim, ClaimJSON, Claimant } from "./types";

// ============================================================================
// Claim Events (dot-prefixed canonical format)
// ============================================================================

export interface ClaimCreatedEvent {
  type: "claim.created";
  claim: Claim;
}

export interface ClaimUpdatedEvent {
  type: "claim.updated";
  claim: Claim;
  changes: Partial<Claim>;
}

export interface ClaimDeletedEvent {
  type: "claim.deleted";
  issueId: string;
}

export interface ClaimHandoffEvent {
  type: "claim.handoff";
  from: Claimant;
  to: Claimant;
  issueId: string;
}

export type ClaimEvent =
  | ClaimCreatedEvent
  | ClaimUpdatedEvent
  | ClaimDeletedEvent
  | ClaimHandoffEvent;

// ============================================================================
// Agent Events
// ============================================================================

export interface AgentProgressEvent {
  type: "agent.progress";
  agentId: string;
  issueId?: string;
  progress: number;
}

export interface AgentLogEvent {
  type: "agent.log";
  agentId: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: Date;
}

export interface AgentStartedEvent {
  type: "agent.started";
  agentId: string;
  agentType: string;
  issueId?: string;
}

export interface AgentCompletedEvent {
  type: "agent.completed";
  agentId: string;
  result: "success" | "failure";
  issueId?: string;
}

export type AgentEvent =
  | AgentProgressEvent
  | AgentLogEvent
  | AgentStartedEvent
  | AgentCompletedEvent;

// ============================================================================
// Dashboard Event (umbrella)
// ============================================================================

export type DashboardEvent = ClaimEvent | AgentEvent;

// ============================================================================
// Storage-level events (un-prefixed, used internally by storage layer)
// Maps to ClaimEvent for broadcast via aggregator.
// ============================================================================

export interface StorageClaimEvent {
  type: "created" | "updated" | "deleted";
  claim: Claim;
  changes?: Partial<Claim>;
}

// ============================================================================
// Server -> Client WebSocket Messages
// ============================================================================

export interface SnapshotMessage {
  type: "snapshot";
  claims: Claim[];
}

export interface PongMessage {
  type: "pong";
}

export interface EventMessage {
  type: "event";
  event: DashboardEvent;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage = SnapshotMessage | PongMessage | EventMessage | ErrorMessage;

// ============================================================================
// Client -> Server WebSocket Messages
// ============================================================================

export interface SubscribeMessage {
  action: "subscribe";
  rooms: string[];
}

export interface UnsubscribeMessage {
  action: "unsubscribe";
  rooms: string[];
}

export interface PingMessage {
  action: "ping";
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

// ============================================================================
// Frontend-friendly WebSocket message (uses string-dated claims)
// ============================================================================

export type WSMessageType =
  | "snapshot"
  | "event"
  | "subscribed"
  | "error"
  | "pong";

export interface WsMessage {
  type: WSMessageType;
  claims?: ClaimJSON[];
  event?: FrontendClaimEvent;
  rooms?: string[];
  message?: string;
}

// Frontend ClaimEvent uses string timestamps via ClaimJSON
export interface FrontendClaimEvent {
  type: "claim.created" | "claim.updated" | "claim.deleted" | "agent.activity";
  claim?: ClaimJSON;
  claimId?: string;
  issueId?: string;
  activity?: AgentActivity;
  changes?: Partial<ClaimJSON>;
  timestamp?: string;
}

export interface AgentActivity {
  agentId: string;
  agentType: string;
  action: string;
  message: string;
  claimId?: string;
  timestamp: string;
}

// ============================================================================
// Orchestrator WebSocket Messages
// ============================================================================

export type OrchestratorWsMessageType =
  | "claim:created"
  | "claim:updated"
  | "claim:deleted"
  | "agent:status"
  | "orchestrator:heartbeat"
  | "orchestrator:command";

export interface OrchestratorWsMessage {
  type: OrchestratorWsMessageType;
  payload: unknown;
  timestamp: string;
}

// ============================================================================
// Room routing
// ============================================================================

export function getEventRooms(event: DashboardEvent): string[] {
  const rooms: string[] = [];

  switch (event.type) {
    case "claim.created":
    case "claim.updated":
    case "claim.deleted":
    case "claim.handoff":
      rooms.push("board");
      if ("claim" in event && event.claim) {
        rooms.push(`claim:${event.claim.issueId}`);
      } else if ("issueId" in event) {
        rooms.push(`claim:${event.issueId}`);
      }
      break;

    case "agent.progress":
    case "agent.log":
    case "agent.started":
    case "agent.completed":
      rooms.push("logs");
      rooms.push(`agent:${event.agentId}`);
      break;
  }

  return rooms;
}
