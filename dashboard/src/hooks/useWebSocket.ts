// dashboard/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from "react";
import { useClaimsStore } from "../stores/claims";
import type { Claim } from "../lib/types";

interface WSMessage {
  type: string;
  claim?: Claim;
  changes?: Partial<Claim>;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const { addClaim, updateClaim, removeClaim } = useClaimsStore();

  const connect = useCallback(() => {
    // Use relative WebSocket URL for proxy support
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      // Subscribe to board updates
      ws.send(JSON.stringify({ action: "subscribe", rooms: ["board"] }));
    };

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        console.log("WS message:", data);

        switch (data.type) {
          case "claim.created":
            if (data.claim) addClaim(data.claim);
            break;
          case "claim.updated":
            if (data.claim) updateClaim(data.claim);
            break;
          case "claim.deleted":
            if (data.claim) removeClaim(data.claim.issueId);
            break;
          case "pong":
            // Heartbeat response
            break;
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, reconnecting in 3s...");
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };
  }, [addClaim, updateClaim, removeClaim]);

  useEffect(() => {
    connect();

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: "ping" }));
      }
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
