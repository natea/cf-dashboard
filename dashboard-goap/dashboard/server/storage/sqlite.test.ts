// dashboard/server/storage/sqlite.test.ts
// Tests for SQLite storage backend

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SqliteStorage } from "./sqlite";
import { unlink } from "node:fs/promises";

const TEST_DB_PATH = "/tmp/claims-test.db";

describe("SqliteStorage", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    // Clean up any existing test db
    try {
      await unlink(TEST_DB_PATH);
      await unlink(TEST_DB_PATH + "-wal");
      await unlink(TEST_DB_PATH + "-shm");
    } catch {
      // File might not exist
    }

    storage = new SqliteStorage({ path: TEST_DB_PATH });
    await storage.initialize();
  });

  afterEach(() => {
    storage.close();
  });

  test("createClaim stores and returns claim with id", async () => {
    const claim = await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Test Claim",
      description: "Test description",
      status: "backlog",
      progress: 0,
    });

    expect(claim.id).toBeDefined();
    expect(claim.issueId).toBe("test-1");
    expect(claim.title).toBe("Test Claim");
    expect(claim.createdAt).toBeInstanceOf(Date);
  });

  test("getClaim retrieves existing claim", async () => {
    await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const claim = await storage.getClaim("test-1");
    expect(claim).not.toBeNull();
    expect(claim?.issueId).toBe("test-1");
  });

  test("getClaim returns null for nonexistent claim", async () => {
    const claim = await storage.getClaim("nonexistent");
    expect(claim).toBeNull();
  });

  test("listClaims returns all claims", async () => {
    await storage.createClaim({ issueId: "1", source: "manual", title: "A", status: "backlog", progress: 0 });
    await storage.createClaim({ issueId: "2", source: "manual", title: "B", status: "active", progress: 0 });

    const claims = await storage.listClaims();
    expect(claims).toHaveLength(2);
  });

  test("listClaims filters by status", async () => {
    await storage.createClaim({ issueId: "1", source: "manual", title: "A", status: "backlog", progress: 0 });
    await storage.createClaim({ issueId: "2", source: "manual", title: "B", status: "active", progress: 0 });
    await storage.createClaim({ issueId: "3", source: "manual", title: "C", status: "active", progress: 0 });

    const claims = await storage.listClaims({ status: "active" });
    expect(claims).toHaveLength(2);
  });

  test("listClaims filters by source", async () => {
    await storage.createClaim({ issueId: "1", source: "manual", title: "A", status: "backlog", progress: 0 });
    await storage.createClaim({ issueId: "2", source: "github", title: "B", status: "backlog", progress: 0 });

    const claims = await storage.listClaims({ source: "github" });
    expect(claims).toHaveLength(1);
    expect(claims[0].source).toBe("github");
  });

  test("listClaims filters by claimantType", async () => {
    await storage.createClaim({
      issueId: "1",
      source: "manual",
      title: "A",
      status: "active",
      progress: 0,
      claimant: { type: "human", userId: "user1", name: "Alice" },
    });
    await storage.createClaim({
      issueId: "2",
      source: "manual",
      title: "B",
      status: "active",
      progress: 0,
      claimant: { type: "agent", agentId: "coder-1", agentType: "coder" },
    });

    const humanClaims = await storage.listClaims({ claimantType: "human" });
    expect(humanClaims).toHaveLength(1);
    expect(humanClaims[0].claimant?.type).toBe("human");

    const agentClaims = await storage.listClaims({ claimantType: "agent" });
    expect(agentClaims).toHaveLength(1);
    expect(agentClaims[0].claimant?.type).toBe("agent");
  });

  test("updateClaim modifies existing claim", async () => {
    await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Original",
      status: "backlog",
      progress: 0,
    });

    const updated = await storage.updateClaim("test-1", {
      title: "Updated",
      status: "active",
      progress: 50,
    });

    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("Updated");
    expect(updated?.status).toBe("active");
    expect(updated?.progress).toBe(50);
  });

  test("updateClaim returns null for nonexistent claim", async () => {
    const result = await storage.updateClaim("nonexistent", { status: "active" });
    expect(result).toBeNull();
  });

  test("updateClaim can set/clear claimant", async () => {
    await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    // Set claimant
    const withClaimant = await storage.updateClaim("test-1", {
      claimant: { type: "agent", agentId: "coder-1", agentType: "coder" },
    });
    expect(withClaimant?.claimant?.type).toBe("agent");

    // Clear claimant
    const withoutClaimant = await storage.updateClaim("test-1", {
      claimant: undefined,
    });
    expect(withoutClaimant?.claimant).toBeUndefined();
  });

  test("deleteClaim removes existing claim", async () => {
    await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const deleted = await storage.deleteClaim("test-1");
    expect(deleted).toBe(true);

    const claim = await storage.getClaim("test-1");
    expect(claim).toBeNull();
  });

  test("deleteClaim returns false for nonexistent claim", async () => {
    const deleted = await storage.deleteClaim("nonexistent");
    expect(deleted).toBe(false);
  });

  test("subscribe receives events", async () => {
    const events: Array<{ type: string }> = [];
    storage.subscribe((event) => {
      events.push({ type: event.type });
    });

    await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });
    await storage.updateClaim("test-1", { status: "active" });
    await storage.deleteClaim("test-1");

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("created");
    expect(events[1].type).toBe("updated");
    expect(events[2].type).toBe("deleted");
  });

  test("metadata is stored and retrieved as JSON", async () => {
    const metadata = { priority: "high", labels: ["bug", "urgent"] };

    await storage.createClaim({
      issueId: "test-1",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
      metadata,
    });

    const claim = await storage.getClaim("test-1");
    expect(claim?.metadata).toEqual(metadata);
  });
});
