// dashboard/server/ws/hub.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { WebSocketHub } from "./hub";

describe("WebSocketHub", () => {
  let hub: WebSocketHub;

  beforeEach(() => {
    hub = new WebSocketHub();
  });

  test("tracks connected clients", () => {
    const mockWs = { send: () => {}, readyState: 1 } as any;
    hub.addClient("client-1", mockWs);

    expect(hub.getClientCount()).toBe(1);

    hub.removeClient("client-1");
    expect(hub.getClientCount()).toBe(0);
  });

  test("broadcasts to all clients", () => {
    const messages: string[] = [];
    const mockWs = {
      send: (msg: string) => messages.push(msg),
      readyState: 1,
    } as any;

    hub.addClient("client-1", mockWs);
    hub.broadcast({ type: "test", data: "hello" });

    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ type: "test", data: "hello" });
  });

  test("manages room subscriptions", () => {
    const messages: string[] = [];
    const mockWs = {
      send: (msg: string) => messages.push(msg),
      readyState: 1,
    } as any;

    hub.addClient("client-1", mockWs);
    hub.joinRoom("client-1", "board");
    hub.broadcastToRoom("board", { type: "update" });

    expect(messages).toHaveLength(1);

    hub.leaveRoom("client-1", "board");
    hub.broadcastToRoom("board", { type: "update2" });

    expect(messages).toHaveLength(1); // No new message
  });
});
