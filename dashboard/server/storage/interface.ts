// dashboard/server/storage/interface.ts
import type { Claim, ClaimStatus } from "../domain/types";

export interface ClaimFilter {
  status?: ClaimStatus;
  source?: string;
  claimantType?: "human" | "agent";
}

export interface ClaimEvent {
  type: "created" | "updated" | "deleted";
  claim: Claim;
  changes?: Partial<Claim>;
}

export type Unsubscribe = () => void;

export interface ClaimsStorage {
  getClaim(issueId: string): Promise<Claim | null>;
  listClaims(filter?: ClaimFilter): Promise<Claim[]>;
  createClaim(claim: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim>;
  updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null>;
  deleteClaim(issueId: string): Promise<boolean>;
  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe;
}
