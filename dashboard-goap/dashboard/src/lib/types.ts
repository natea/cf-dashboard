// Shared types matching server domain types

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
  createdAt: string;
  updatedAt: string;
}

// Column types for the Kanban board
export type ColumnId =
  | "backlog"
  | "agent_working"
  | "human_review"
  | "revision"
  | "done";

export interface Column {
  id: ColumnId;
  label: string;
  color: string;
  bgClass: string;
  borderClass: string;
}

export const COLUMNS: Column[] = [
  {
    id: "backlog",
    label: "Backlog",
    color: "gray",
    bgClass: "bg-backlog-50 dark:bg-gray-800",
    borderClass: "border-backlog-500",
  },
  {
    id: "agent_working",
    label: "Agent Working",
    color: "blue",
    bgClass: "bg-agent-50 dark:bg-blue-900/20",
    borderClass: "border-agent-500",
  },
  {
    id: "human_review",
    label: "Human Review",
    color: "yellow",
    bgClass: "bg-review-50 dark:bg-yellow-900/20",
    borderClass: "border-review-500",
  },
  {
    id: "revision",
    label: "Agent Revision",
    color: "orange",
    bgClass: "bg-revision-50 dark:bg-orange-900/20",
    borderClass: "border-revision-500",
  },
  {
    id: "done",
    label: "Done",
    color: "green",
    bgClass: "bg-done-50 dark:bg-green-900/20",
    borderClass: "border-done-500",
  },
];

// Map claim status to column
export function mapStatusToColumn(claim: Claim): ColumnId {
  if (claim.status === "completed") return "done";
  if (claim.status === "backlog") return "backlog";

  if (
    claim.status === "review-requested" ||
    (claim.claimant?.type === "human" && claim.status === "active")
  ) {
    return "human_review";
  }

  if (claim.claimant?.type === "agent") {
    if (claim.metadata?.postReview) return "revision";
    return "agent_working";
  }

  // Default: if claimed but no specific status, show in agent_working
  if (claim.claimant) {
    return "agent_working";
  }

  return "backlog";
}

// Map column to status for drag-drop
export function columnToStatus(column: ColumnId): ClaimStatus {
  switch (column) {
    case "backlog":
      return "backlog";
    case "agent_working":
      return "active";
    case "human_review":
      return "review-requested";
    case "revision":
      return "active";
    case "done":
      return "completed";
  }
}

// WebSocket message types
export type WSMessageType =
  | "snapshot"
  | "event"
  | "subscribed"
  | "error"
  | "pong";

export interface WSMessage {
  type: WSMessageType;
  claims?: Claim[];
  event?: ClaimEvent;
  rooms?: string[];
  message?: string;
}

export interface ClaimEvent {
  type: "claim.created" | "claim.updated" | "claim.deleted" | "agent.activity";
  claim?: Claim;
  claimId?: string;
  issueId?: string;
  activity?: AgentActivity;
  changes?: Partial<Claim>;
  timestamp?: string;
}

export interface AgentActivity {
  agentId: string;
  agentType: string;
  action: string;
  message: string;
  claimId?: string;
  timestamp: string;
}

// Auth types
export type UserType = "admin" | "member";

export interface User {
  id: string;
  name: string;
  token: string;
  type?: UserType;
}

export interface LoginCredentials {
  name: string;
  secret: string;
}
