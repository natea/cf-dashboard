// src/lib/types.ts
// Frontend type definitions.
// Shared domain types are re-exported from shared/; frontend-specific types live here.

// Re-export shared types (ClaimJSON as Claim for frontend string-date convention)
export type {
  ClaimStatus,
  ClaimSource,
  AgentType,
  HumanClaimant,
  AgentClaimant,
  Claimant,
  ClaimJSON as Claim,
} from "../../shared/types";

// Re-export frontend event types from shared/events
export type {
  FrontendClaimEvent as ClaimEvent,
  AgentActivity,
  WsMessage as WSMessage,
  WSMessageType,
} from "../../shared/events";

// Need ClaimJSON type locally for function signatures
import type { ClaimJSON } from "../../shared/types";
import type { ClaimStatus } from "../../shared/types";

// ============================================================================
// Column types for the Kanban board (frontend-only)
// ============================================================================

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

export function mapStatusToColumn(claim: ClaimJSON): ColumnId {
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

  if (claim.claimant) {
    return "agent_working";
  }

  return "backlog";
}

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

// ============================================================================
// Auth types (frontend-only)
// ============================================================================

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
