// dashboard/server/domain/types.ts
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
  | "debugger";

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
