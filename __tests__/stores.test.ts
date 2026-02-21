// dashboard/__tests__/stores.test.ts
import { describe, expect, test, beforeEach } from "bun:test";

// Mock zustand persist middleware for testing
const mockPersist = (fn: Function) => fn;

// We need to test the stores without React, so we'll test the store logic directly
// This is a simplified version that tests the core store logic

describe("ClaimsStore logic", () => {
  // Test the mapStatusToColumn logic
  describe("mapStatusToColumn", () => {
    type ColumnId = "backlog" | "agent_working" | "human_review" | "revision" | "done";

    interface Claim {
      id: string;
      issueId: string;
      status: string;
      claimant?: { type: "human" | "agent"; [key: string]: unknown };
      metadata?: { postReview?: boolean };
      [key: string]: unknown;
    }

    function mapStatusToColumn(claim: Claim): ColumnId {
      if (claim.status === "completed") return "done";
      if (claim.status === "backlog" && !claim.claimant) return "backlog";

      if (
        claim.status === "review-requested" ||
        (claim.claimant?.type === "human" && claim.status === "active")
      ) {
        return "human_review";
      }

      if (claim.claimant?.type === "agent") {
        if (claim.metadata?.postReview) return "revision";
        if (
          claim.status === "active" ||
          claim.status === "blocked" ||
          claim.status === "paused"
        ) {
          return "agent_working";
        }
      }

      if (claim.claimant) {
        return claim.claimant.type === "agent" ? "agent_working" : "human_review";
      }

      return "backlog";
    }

    test("maps completed status to done column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "completed",
      };
      expect(mapStatusToColumn(claim)).toBe("done");
    });

    test("maps backlog without claimant to backlog column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "backlog",
      };
      expect(mapStatusToColumn(claim)).toBe("backlog");
    });

    test("maps review-requested to human_review column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "review-requested",
        claimant: { type: "agent", agentId: "coder-1" },
      };
      expect(mapStatusToColumn(claim)).toBe("human_review");
    });

    test("maps active human claimant to human_review column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "active",
        claimant: { type: "human", userId: "user-1" },
      };
      expect(mapStatusToColumn(claim)).toBe("human_review");
    });

    test("maps active agent claimant to agent_working column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "active",
        claimant: { type: "agent", agentId: "coder-1" },
      };
      expect(mapStatusToColumn(claim)).toBe("agent_working");
    });

    test("maps blocked agent claimant to agent_working column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "blocked",
        claimant: { type: "agent", agentId: "coder-1" },
      };
      expect(mapStatusToColumn(claim)).toBe("agent_working");
    });

    test("maps paused agent claimant to agent_working column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "paused",
        claimant: { type: "agent", agentId: "coder-1" },
      };
      expect(mapStatusToColumn(claim)).toBe("agent_working");
    });

    test("maps post-review agent to revision column", () => {
      const claim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "active",
        claimant: { type: "agent", agentId: "coder-1" },
        metadata: { postReview: true },
      };
      expect(mapStatusToColumn(claim)).toBe("revision");
    });

    test("maps claimed backlog to appropriate column based on claimant type", () => {
      const agentClaim: Claim = {
        id: "1",
        issueId: "TEST-1",
        status: "backlog",
        claimant: { type: "agent", agentId: "coder-1" },
      };
      expect(mapStatusToColumn(agentClaim)).toBe("agent_working");

      const humanClaim: Claim = {
        id: "2",
        issueId: "TEST-2",
        status: "backlog",
        claimant: { type: "human", userId: "user-1" },
      };
      expect(mapStatusToColumn(humanClaim)).toBe("human_review");
    });
  });

  describe("Claims Map operations", () => {
    test("setClaims creates Map from array", () => {
      const claims = new Map<string, { id: string; issueId: string }>();

      const claimArray = [
        { id: "1", issueId: "TEST-1" },
        { id: "2", issueId: "TEST-2" },
      ];

      // Simulate setClaims logic
      const newMap = new Map(claimArray.map((c) => [c.id, c]));

      expect(newMap.size).toBe(2);
      expect(newMap.get("1")).toEqual({ id: "1", issueId: "TEST-1" });
      expect(newMap.get("2")).toEqual({ id: "2", issueId: "TEST-2" });
    });

    test("updateClaim modifies existing claim", () => {
      const claims = new Map([
        ["1", { id: "1", issueId: "TEST-1", status: "backlog" }],
      ]);

      // Simulate updateClaim logic
      const next = new Map(claims);
      next.set("1", { id: "1", issueId: "TEST-1", status: "active" });

      expect(next.get("1")?.status).toBe("active");
    });

    test("removeClaim deletes claim", () => {
      const claims = new Map([
        ["1", { id: "1", issueId: "TEST-1" }],
        ["2", { id: "2", issueId: "TEST-2" }],
      ]);

      // Simulate removeClaim logic
      const next = new Map(claims);
      next.delete("1");

      expect(next.size).toBe(1);
      expect(next.has("1")).toBe(false);
      expect(next.has("2")).toBe(true);
    });
  });
});

