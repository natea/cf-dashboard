// dashboard/server/ws/hub.ts
import type { ServerWebSocket } from "bun";
import type { Claim } from "../domain/types";
import type { ClaimsStorage } from "../storage/interface";
import {
  type ClientMessage,
  type ServerMessage,
  type DashboardEvent,
  isClientMessage,
  getEventRooms,
} from "./types";
import { RoomManager } from "./rooms";

/**
 * WebSocket connection data attached to each socket
 */
export interface WebSocketData {
  id: string;
  subscribedRooms: Set<string>;
  connectedAt: Date;
  lastPing?: Date;
}

/**
 * WebSocket Hub manages all WebSocket connections and message routing
 *
 * Features:
 * - Room-based subscriptions (board, logs, agent/*, claim/*)
 * - Automatic snapshot on subscription
 * - Heartbeat/ping-pong for connection health
 * - Event broadcasting to subscribed rooms
 */
export class WebSocketHub {
  private connections = new Map<string, ServerWebSocket<WebSocketData>>();
  private roomManager = new RoomManager();
  private storage: ClaimsStorage | null = null;
  private connectionIdCounter = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Set the storage adapter for fetching snapshots
   */
  setStorage(storage: ClaimsStorage): void {
    this.storage = storage;
  }

  /**
   * Start heartbeat interval to detect stale connections
   */
  startHeartbeat(intervalMs = 30000, timeoutMs = 60000): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      for (const [id, ws] of this.connections) {
        const data = ws.data;
        if (data.lastPing) {
          const timeSincePing = now.getTime() - data.lastPing.getTime();
          if (timeSincePing > timeoutMs) {
            console.log(`[ws-hub] Connection ${id} timed out, closing`);
            ws.close(1000, "Connection timeout");
            continue;
          }
        }
        // Send ping
        this.send(ws, { type: "pong" }); // Using pong as keepalive
      }
    }, intervalMs);
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `ws-${++this.connectionIdCounter}-${Date.now().toString(36)}`;
  }

  /**
   * Handle new WebSocket connection
   */
  handleOpen(ws: ServerWebSocket<WebSocketData>): void {
    const id = this.generateConnectionId();
    ws.data = {
      id,
      subscribedRooms: new Set(),
      connectedAt: new Date(),
    };

    this.connections.set(id, ws);
    console.log(`[ws-hub] Connection opened: ${id} (total: ${this.connections.size})`);
  }

  /**
   * Handle WebSocket message
   */
  async handleMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer): Promise<void> {
    const data = ws.data;

    let parsed: unknown;
    try {
      const text = typeof message === "string" ? message : message.toString();
      parsed = JSON.parse(text);
    } catch {
      this.send(ws, {
        type: "error",
        code: "INVALID_JSON",
        message: "Failed to parse message as JSON",
      });
      return;
    }

    if (!isClientMessage(parsed)) {
      this.send(ws, {
        type: "error",
        code: "INVALID_MESSAGE",
        message: "Invalid message format",
      });
      return;
    }

    switch (parsed.action) {
      case "subscribe":
        await this.handleSubscribe(ws, parsed.rooms);
        break;

      case "unsubscribe":
        this.handleUnsubscribe(ws, parsed.rooms);
        break;

      case "ping":
        data.lastPing = new Date();
        this.send(ws, { type: "pong" });
        break;
    }
  }

  /**
   * Handle room subscription
   */
  private async handleSubscribe(ws: ServerWebSocket<WebSocketData>, rooms: string[]): Promise<void> {
    const data = ws.data;
    let shouldSendSnapshot = false;

    for (const room of rooms) {
      if (!data.subscribedRooms.has(room)) {
        data.subscribedRooms.add(room);
        this.roomManager.join(room, data.id);

        // Send snapshot when subscribing to board
        if (room === "board") {
          shouldSendSnapshot = true;
        }
      }
    }

    if (shouldSendSnapshot && this.storage) {
      const claims = await this.storage.listClaims();
      this.send(ws, {
        type: "snapshot",
        claims,
      });
    }
  }

  /**
   * Handle room unsubscription
   */
  private handleUnsubscribe(ws: ServerWebSocket<WebSocketData>, rooms: string[]): void {
    const data = ws.data;

    for (const room of rooms) {
      if (data.subscribedRooms.has(room)) {
        data.subscribedRooms.delete(room);
        this.roomManager.leave(room, data.id);
      }
    }
  }

  /**
   * Handle WebSocket close
   */
  handleClose(ws: ServerWebSocket<WebSocketData>, code: number, reason: string): void {
    const data = ws.data;

    // Leave all rooms
    for (const room of data.subscribedRooms) {
      this.roomManager.leave(room, data.id);
    }

    this.connections.delete(data.id);
    console.log(`[ws-hub] Connection closed: ${data.id} (code: ${code}, reason: ${reason || "none"}, total: ${this.connections.size})`);
  }

  /**
   * Handle WebSocket error
   */
  handleError(ws: ServerWebSocket<WebSocketData>, error: Error): void {
    console.error(`[ws-hub] Connection error for ${ws.data?.id}:`, error);
  }

  /**
   * Broadcast event to all connections subscribed to relevant rooms
   */
  broadcast(event: DashboardEvent): void {
    const rooms = getEventRooms(event);
    const message: ServerMessage = { type: "event", event };
    const messageStr = JSON.stringify(message);

    // Get unique connection IDs across all relevant rooms
    const connectionIds = new Set<string>();
    for (const room of rooms) {
      const members = this.roomManager.getMembers(room);
      for (const id of members) {
        connectionIds.add(id);
      }
    }

    // Send to all connections
    for (const id of connectionIds) {
      const ws = this.connections.get(id);
      if (ws) {
        ws.send(messageStr);
      }
    }

    console.log(`[ws-hub] Broadcast ${event.type} to ${connectionIds.size} connections in rooms: ${rooms.join(", ")}`);
  }

  /**
   * Send message to a specific WebSocket
   */
  private send(ws: ServerWebSocket<WebSocketData>, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`[ws-hub] Failed to send message:`, error);
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get room statistics
   */
  getRoomStats(): Record<string, number> {
    return this.roomManager.getStats();
  }

  /**
   * Close all connections (for graceful shutdown)
   */
  closeAll(reason = "Server shutdown"): void {
    this.stopHeartbeat();
    for (const ws of this.connections.values()) {
      ws.close(1001, reason);
    }
    this.connections.clear();
    this.roomManager.clear();
  }
}

// Singleton instance for the application
export const hub = new WebSocketHub();
