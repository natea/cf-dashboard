// dashboard/server/domain/types.test.ts
import { describe, expect, test } from "bun:test";
import { parseClaimant, serializeClaimant, type Claimant } from "./types";

describe("Claimant", () => {
  test("parses human claimant string", () => {
    const result = parseClaimant("human:user-1:Nate");
    expect(result).toEqual({
      type: "human",
      userId: "user-1",
      name: "Nate",
    });
  });

  test("parses agent claimant string", () => {
    const result = parseClaimant("agent:coder-1:coder");
    expect(result).toEqual({
      type: "agent",
      agentId: "coder-1",
      agentType: "coder",
    });
  });

  test("serializes human claimant", () => {
    const claimant: Claimant = { type: "human", userId: "user-1", name: "Nate" };
    expect(serializeClaimant(claimant)).toBe("human:user-1:Nate");
  });

  test("serializes agent claimant", () => {
    const claimant: Claimant = { type: "agent", agentId: "coder-1", agentType: "coder" };
    expect(serializeClaimant(claimant)).toBe("agent:coder-1:coder");
  });
});
