// server/ws/types.ts
// WebSocket types. Event types are re-exported from shared/events.ts.

// Re-export all event types from shared for backward compat
export type {
  ClaimCreatedEvent,
  ClaimUpdatedEvent,
  ClaimDeletedEvent,
  ClaimEvent,
  AgentProgressEvent,
  AgentLogEvent,
  AgentStartedEvent,
  AgentCompletedEvent,
  AgentEvent,
  DashboardEvent,
  SnapshotMessage,
  PongMessage,
  EventMessage,
  ErrorMessage,
  ServerMessage,
  ClientMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PingMessage,
} from "../../shared/events";
export { getEventRooms } from "../../shared/events";

// ============================================================================
// Room types (ws-specific)
// ============================================================================

export type RoomType = "board" | "logs" | "agent" | "claim";

export interface Room {
  type: RoomType;
  id?: string;
}

export function parseRoom(room: string): Room {
  const [type, id] = room.split(":");
  return { type: type as RoomType, id };
}

export function serializeRoom(room: Room): string {
  return room.id ? `${room.type}:${room.id}` : room.type;
}

export function isClientMessage(data: unknown): data is import("../../shared/events").ClientMessage {
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
