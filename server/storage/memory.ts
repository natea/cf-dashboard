// dashboard/server/storage/memory.ts
import { nanoid } from "nanoid";
import type { Claim } from "../domain/types";
import type { ClaimFilter } from "./interface";
import { BaseStorage } from "./base";

export class MemoryStorage extends BaseStorage {
  private claims = new Map<string, Claim>();

  async getClaim(issueId: string): Promise<Claim | null> {
    return this.claims.get(issueId) ?? null;
  }

  async getClaimByIssueId(issueId: string): Promise<Claim | null> {
    return this.claims.get(issueId) ?? null;
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    let claims = Array.from(this.claims.values());

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      claims = claims.filter((c) => statuses.includes(c.status));
    }
    if (filter?.source) {
      claims = claims.filter((c) => c.source === filter.source);
    }
    if (filter?.claimantType) {
      claims = claims.filter((c) => c.claimant?.type === filter.claimantType);
    }

    return claims;
  }

  async createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim> {
    const now = new Date();
    const claim: Claim = {
      ...data,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    };

    this.claims.set(claim.issueId, claim);
    this.emit({ type: "created", claim });
    return claim;
  }

  async updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null> {
    const existing = this.claims.get(issueId);
    if (!existing) return null;

    const updated: Claim = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.claims.set(issueId, updated);
    this.emit({ type: "updated", claim: updated, changes: updates });
    return updated;
  }

  async deleteClaim(issueId: string): Promise<boolean> {
    const existing = this.claims.get(issueId);
    if (!existing) return false;

    this.claims.delete(issueId);
    this.emit({ type: "deleted", claim: existing });
    return true;
  }
}
