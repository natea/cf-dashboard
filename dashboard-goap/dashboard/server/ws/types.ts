// dashboard/server/ws/types.ts
import type { Claim, Claimant } from "../domain/types";

/**
 * WebSocket room types for subscription-based messaging
 */
export type RoomType = "board" | "logs" | "agent" | "claim";

/**
 * Room identifier with optional resource ID
 */
export interface Room {
  type: RoomType;
  id?: string; // For agent:{id} or claim:{id} rooms
}

/**
 * Parse room string to Room object
 * @example "board" -> { type: "board" }
 * @example "agent:coder-1" -> { type: "agent", id: "coder-1" }
 */
export function parseRoom(room: string): Room {
  const [type, id] = room.split(":");
  return { type: type as RoomType, id };
}

/**
 * Serialize Room object to string
 */
export function serializeRoom(room: Room): string {
  return room.id ? `${room.type}:${room.id}` : room.type;
}

// ============================================================================
// Client -> Server Messages
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

/**
 * Type guard for ClientMessage
 */
export function isClientMessage(data: unknown): data is ClientMessage {
  if (typeof data !== "object" || data === null) return false;
  const msg = data as Record<string, unknown>;

  if (msg.action === "subscribe" || msg.action === "unsubscribe") {
    return Array.isArray(msg.rooms) && msg.rooms.every((r) => typeof r === "string");
  }

  if (msg.action === "ping") {
    return true;
  }

  return false;
}

// ============================================================================
// Server -> Client Messages
// ============================================================================

/**
 * Initial snapshot sent on connection/subscription
 */
export interface SnapshotMessage {
  type: "snapshot";
  claims: Claim[];
}

/**
 * Pong response to ping
 */
export interface PongMessage {
  type: "pong";
}

/**
 * Event message wrapping a DashboardEvent
 */
export interface EventMessage {
  type: "event";
  event: DashboardEvent;
}

/**
 * Error message for client errors
 */
export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage = SnapshotMessage | PongMessage | EventMessage | ErrorMessage;

// ============================================================================
// Dashboard Events (normalized from multiple sources)
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

export interface AgentProgressEvent {
  type: "agent.progress";
  agentId: string;
  issueId: string;
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

export type ClaimEvent =
  | ClaimCreatedEvent
  | ClaimUpdatedEvent
  | ClaimDeletedEvent
  | ClaimHandoffEvent;

export type AgentEvent =
  | AgentProgressEvent
  | AgentLogEvent
  | AgentStartedEvent
  | AgentCompletedEvent;

export type DashboardEvent = ClaimEvent | AgentEvent;

/**
 * Determine which rooms should receive an event
 */
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
