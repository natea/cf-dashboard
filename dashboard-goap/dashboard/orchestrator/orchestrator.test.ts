// dashboard/orchestrator/orchestrator.test.ts
// Unit tests for the Agent Orchestrator

import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { Orchestrator } from "./orchestrator";
import { TaskRouter } from "./task-router";
import { DashboardClient } from "./dashboard-client";
import { AgentSpawner } from "./agent-spawner";
import type { OrchestratorConfig, OrchestratorState } from "./types";

// Mock configuration
const mockConfig: OrchestratorConfig = {
  dashboardUrl: "http://localhost:3000",
  maxAgents: 4,
  maxRetries: 2,
  retryDelayMs: 1000,
  pollIntervalMs: 5000,
  gracefulShutdownMs: 5000,
  workingDir: "/tmp/test",
};

describe("Orchestrator", () => {
  describe("construction", () => {
    it("should create an orchestrator with default config", () => {
      const orchestrator = new Orchestrator();
      const state = orchestrator.getState();

      expect(state.status).toBe("idle");
      expect(state.activeAgents.size).toBe(0);
      expect(state.claimsProcessed).toBe(0);
    });

    it("should create an orchestrator with custom config", () => {
      const orchestrator = new Orchestrator(mockConfig);
      const state = orchestrator.getState();

      expect(state.maxConcurrentAgents).toBe(4);
      expect(state.dashboardUrl).toBe("http://localhost:3000");
    });

    it("should generate a unique orchestrator ID", () => {
      const orchestrator1 = new Orchestrator(mockConfig);
      const orchestrator2 = new Orchestrator(mockConfig);

      expect(orchestrator1.getState().id).not.toBe(orchestrator2.getState().id);
    });
  });

  describe("state transitions", () => {
    it("should start in idle status", () => {
      const orchestrator = new Orchestrator(mockConfig);
      expect(orchestrator.getState().status).toBe("idle");
    });

    it("should transition from idle to running on start", async () => {
      const orchestrator = new Orchestrator(mockConfig);

      // Mock the dashboard client connect method
      const mockConnect = mock(() => Promise.resolve());
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.connect =
        mockConnect;
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.subscribe =
        mock(() => () => {});

      await orchestrator.start();
      expect(orchestrator.getState().status).toBe("running");

      // Clean up
      await orchestrator.stop();
    });

    it("should transition from running to paused on pause", async () => {
      const orchestrator = new Orchestrator(mockConfig);

      // Mock methods
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.connect =
        mock(() => Promise.resolve());
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.subscribe =
        mock(() => () => {});

      await orchestrator.start();
      orchestrator.pause();

      expect(orchestrator.getState().status).toBe("paused");

      await orchestrator.stop();
    });

    it("should transition from paused to running on resume", async () => {
      const orchestrator = new Orchestrator(mockConfig);

      // Mock methods
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.connect =
        mock(() => Promise.resolve());
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.subscribe =
        mock(() => () => {});

      await orchestrator.start();
      orchestrator.pause();
      orchestrator.resume();

      expect(orchestrator.getState().status).toBe("running");

      await orchestrator.stop();
    });

    it("should not transition from idle to paused", () => {
      const orchestrator = new Orchestrator(mockConfig);

      orchestrator.pause();

      // Should still be idle, not paused
      expect(orchestrator.getState().status).toBe("idle");
    });

    it("should not transition from stopped to running", async () => {
      const orchestrator = new Orchestrator(mockConfig);

      // Mock methods
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.connect =
        mock(() => Promise.resolve());
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.subscribe =
        mock(() => () => {});
      (orchestrator as unknown as { dashboardClient: DashboardClient }).dashboardClient.disconnect =
        mock(() => {});

      await orchestrator.start();
      await orchestrator.stop();

      // Try to start again - should fail
      orchestrator.resume();

      expect(orchestrator.getState().status).toBe("stopped");
    });
  });

  describe("event subscription", () => {
    it("should allow subscribing to events", () => {
      const orchestrator = new Orchestrator(mockConfig);
      const events: unknown[] = [];

      const unsubscribe = orchestrator.subscribe((event) => {
        events.push(event);
      });

      expect(typeof unsubscribe).toBe("function");
    });

    it("should call unsubscribe to remove listener", () => {
      const orchestrator = new Orchestrator(mockConfig);
      const events: unknown[] = [];

      const unsubscribe = orchestrator.subscribe((event) => {
        events.push(event);
      });

      unsubscribe();

      // Events should not be received after unsubscribe
      // (Would need to trigger an event to test this fully)
    });
  });

  describe("getState", () => {
    it("should return a snapshot of the current state", () => {
      const orchestrator = new Orchestrator(mockConfig);
      const state = orchestrator.getState();

      expect(state).toHaveProperty("id");
      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("activeAgents");
      expect(state).toHaveProperty("maxConcurrentAgents");
      expect(state).toHaveProperty("dashboardUrl");
      expect(state).toHaveProperty("wsConnected");
      expect(state).toHaveProperty("lastHeartbeat");
      expect(state).toHaveProperty("startedAt");
      expect(state).toHaveProperty("claimsProcessed");
      expect(state).toHaveProperty("claimsSucceeded");
      expect(state).toHaveProperty("claimsFailed");
    });

    it("should return a copy of activeAgents map", () => {
      const orchestrator = new Orchestrator(mockConfig);
      const state1 = orchestrator.getState();
      const state2 = orchestrator.getState();

      // Should be different Map instances
      expect(state1.activeAgents).not.toBe(state2.activeAgents);
    });
  });
});

