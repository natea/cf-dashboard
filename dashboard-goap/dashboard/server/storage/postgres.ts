// dashboard/server/storage/postgres.ts
// PostgreSQL storage backend using postgres.js

import postgres from "postgres";
import { nanoid } from "nanoid";
import type { Claim, Claimant, ClaimStatus, ClaimSource } from "../domain/types";
import type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";
import { parseClaimant, serializeClaimant } from "../domain/types";

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
}

interface ClaimRow {
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
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresStorage implements ClaimsStorage {
  private sql: postgres.Sql;
  private listeners = new Set<(event: ClaimEvent) => void>();
  private initialized = false;

  constructor(config: PostgresConfig) {
    this.sql = postgres({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.user,
      password: config.password,
      ssl: config.ssl ? "require" : false,
      max: config.maxConnections,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create claims table if not exists
    await this.sql`
      CREATE TABLE IF NOT EXISTS claims (
        id VARCHAR(21) PRIMARY KEY,
        issue_id VARCHAR(255) UNIQUE NOT NULL,
        source VARCHAR(50) NOT NULL,
        source_ref VARCHAR(500),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'backlog',
        claimant VARCHAR(500),
        progress INTEGER NOT NULL DEFAULT 0,
        context TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;

    // Create indexes for common queries
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_claims_issue_id ON claims(issue_id)
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_claims_source ON claims(source)
    `;

    this.initialized = true;
  }

  async getClaim(issueId: string): Promise<Claim | null> {
    await this.initialize();

    const rows = await this.sql<ClaimRow[]>`
      SELECT * FROM claims WHERE issue_id = ${issueId}
    `;

    if (rows.length === 0) return null;
    return this.rowToClaim(rows[0]);
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    await this.initialize();

    let query = this.sql`SELECT * FROM claims WHERE 1=1`;

    // Build dynamic query based on filters
    const conditions: postgres.PendingQuery<ClaimRow[]>[] = [];

    if (filter?.status) {
      conditions.push(this.sql`AND status = ${filter.status}`);
    }
    if (filter?.source) {
      conditions.push(this.sql`AND source = ${filter.source}`);
    }
    if (filter?.claimantType) {
      if (filter.claimantType === "human") {
        conditions.push(this.sql`AND claimant LIKE 'human:%'`);
      } else {
        conditions.push(this.sql`AND claimant LIKE 'agent:%'`);
      }
    }

    // Execute with filters
    let rows: ClaimRow[];
    if (conditions.length === 0) {
      rows = await this.sql<ClaimRow[]>`
        SELECT * FROM claims ORDER BY updated_at DESC
      `;
    } else if (filter?.status && !filter?.source && !filter?.claimantType) {
      rows = await this.sql<ClaimRow[]>`
        SELECT * FROM claims WHERE status = ${filter.status} ORDER BY updated_at DESC
      `;
    } else if (filter?.source && !filter?.status && !filter?.claimantType) {
      rows = await this.sql<ClaimRow[]>`
        SELECT * FROM claims WHERE source = ${filter.source} ORDER BY updated_at DESC
      `;
    } else {
      // Complex filter - build manually
      rows = await this.sql<ClaimRow[]>`
        SELECT * FROM claims
        WHERE 1=1
          ${filter?.status ? this.sql`AND status = ${filter.status}` : this.sql``}
          ${filter?.source ? this.sql`AND source = ${filter.source}` : this.sql``}
          ${filter?.claimantType === "human" ? this.sql`AND claimant LIKE 'human:%'` : this.sql``}
          ${filter?.claimantType === "agent" ? this.sql`AND claimant LIKE 'agent:%'` : this.sql``}
        ORDER BY updated_at DESC
      `;
    }

    return rows.map((row) => this.rowToClaim(row));
  }

  async createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim> {
    await this.initialize();

    const id = nanoid();
    const now = new Date();
    const claimantStr = data.claimant ? serializeClaimant(data.claimant) : null;

    await this.sql`
      INSERT INTO claims (
        id, issue_id, source, source_ref, title, description,
        status, claimant, progress, context, metadata, created_at, updated_at
      ) VALUES (
        ${id},
        ${data.issueId},
        ${data.source},
        ${data.sourceRef ?? null},
        ${data.title},
        ${data.description ?? null},
        ${data.status},
        ${claimantStr},
        ${data.progress},
        ${data.context ?? null},
        ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb,
        ${now},
        ${now}
      )
    `;

    const claim: Claim = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.emit({ type: "created", claim });
    return claim;
  }

  async updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null> {
    await this.initialize();

    const existing = await this.getClaim(issueId);
    if (!existing) return null;

    const now = new Date();
    // Use "in" check to allow explicitly clearing claimant with undefined
    const claimant = "claimant" in updates ? updates.claimant : existing.claimant;
    const claimantStr = claimant ? serializeClaimant(claimant) : null;

    await this.sql`
      UPDATE claims SET
        title = ${updates.title ?? existing.title},
        description = ${updates.description ?? existing.description ?? null},
        status = ${updates.status ?? existing.status},
        claimant = ${claimantStr},
        progress = ${updates.progress ?? existing.progress},
        context = ${updates.context ?? existing.context ?? null},
        metadata = ${updates.metadata ? JSON.stringify(updates.metadata) : (existing.metadata ? JSON.stringify(existing.metadata) : null)}::jsonb,
        updated_at = ${now}
      WHERE issue_id = ${issueId}
    `;

    const updated: Claim = {
      ...existing,
      ...updates,
      claimant: "claimant" in updates ? updates.claimant : existing.claimant,
      updatedAt: now,
    };

    this.emit({ type: "updated", claim: updated, changes: updates });
    return updated;
  }

  async deleteClaim(issueId: string): Promise<boolean> {
    await this.initialize();

    const existing = await this.getClaim(issueId);
    if (!existing) return false;

    await this.sql`DELETE FROM claims WHERE issue_id = ${issueId}`;

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

  private rowToClaim(row: ClaimRow): Claim {
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
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Close connection pool
  async close(): Promise<void> {
    await this.sql.end();
  }
}
