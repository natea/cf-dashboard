import type { WSMessage, ClaimEvent } from "./types";

export type WSEventHandler = (event: ClaimEvent) => void;
export type WSSnapshotHandler = (claims: import("./types").Claim[]) => void;
export type WSConnectionHandler = (connected: boolean) => void;

interface WSClientOptions {
  onEvent?: WSEventHandler;
  onSnapshot?: WSSnapshotHandler;
  onConnectionChange?: WSConnectionHandler;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private options: Required<WSClientOptions>;
  private isIntentionalClose = false;

  constructor(options: WSClientOptions = {}) {
    this.options = {
      onEvent: options.onEvent || (() => {}),
      onSnapshot: options.onSnapshot || (() => {}),
      onConnectionChange: options.onConnectionChange || (() => {}),
      reconnectDelay: options.reconnectDelay || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
    };
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionalClose = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(url);
      this.setupEventHandlers();
    } catch (error) {
      console.error("WebSocket connection failed:", error);
      this.scheduleReconnect();
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      this.options.onConnectionChange(true);
      this.startHeartbeat();
      this.subscribe(["board", "logs"]);
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      this.options.onConnectionChange(false);
      this.stopHeartbeat();

      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  private handleMessage(message: WSMessage): void {
    switch (message.type) {
      case "snapshot":
        if (message.claims) {
          this.options.onSnapshot(message.claims);
        }
        break;

      case "event":
        if (message.event) {
          this.options.onEvent(message.event);
        }
        break;

      case "subscribed":
        console.log("Subscribed to rooms:", message.rooms);
        break;

      case "error":
        console.error("WebSocket server error:", message.message);
        break;

      case "pong":
        // Heartbeat acknowledged
        break;
    }
  }

  subscribe(rooms: string[]): void {
    this.send({ action: "subscribe", rooms });
  }

  unsubscribe(rooms: string[]): void {
    this.send({ action: "unsubscribe", rooms });
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ action: "ping" });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached");
      return;
    }

    const delay =
      this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.isIntentionalClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }
  return wsClient;
}

export function createWebSocketClient(
  options: WSClientOptions
): WebSocketClient {
  wsClient = new WebSocketClient(options);
  return wsClient;
}