describe("TaskRouter", () => {
  it("should create a router with default logger", () => {
    const router = new TaskRouter();
    expect(router).toBeDefined();
  });

  // Note: These tests use heuristic routing since claude-flow CLI may not be available
  // The router will automatically fall back to heuristics if CLI fails/times out

  it("should route a simple task using heuristics", async () => {
    const router = new TaskRouter();
    // Mark CLI as unavailable to force heuristic routing
    (router as unknown as { claudeFlowAvailable: boolean | null }).claudeFlowAvailable = false;

    const result = await router.route({
      issueId: "test-1",
      title: "Fix bug in login form",
      description: "Users cannot login when password contains special characters",
    });

    expect(result).toHaveProperty("agentType");
    expect(result).toHaveProperty("modelTier");
    expect(result).toHaveProperty("confidence");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("should detect bug-related tasks and route to debugger", async () => {
    const router = new TaskRouter();
    (router as unknown as { claudeFlowAvailable: boolean | null }).claudeFlowAvailable = false;

    const result = await router.route({
      issueId: "test-2",
      title: "Bug: Application crashes on startup",
      labels: ["bug"],
    });

    expect(result.agentType).toBe("debugger");
  });

  it("should detect test-related tasks and route to tester", async () => {
    const router = new TaskRouter();
    (router as unknown as { claudeFlowAvailable: boolean | null }).claudeFlowAvailable = false;

    const result = await router.route({
      issueId: "test-3",
      title: "Add unit tests for user service",
      labels: ["test", "testing"],
    });

    expect(result.agentType).toBe("tester");
  });

  it("should default to coder for generic tasks", async () => {
    const router = new TaskRouter();
    (router as unknown as { claudeFlowAvailable: boolean | null }).claudeFlowAvailable = false;

    const result = await router.route({
      issueId: "test-4",
      title: "Implement new feature",
    });

    expect(result.agentType).toBe("coder");
  });
});

describe("DashboardClient", () => {
  it("should create a client with config", () => {
    const client = new DashboardClient({
      url: "http://localhost:3000",
    });

    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  it("should build correct WebSocket URL", () => {
    const client = new DashboardClient({
      url: "http://localhost:3000",
      wsPath: "/ws",
    });

    // We can't directly test the private method, but we can verify the client is created
    expect(client).toBeDefined();
  });

  it("should allow subscribing before connect", () => {
    const client = new DashboardClient({
      url: "http://localhost:3000",
    });

    const unsubscribe = client.subscribe((msg) => {
      // Handle message
    });

    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });
});

describe("AgentSpawner", () => {
  it("should create a spawner with config", () => {
    const spawner = new AgentSpawner({
      dashboardUrl: "http://localhost:3000",
    });

    expect(spawner).toBeDefined();
  });

  it("should return empty active agents map initially", () => {
    const spawner = new AgentSpawner({
      dashboardUrl: "http://localhost:3000",
    });

    const activeAgents = spawner.getActiveAgents();
    expect(activeAgents.size).toBe(0);
  });

  it("should handle terminate on non-existent agent gracefully", async () => {
    const spawner = new AgentSpawner({
      dashboardUrl: "http://localhost:3000",
    });

    // Should not throw
    await spawner.terminate("non-existent-agent-id");
  });

  it("should handle terminateAll with no active agents", async () => {
    const spawner = new AgentSpawner({
      dashboardUrl: "http://localhost:3000",
    });

    // Should not throw
    await spawner.terminateAll();
  });
});
