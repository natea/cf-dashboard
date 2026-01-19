// dashboard/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from "react";
import { useClaimsStore } from "../stores/claims";
import { useActivityStore } from "../stores/activity";
import { getWebSocketUrl } from "../lib/auth";
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
  const addActivity = useActivityStore((s) => s.addEvent);

  const connect = useCallback(() => {
    // Use authenticated WebSocket URL
    const wsUrl = getWebSocketUrl();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      // Subscribe to board updates
      ws.send(JSON.stringify({ action: "subscribe", rooms: ["board"] }));
      addActivity({
        type: "claim.updated",
        message: "Connected to real-time updates",
      });
    };

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        console.log("WS message:", data);

        switch (data.type) {
          case "claim.created":
            if (data.claim) {
              addClaim(data.claim);
              addActivity({
                type: "claim.created",
                issueId: data.claim.issueId,
                title: data.claim.title,
                message: `New claim: ${data.claim.title}`,
              });
            }
            break;
          case "claim.updated":
            if (data.claim) {
              updateClaim(data.claim);
              addActivity({
                type: "claim.updated",
                issueId: data.claim.issueId,
                title: data.claim.title,
                message: `Updated: ${data.claim.title} → ${data.claim.status}`,
              });
            }
            break;
          case "claim.deleted":
            if (data.claim) {
              removeClaim(data.claim.issueId);
              addActivity({
                type: "claim.deleted",
                issueId: data.claim.issueId,
                title: data.claim.title,
                message: `Deleted: ${data.claim.title}`,
              });
            }
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
  }, [addClaim, updateClaim, removeClaim, addActivity]);

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
