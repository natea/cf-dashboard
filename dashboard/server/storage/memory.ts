// dashboard/server/storage/memory.ts
import { nanoid } from "nanoid";
import type { Claim } from "../domain/types";
import type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";

export class MemoryStorage implements ClaimsStorage {
  private claims = new Map<string, Claim>();
  private listeners = new Set<(event: ClaimEvent) => void>();

  async getClaim(issueId: string): Promise<Claim | null> {
    return this.claims.get(issueId) ?? null;
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    let claims = Array.from(this.claims.values());

    if (filter?.status) {
      claims = claims.filter((c) => c.status === filter.status);
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

  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: ClaimEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
