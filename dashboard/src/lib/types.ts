// dashboard/src/lib/types.ts
export type ClaimStatus =
  | "backlog"
  | "active"
  | "paused"
  | "blocked"
  | "review-requested"
  | "completed";

export type ClaimSource = "github" | "manual" | "mcp";

export interface Claimant {
  type: "human" | "agent";
  userId?: string;
  name?: string;
  agentId?: string;
  agentType?: string;
}

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
  createdAt: string;
  updatedAt: string;
}

export type ColumnId = "backlog" | "agent_working" | "human_review" | "revision" | "done";

export interface Column {
  id: ColumnId;
  label: string;
  color: string;
}

export const COLUMNS: Column[] = [
  { id: "backlog", label: "Backlog", color: "#6B7280" },
  { id: "agent_working", label: "Agent Working", color: "#3B82F6" },
  { id: "human_review", label: "Human Review", color: "#F59E0B" },
  { id: "revision", label: "Agent Revision", color: "#F97316" },
  { id: "done", label: "Done", color: "#10B981" },
];
