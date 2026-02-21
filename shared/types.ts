// shared/types.ts
// Canonical domain types — single source of truth for server, frontend, and orchestrator.

// ============================================================================
// Enums / Unions
// ============================================================================

export type ClaimStatus =
  | "backlog"
  | "active"
  | "paused"
  | "blocked"
  | "review-requested"
  | "completed";

export type ClaimSource = "github" | "manual" | "mcp";

export type AgentType =
  | "coder"
  | "researcher"
  | "tester"
  | "reviewer"
  | "architect"
  | "coordinator"
  | "analyst"
  | "optimizer"
  | "security-architect"
  | "security-auditor"
  | "memory-specialist"
  | "swarm-specialist"
  | "performance-engineer"
  | "core-architect"
  | "test-architect";

// ============================================================================
// Claimant (discriminated union)
// ============================================================================

export interface HumanClaimant {
  type: "human";
  userId: string;
  name: string;
}

export interface AgentClaimant {
  type: "agent";
  agentId: string;
  agentType: AgentType | string;
}

export type Claimant = HumanClaimant | AgentClaimant;

// ============================================================================
// Claim — canonical with Date timestamps (server-side)
// ============================================================================

export interface Claim {
  id: string;
  issueId: string;
  source: ClaimSource;
  sourceRef?: string;
  title: string;
  description?: string;
  status: ClaimStatus;
  claimant?: Claimant;
  progress: number;
  context?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ClaimJSON — string timestamps for JSON transport / frontend consumption
// ============================================================================

export interface ClaimJSON {
  id: string;
  issueId: string;
  source: ClaimSource;
  sourceRef?: string;
  title: string;
  description?: string;
  status: ClaimStatus;
  claimant?: Claimant;
  progress: number;
  context?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

export function parseClaimant(s: string): Claimant {
  const [type, id, name] = s.split(":");
  if (type === "human") {
    return { type: "human", userId: id, name };
  }
  return { type: "agent", agentId: id, agentType: name };
}

export function serializeClaimant(c: Claimant): string {
  if (c.type === "human") {
    return `human:${c.userId}:${c.name}`;
  }
  return `agent:${c.agentId}:${c.agentType}`;
}

export function claimToJSON(claim: Claim): ClaimJSON {
  return {
    ...claim,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  };
}
