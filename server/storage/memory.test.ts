// dashboard/server/storage/memory.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { MemoryStorage } from "./memory";
import type { ClaimEvent } from "./interface";

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  test("creates and retrieves a claim", async () => {
    const claim = await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test Issue",
      status: "backlog",
      progress: 0,
    });

    expect(claim.id).toBeDefined();
    expect(claim.issueId).toBe("TEST-001");

    const retrieved = await storage.getClaim("TEST-001");
    expect(retrieved).toEqual(claim);
  });

  test("lists claims with filter", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test 1",
      status: "backlog",
      progress: 0,
    });
    await storage.createClaim({
      issueId: "TEST-002",
      source: "github",
      title: "Test 2",
      status: "active",
      progress: 50,
    });

    const all = await storage.listClaims();
    expect(all).toHaveLength(2);

    const backlog = await storage.listClaims({ status: "backlog" });
    expect(backlog).toHaveLength(1);
    expect(backlog[0].issueId).toBe("TEST-001");
  });

  test("updates a claim", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const updated = await storage.updateClaim("TEST-001", {
      status: "active",
      progress: 25,
    });

    expect(updated?.status).toBe("active");
    expect(updated?.progress).toBe(25);
  });

  test("emits events on changes", async () => {
    const events: ClaimEvent[] = [];
    storage.subscribe((e) => events.push(e));

    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("created");
  });
});
