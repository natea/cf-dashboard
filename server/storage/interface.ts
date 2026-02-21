// server/storage/interface.ts
import type { Claim } from "../../shared/types";
import type { ClaimFilter, Unsubscribe } from "../../shared/filters";
import type { StorageClaimEvent } from "../../shared/events";

// Re-export for backward compat -- consumers import ClaimFilter from here
export type { ClaimFilter, Unsubscribe };

// Storage-level event uses un-prefixed type strings
export type ClaimEvent = StorageClaimEvent;

export interface ClaimsStorage {
  getClaim(issueId: string): Promise<Claim | null>;
  getClaimByIssueId(issueId: string): Promise<Claim | null>;
  listClaims(filter?: ClaimFilter): Promise<Claim[]>;
  createClaim(claim: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim>;
  updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null>;
  deleteClaim(issueId: string): Promise<boolean>;
  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe;
}
