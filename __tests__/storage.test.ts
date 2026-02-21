// dashboard/__tests__/storage.test.ts
import { describe, expect, test, beforeEach, mock, spyOn } from "bun:test";
import { MemoryStorage } from "../server/storage/memory";
import type { ClaimFilter, ClaimEvent } from "../server/storage/interface";
import type { Claim, ClaimStatus } from "../server/domain/types";

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe("CRUD operations", () => {
    test("creates a claim with auto-generated id and timestamps", async () => {
      const claim = await storage.createClaim({
        issueId: "TEST-001",
        source: "manual",
        title: "Test Issue",
        status: "backlog",
        progress: 0,
      });

      expect(claim.id).toBeDefined();
      expect(claim.id.length).toBeGreaterThan(0);
      expect(claim.issueId).toBe("TEST-001");
      expect(claim.source).toBe("manual");
      expect(claim.title).toBe("Test Issue");
      expect(claim.status).toBe("backlog");
      expect(claim.progress).toBe(0);
      expect(claim.createdAt).toBeInstanceOf(Date);
      expect(claim.updatedAt).toBeInstanceOf(Date);
    });

    test("retrieves an existing claim by issueId", async () => {
      const created = await storage.createClaim({
        issueId: "TEST-002",
        source: "github",
        title: "GitHub Issue",
        status: "backlog",
        progress: 0,
      });

      const retrieved = await storage.getClaim("TEST-002");
      expect(retrieved).toEqual(created);
    });

    test("returns null for non-existent claim", async () => {
      const result = await storage.getClaim("NON-EXISTENT");
      expect(result).toBeNull();
    });

    test("updates an existing claim", async () => {
      await storage.createClaim({
        issueId: "TEST-003",
        source: "manual",
        title: "Original Title",
        status: "backlog",
        progress: 0,
      });

      const updated = await storage.updateClaim("TEST-003", {
        title: "Updated Title",
        status: "active",
        progress: 50,
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe("Updated Title");
      expect(updated?.status).toBe("active");
      expect(updated?.progress).toBe(50);
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        updated?.createdAt.getTime() ?? 0
      );
    });

    test("returns null when updating non-existent claim", async () => {
      const result = await storage.updateClaim("NON-EXISTENT", {
        title: "New Title",
      });
      expect(result).toBeNull();
    });

    test("deletes an existing claim", async () => {
      await storage.createClaim({
        issueId: "TEST-004",
        source: "manual",
        title: "To Delete",
        status: "backlog",
        progress: 0,
      });

      const deleted = await storage.deleteClaim("TEST-004");
      expect(deleted).toBe(true);

      const retrieved = await storage.getClaim("TEST-004");
      expect(retrieved).toBeNull();
    });

    test("returns false when deleting non-existent claim", async () => {
      const result = await storage.deleteClaim("NON-EXISTENT");
      expect(result).toBe(false);
    });
  });

  describe("listClaims with filters", () => {
    beforeEach(async () => {
      // Set up test data
      await storage.createClaim({
        issueId: "MANUAL-1",
        source: "manual",
        title: "Manual Backlog",
        status: "backlog",
        progress: 0,
      });
      await storage.createClaim({
        issueId: "GH-1",
        source: "github",
        title: "GitHub Active",
        status: "active",
        progress: 25,
        claimant: { type: "agent", agentId: "coder-1", agentType: "coder" },
      });
      await storage.createClaim({
        issueId: "MCP-1",
        source: "mcp",
        title: "MCP Review",
        status: "review-requested",
        progress: 75,
        claimant: { type: "human", userId: "user-1", name: "Alice" },
      });
      await storage.createClaim({
        issueId: "GH-2",
        source: "github",
        title: "GitHub Completed",
        status: "completed",
        progress: 100,
      });
    });

    test("lists all claims without filter", async () => {
      const claims = await storage.listClaims();
      expect(claims).toHaveLength(4);
    });

    test("filters by status", async () => {
      const backlog = await storage.listClaims({ status: "backlog" });
      expect(backlog).toHaveLength(1);
      expect(backlog[0].issueId).toBe("MANUAL-1");

      const active = await storage.listClaims({ status: "active" });
      expect(active).toHaveLength(1);
      expect(active[0].issueId).toBe("GH-1");
    });

    test("filters by source", async () => {
      const github = await storage.listClaims({ source: "github" });
      expect(github).toHaveLength(2);
      expect(github.map((c) => c.issueId).sort()).toEqual(["GH-1", "GH-2"]);

      const manual = await storage.listClaims({ source: "manual" });
      expect(manual).toHaveLength(1);
    });

    test("filters by claimant type", async () => {
      const agents = await storage.listClaims({ claimantType: "agent" });
      expect(agents).toHaveLength(1);
      expect(agents[0].issueId).toBe("GH-1");

      const humans = await storage.listClaims({ claimantType: "human" });
      expect(humans).toHaveLength(1);
      expect(humans[0].issueId).toBe("MCP-1");
    });

    test("combines multiple filters", async () => {
      const githubActive = await storage.listClaims({
        source: "github",
        status: "active",
      });
      expect(githubActive).toHaveLength(1);
      expect(githubActive[0].issueId).toBe("GH-1");
    });
  });

  describe("event subscription", () => {
    test("emits 'created' event on claim creation", async () => {
      const events: ClaimEvent[] = [];
      storage.subscribe((e) => events.push(e));

      await storage.createClaim({
        issueId: "EVENT-1",
        source: "manual",
        title: "Event Test",
        status: "backlog",
        progress: 0,
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("created");
      expect(events[0].claim.issueId).toBe("EVENT-1");
    });

    test("emits 'updated' event on claim update", async () => {
      await storage.createClaim({
        issueId: "EVENT-2",
        source: "manual",
        title: "Event Test",
        status: "backlog",
        progress: 0,
      });

      const events: ClaimEvent[] = [];
      storage.subscribe((e) => events.push(e));

      await storage.updateClaim("EVENT-2", { status: "active" });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("updated");
      expect(events[0].claim.status).toBe("active");
      expect(events[0].changes).toEqual({ status: "active" });
    });

    test("emits 'deleted' event on claim deletion", async () => {
      await storage.createClaim({
        issueId: "EVENT-3",
        source: "manual",
        title: "To Delete",
        status: "backlog",
        progress: 0,
      });

      const events: ClaimEvent[] = [];
      storage.subscribe((e) => events.push(e));

      await storage.deleteClaim("EVENT-3");

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("deleted");
      expect(events[0].claim.issueId).toBe("EVENT-3");
    });

    test("unsubscribe stops receiving events", async () => {
      const events: ClaimEvent[] = [];
      const unsubscribe = storage.subscribe((e) => events.push(e));

      await storage.createClaim({
        issueId: "EVENT-4",
        source: "manual",
        title: "First",
        status: "backlog",
        progress: 0,
      });

      expect(events).toHaveLength(1);

      unsubscribe();

      await storage.createClaim({
        issueId: "EVENT-5",
        source: "manual",
        title: "Second",
        status: "backlog",
        progress: 0,
      });

      expect(events).toHaveLength(1); // Should not receive second event
    });

    test("multiple subscribers receive events", async () => {
      const events1: ClaimEvent[] = [];
      const events2: ClaimEvent[] = [];

      storage.subscribe((e) => events1.push(e));
      storage.subscribe((e) => events2.push(e));

      await storage.createClaim({
        issueId: "MULTI-1",
        source: "manual",
        title: "Multi-sub",
        status: "backlog",
        progress: 0,
      });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });
  });

  describe("claim properties", () => {
    test("stores and retrieves claimant data", async () => {
      const agentClaimant = {
        type: "agent" as const,
        agentId: "coder-1",
        agentType: "coder",
      };

      await storage.createClaim({
        issueId: "CLAIMANT-1",
        source: "manual",
        title: "With Claimant",
        status: "active",
        progress: 50,
        claimant: agentClaimant,
      });

      const claim = await storage.getClaim("CLAIMANT-1");
      expect(claim?.claimant).toEqual(agentClaimant);
    });

    test("stores and retrieves metadata", async () => {
      const metadata = {
        githubId: 12345,
        labels: ["bug", "priority-high"],
        custom: { nested: "value" },
      };

      await storage.createClaim({
        issueId: "META-1",
        source: "github",
        title: "With Metadata",
        status: "backlog",
        progress: 0,
        metadata,
      });

      const claim = await storage.getClaim("META-1");
      expect(claim?.metadata).toEqual(metadata);
    });

    test("stores and retrieves context", async () => {
      await storage.createClaim({
        issueId: "CONTEXT-1",
        source: "manual",
        title: "With Context",
        status: "blocked",
        progress: 30,
        context: "Blocked due to dependency on AUTH-42",
      });

      const claim = await storage.getClaim("CONTEXT-1");
      expect(claim?.context).toBe("Blocked due to dependency on AUTH-42");
    });

    test("stores and retrieves sourceRef", async () => {
      await storage.createClaim({
        issueId: "REF-1",
        source: "github",
        sourceRef: "https://github.com/org/repo/issues/42",
        title: "With Source Ref",
        status: "backlog",
        progress: 0,
      });

      const claim = await storage.getClaim("REF-1");
      expect(claim?.sourceRef).toBe("https://github.com/org/repo/issues/42");
    });

    test("handles optional description", async () => {
      await storage.createClaim({
        issueId: "DESC-1",
        source: "manual",
        title: "Without Description",
        status: "backlog",
        progress: 0,
      });

      const withoutDesc = await storage.getClaim("DESC-1");
      expect(withoutDesc?.description).toBeUndefined();

      await storage.createClaim({
        issueId: "DESC-2",
        source: "manual",
        title: "With Description",
        description: "Detailed description here",
        status: "backlog",
        progress: 0,
      });

      const withDesc = await storage.getClaim("DESC-2");
      expect(withDesc?.description).toBe("Detailed description here");
    });
  });

  describe("edge cases", () => {
    test("handles empty filter object", async () => {
      await storage.createClaim({
        issueId: "EDGE-1",
        source: "manual",
        title: "Test",
        status: "backlog",
        progress: 0,
      });

      const claims = await storage.listClaims({});
      expect(claims).toHaveLength(1);
    });

    test("handles update with empty object", async () => {
      const original = await storage.createClaim({
        issueId: "EDGE-2",
        source: "manual",
        title: "Test",
        status: "backlog",
        progress: 0,
      });

      const updated = await storage.updateClaim("EDGE-2", {});
      expect(updated?.title).toBe(original.title);
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        original.updatedAt.getTime()
      );
    });

    test("preserves original data during partial update", async () => {
      await storage.createClaim({
        issueId: "EDGE-3",
        source: "github",
        sourceRef: "https://github.com/test",
        title: "Original",
        description: "Original description",
        status: "backlog",
        progress: 0,
        metadata: { original: true },
      });

      await storage.updateClaim("EDGE-3", { status: "active" });

      const claim = await storage.getClaim("EDGE-3");
      expect(claim?.source).toBe("github");
      expect(claim?.sourceRef).toBe("https://github.com/test");
      expect(claim?.title).toBe("Original");
      expect(claim?.description).toBe("Original description");
      expect(claim?.metadata).toEqual({ original: true });
    });

    test("handles concurrent operations", async () => {
      // Create multiple claims concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        storage.createClaim({
          issueId: `CONCURRENT-${i}`,
          source: "manual",
          title: `Concurrent ${i}`,
          status: "backlog",
          progress: 0,
        })
      );

      const claims = await Promise.all(promises);
      expect(claims).toHaveLength(10);

      const all = await storage.listClaims();
      expect(all).toHaveLength(10);
    });
  });
});
