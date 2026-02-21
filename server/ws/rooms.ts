// dashboard/server/ws/rooms.ts

/**
 * Room-based subscription manager for WebSocket connections
 *
 * Supported rooms:
 * - "board" - All claim events (main Kanban view)
 * - "logs" - All agent activity logs (activity sidebar)
 * - "agent:{id}" - Single agent events (agent detail view)
 * - "claim:{id}" - Single claim events (claim detail modal)
 */
export class RoomManager {
  // Map of room name -> Set of connection IDs
  private rooms = new Map<string, Set<string>>();
  // Map of connection ID -> Set of room names (reverse index)
  private connectionRooms = new Map<string, Set<string>>();

  /**
   * Join a connection to a room
   */
  join(room: string, connectionId: string): void {
    // Add to room
    let roomMembers = this.rooms.get(room);
    if (!roomMembers) {
      roomMembers = new Set();
      this.rooms.set(room, roomMembers);
    }
    roomMembers.add(connectionId);

    // Add to reverse index
    let connRooms = this.connectionRooms.get(connectionId);
    if (!connRooms) {
      connRooms = new Set();
      this.connectionRooms.set(connectionId, connRooms);
    }
    connRooms.add(room);
  }

  /**
   * Remove a connection from a room
   */
  leave(room: string, connectionId: string): void {
    // Remove from room
    const roomMembers = this.rooms.get(room);
    if (roomMembers) {
      roomMembers.delete(connectionId);
      if (roomMembers.size === 0) {
        this.rooms.delete(room);
      }
    }

    // Remove from reverse index
    const connRooms = this.connectionRooms.get(connectionId);
    if (connRooms) {
      connRooms.delete(room);
      if (connRooms.size === 0) {
        this.connectionRooms.delete(connectionId);
      }
    }
  }

  /**
   * Get all connection IDs in a room
   */
  getMembers(room: string): Set<string> {
    return this.rooms.get(room) ?? new Set();
  }

  /**
   * Get all rooms a connection is subscribed to
   */
  getRooms(connectionId: string): Set<string> {
    return this.connectionRooms.get(connectionId) ?? new Set();
  }

  /**
   * Check if a connection is in a room
   */
  isInRoom(room: string, connectionId: string): boolean {
    const roomMembers = this.rooms.get(room);
    return roomMembers?.has(connectionId) ?? false;
  }

  /**
   * Get room statistics
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [room, members] of this.rooms) {
      stats[room] = members.size;
    }
    return stats;
  }

  /**
   * Clear all rooms and connections
   */
  clear(): void {
    this.rooms.clear();
    this.connectionRooms.clear();
  }
}

