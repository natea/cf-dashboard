// dashboard/src/lib/api.ts
import type { Claim, ClaimStatus, ColumnId } from "./types";
import { getAuthHeader } from "./auth";

const API_BASE = "/api";

/**
 * Make an authenticated API request
 */
async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  // Handle 401 Unauthorized
  if (res.status === 401) {
    // Redirect to login or show auth prompt
    window.dispatchEvent(new CustomEvent("auth:required"));
    throw new Error("Authentication required");
  }

  return res;
}

export async function fetchClaims(): Promise<Claim[]> {
  const res = await authFetch(`${API_BASE}/claims`);
  if (!res.ok) throw new Error("Failed to fetch claims");
  const data = await res.json();
  return data.claims;
}

export async function createClaim(claim: {
  issueId: string;
  title: string;
  description?: string;
  source?: "manual" | "github" | "mcp";
}): Promise<Claim> {
  const res = await authFetch(`${API_BASE}/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(claim),
  });
  if (!res.ok) throw new Error("Failed to create claim");
  const data = await res.json();
  return data.claim;
}

export async function updateClaimStatus(
  issueId: string,
  status: ClaimStatus,
  progress?: number
): Promise<Claim> {
  const res = await authFetch(`${API_BASE}/claims/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, progress }),
  });
  if (!res.ok) throw new Error("Failed to update claim");
  const data = await res.json();
  return data.claim;
}

export async function deleteClaim(issueId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/claims/${issueId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete claim");
}

// Map column ID to claim status for drag-drop transitions
export function columnToStatus(columnId: ColumnId): ClaimStatus {
  switch (columnId) {
    case "backlog":
      return "backlog";
    case "agent_working":
      return "active";
    case "human_review":
      return "review-requested";
    case "revision":
      return "active"; // With metadata.postReview = true
    case "done":
      return "completed";
    default:
      return "backlog";
  }
}
