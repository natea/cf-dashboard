// dashboard/server/ws/hub.ts
import type { ServerWebSocket } from "bun";

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export class WebSocketHub {
  private clients = new Map<string, ServerWebSocket<unknown>>();
  private rooms = new Map<string, Set<string>>();
  private clientRooms = new Map<string, Set<string>>();

  addClient(clientId: string, ws: ServerWebSocket<unknown>): void {
    this.clients.set(clientId, ws);
    this.clientRooms.set(clientId, new Set());
  }

  removeClient(clientId: string): void {
    // Leave all rooms
    const rooms = this.clientRooms.get(clientId);
    if (rooms) {
      for (const room of rooms) {
        this.leaveRoom(clientId, room);
      }
    }
    this.clients.delete(clientId);
    this.clientRooms.delete(clientId);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  joinRoom(clientId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);
    this.clientRooms.get(clientId)?.add(room);
  }

  leaveRoom(clientId: string, room: string): void {
    this.rooms.get(room)?.delete(clientId);
    this.clientRooms.get(clientId)?.delete(room);
  }

  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.clients.values()) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  broadcastToRoom(room: string, message: WSMessage): void {
    const data = JSON.stringify(message);
    const clientIds = this.rooms.get(room);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  sendTo(clientId: string, message: WSMessage): void {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }
}