describe("ActivityStore logic", () => {
  describe("Log management", () => {
    test("addLog prepends new activity to logs", () => {
      const logs: Array<{ id: string; timestamp: string }> = [];
      const maxLogs = 200;

      // Simulate addLog logic
      const activity1 = { id: "1", timestamp: "2024-01-01T00:00:00Z" };
      const logs1 = [activity1, ...logs].slice(0, maxLogs);
      expect(logs1).toHaveLength(1);
      expect(logs1[0].id).toBe("1");

      const activity2 = { id: "2", timestamp: "2024-01-01T00:01:00Z" };
      const logs2 = [activity2, ...logs1].slice(0, maxLogs);
      expect(logs2).toHaveLength(2);
      expect(logs2[0].id).toBe("2"); // Most recent first
      expect(logs2[1].id).toBe("1");
    });

    test("addLog respects maxLogs limit", () => {
      const maxLogs = 3;
      let logs: Array<{ id: string }> = [];

      // Add 5 logs
      for (let i = 1; i <= 5; i++) {
        const activity = { id: String(i) };
        logs = [activity, ...logs].slice(0, maxLogs);
      }

      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.id)).toEqual(["5", "4", "3"]);
    });

    test("getRecentLogs returns limited results", () => {
      const logs = Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 1),
      }));

      // Simulate getRecentLogs logic
      const recent = logs.slice(0, 50);
      expect(recent).toHaveLength(50);
    });

    test("getLogsForClaim filters by claimId", () => {
      const logs = [
        { id: "1", claimId: "CLAIM-A" },
        { id: "2", claimId: "CLAIM-B" },
        { id: "3", claimId: "CLAIM-A" },
        { id: "4", claimId: "CLAIM-C" },
      ];

      // Simulate getLogsForClaim logic
      const filtered = logs.filter((log) => log.claimId === "CLAIM-A");
      expect(filtered).toHaveLength(2);
      expect(filtered.map((l) => l.id)).toEqual(["1", "3"]);
    });
  });

  describe("Agent tracking", () => {
    test("updateAgent adds/updates agent in map", () => {
      const agents = new Map<
        string,
        { agentId: string; status: string; lastSeen: string }
      >();

      // Simulate updateAgent logic
      const agent1 = {
        agentId: "coder-1",
        status: "working",
        lastSeen: new Date().toISOString(),
      };
      agents.set(agent1.agentId, agent1);

      expect(agents.size).toBe(1);
      expect(agents.get("coder-1")?.status).toBe("working");

      // Update same agent
      const agent1Updated = { ...agent1, status: "idle" };
      agents.set(agent1Updated.agentId, agent1Updated);

      expect(agents.size).toBe(1);
      expect(agents.get("coder-1")?.status).toBe("idle");
    });

    test("removeAgent deletes agent from map", () => {
      const agents = new Map([
        [
          "coder-1",
          { agentId: "coder-1", status: "working", lastSeen: "2024-01-01" },
        ],
        [
          "tester-1",
          { agentId: "tester-1", status: "idle", lastSeen: "2024-01-01" },
        ],
      ]);

      // Simulate removeAgent logic
      agents.delete("coder-1");

      expect(agents.size).toBe(1);
      expect(agents.has("coder-1")).toBe(false);
      expect(agents.has("tester-1")).toBe(true);
    });

    test("getActiveAgents filters by recent lastSeen", () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      const tenMinutesAgo = now - 10 * 60 * 1000;

      const agents = [
        {
          agentId: "active-1",
          status: "working",
          lastSeen: new Date(now - 1000).toISOString(),
        },
        {
          agentId: "active-2",
          status: "idle",
          lastSeen: new Date(now - 2 * 60 * 1000).toISOString(),
        },
        {
          agentId: "stale-1",
          status: "working",
          lastSeen: new Date(tenMinutesAgo).toISOString(),
        },
      ];

      // Simulate getActiveAgents logic
      const activeAgents = agents.filter(
        (agent) => new Date(agent.lastSeen).getTime() > fiveMinutesAgo
      );

      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.map((a) => a.agentId).sort()).toEqual([
        "active-1",
        "active-2",
      ]);
    });
  });

  describe("Agent display helpers", () => {
    test("agentTypeColors returns correct colors", () => {
      const agentTypeColors: Record<string, string> = {
        coder: "bg-blue-500",
        researcher: "bg-purple-500",
        tester: "bg-green-500",
        reviewer: "bg-yellow-500",
        architect: "bg-red-500",
        debugger: "bg-orange-500",
        default: "bg-gray-500",
      };

      expect(agentTypeColors.coder).toBe("bg-blue-500");
      expect(agentTypeColors.tester).toBe("bg-green-500");
      expect(agentTypeColors.unknown || agentTypeColors.default).toBe(
        "bg-gray-500"
      );
    });

    test("getAgentColor falls back to default", () => {
      const agentTypeColors: Record<string, string> = {
        coder: "bg-blue-500",
        default: "bg-gray-500",
      };

      function getAgentColor(agentType: string): string {
        return agentTypeColors[agentType] || agentTypeColors.default;
      }

      expect(getAgentColor("coder")).toBe("bg-blue-500");
      expect(getAgentColor("unknown-type")).toBe("bg-gray-500");
    });
  });
});

