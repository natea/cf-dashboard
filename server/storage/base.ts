// server/storage/base.ts
// Abstract base class for storage backends — extracts shared emit/subscribe
// pattern and the rowToClaim() mapping that sqlite and postgres both use.

import type { Claim, ClaimSource, ClaimStatus } from "../domain/types";
import { parseClaimant } from "../domain/types";
import type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";

// ============================================================================
// Shared row shape used by SQL-backed stores (sqlite & postgres)
// ============================================================================

export interface ClaimRow {
  id: string;
  issue_id: string;
  source: string;
  source_ref: string | null;
  title: string;
  description: string | null;
  status: string;
  claimant: string | null;
  progress: number;
  context: string | null;
  metadata: string | Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
}

// ============================================================================
// BaseStorage — shared event bus for all backends
// ============================================================================

export abstract class BaseStorage implements ClaimsStorage {
  private listeners = new Set<(event: ClaimEvent) => void>();

  // -- Event bus (shared across all 3 backends) --

  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  protected emit(event: ClaimEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // -- Abstract methods each backend must implement --

  abstract getClaim(issueId: string): Promise<Claim | null>;
  abstract getClaimByIssueId(issueId: string): Promise<Claim | null>;
  abstract listClaims(filter?: ClaimFilter): Promise<Claim[]>;
  abstract createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim>;
  abstract updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null>;
  abstract deleteClaim(issueId: string): Promise<boolean>;

  // -- Shared row-to-domain mapping for SQL backends --

  protected rowToClaim(row: ClaimRow): Claim {
    return {
      id: row.id,
      issueId: row.issue_id,
      source: row.source as ClaimSource,
      sourceRef: row.source_ref ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as ClaimStatus,
      claimant: row.claimant ? parseClaimant(row.claimant) : undefined,
      progress: row.progress,
      context: row.context ?? undefined,
      metadata: row.metadata
        ? typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata
        : undefined,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }
}
