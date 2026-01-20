import { useEffect, useState, useCallback, useRef } from "react";
import { createWebSocketClient, WebSocketClient } from "../lib/ws";
import { useClaimsStore } from "../stores/claims";
import { useActivityStore } from "../stores/activity";
import type { Claim, ClaimEvent } from "../lib/types";

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocketClient | null>(null);

  const setClaims = useClaimsStore((state) => state.setClaims);
  const updateClaim = useClaimsStore((state) => state.updateClaim);
  const removeClaim = useClaimsStore((state) => state.removeClaim);
  const addLog = useActivityStore((state) => state.addLog);

  const handleSnapshot = useCallback(
    (claims: Claim[]) => {
      setClaims(claims);
    },
    [setClaims]
  );

  const handleEvent = useCallback(
    (event: ClaimEvent) => {
      switch (event.type) {
        case "claim_created":
          if (event.claim) {
            updateClaim(event.claim);
          }
          break;

        case "claim_updated":
          if (event.claim) {
            updateClaim(event.claim);
          }
          break;

        case "claim_deleted":
          if (event.claimId) {
            removeClaim(event.claimId);
          }
          break;

        case "agent_activity":
          if (event.activity) {
            addLog(event.activity);
          }
          break;
      }
    },
    [updateClaim, removeClaim, addLog]
  );

  const handleConnectionChange = useCallback((isConnected: boolean) => {
    setConnected(isConnected);
  }, []);

  useEffect(() => {
    const client = createWebSocketClient({
      onSnapshot: handleSnapshot,
      onEvent: handleEvent,
      onConnectionChange: handleConnectionChange,
    });

    wsRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [handleSnapshot, handleEvent, handleConnectionChange]);

  const subscribe = useCallback((rooms: string[]) => {
    wsRef.current?.subscribe(rooms);
  }, []);

  const unsubscribe = useCallback((rooms: string[]) => {
    wsRef.current?.unsubscribe(rooms);
  }, []);

  const reconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current?.connect();
  }, []);

  return {
    connected,
    subscribe,
    unsubscribe,
    reconnect,
  };
}

// Hook for subscribing to a specific agent's logs
export function useAgentSubscription(agentId: string | null) {
  const { subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    if (agentId) {
      subscribe([`agent/${agentId}`]);
      return () => {
        unsubscribe([`agent/${agentId}`]);
      };
    }
  }, [agentId, subscribe, unsubscribe]);
}