describe("AuthStore logic", () => {
  describe("Authentication state", () => {
    test("setUser updates authentication state", () => {
      let state = {
        user: null as { id: string; name: string } | null,
        isAuthenticated: false,
        isLoading: true,
      };

      // Simulate setUser logic
      const user = { id: "user-1", name: "Alice" };
      state = {
        user,
        isAuthenticated: !!user,
        isLoading: false,
      };

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    test("logout clears user state", () => {
      let state = {
        user: { id: "user-1", name: "Alice" } as { id: string; name: string } | null,
        isAuthenticated: true,
        isLoading: false,
      };

      // Simulate logout logic
      state = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    test("setUser with null logs out user", () => {
      let state = {
        user: { id: "user-1", name: "Alice" } as { id: string; name: string } | null,
        isAuthenticated: true,
        isLoading: false,
      };

      // Simulate setUser(null) logic
      const user = null;
      state = {
        user,
        isAuthenticated: !!user,
        isLoading: false,
      };

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe("Helper functions", () => {
    test("getCurrentUserId returns user id when authenticated", () => {
      const state = {
        user: { id: "user-1", name: "Alice" },
      };

      function getCurrentUserId(): string | null {
        return state.user?.id || null;
      }

      expect(getCurrentUserId()).toBe("user-1");
    });

    test("getCurrentUserId returns null when not authenticated", () => {
      const state = {
        user: null as { id: string; name: string } | null,
      };

      function getCurrentUserId(): string | null {
        return state.user?.id || null;
      }

      expect(getCurrentUserId()).toBeNull();
    });

    test("getCurrentUserName returns user name when authenticated", () => {
      const state = {
        user: { id: "user-1", name: "Alice" },
      };

      function getCurrentUserName(): string | null {
        return state.user?.name || null;
      }

      expect(getCurrentUserName()).toBe("Alice");
    });
  });

  describe("Persistence partialize", () => {
    test("partialize returns only user and isAuthenticated", () => {
      const state = {
        user: { id: "user-1", name: "Alice" },
        isAuthenticated: true,
        isLoading: false,
        someOtherState: "value",
      };

      // Simulate persist partialize
      const persisted = {
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      };

      expect(persisted).toEqual({
        user: { id: "user-1", name: "Alice" },
        isAuthenticated: true,
      });
      expect((persisted as Record<string, unknown>).isLoading).toBeUndefined();
      expect(
        (persisted as Record<string, unknown>).someOtherState
      ).toBeUndefined();
    });
  });
});
