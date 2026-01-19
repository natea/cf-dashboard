// dashboard/server/storage/postgres.ts
import postgres from "postgres";
import { nanoid } from "nanoid";
import type { Claim, ClaimStatus, ClaimSource } from "../domain/types";
import type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";

interface PostgresConfig {
  url: string;
}

export class PostgresStorage implements ClaimsStorage {
  private sql: ReturnType<typeof postgres>;
  private listeners = new Set<(event: ClaimEvent) => void>();

  constructor(config: PostgresConfig) {
    this.sql = postgres(config.url, {
      types: {
        // Handle Date serialization
        date: {
          to: 1184, // timestamptz
          from: [1082, 1083, 1114, 1184],
          serialize: (x: Date) => x.toISOString(),
          parse: (x: string) => new Date(x),
        },
      },
    });
  }

  async init(): Promise<void> {
    // Create tables if they don't exist
    await this.sql`
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        issue_id TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        source_ref TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        claimant TEXT,
        progress INTEGER DEFAULT 0,
        context TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create index on status for filtering
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)
    `;

    // Create NOTIFY trigger for real-time updates
    await this.sql`
      CREATE OR REPLACE FUNCTION notify_claim_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM pg_notify('claim_changes', json_build_object(
            'type', 'deleted',
            'issue_id', OLD.issue_id
          )::text);
          RETURN OLD;
        ELSE
          PERFORM pg_notify('claim_changes', json_build_object(
            'type', LOWER(TG_OP),
            'issue_id', NEW.issue_id
          )::text);
          RETURN NEW;
        END IF;
      END;
      $$ LANGUAGE plpgsql
    `;

    await this.sql`
      DROP TRIGGER IF EXISTS claim_changes_trigger ON claims
    `;

    await this.sql`
      CREATE TRIGGER claim_changes_trigger
      AFTER INSERT OR UPDATE OR DELETE ON claims
      FOR EACH ROW EXECUTE FUNCTION notify_claim_change()
    `;
  }

  private rowToClaim(row: any): Claim {
    return {
      id: row.id,
      issueId: row.issue_id,
      source: row.source as ClaimSource,
      sourceRef: row.source_ref,
      title: row.title,
      description: row.description,
      status: row.status as ClaimStatus,
      claimant: row.claimant ? JSON.parse(row.claimant) : undefined,
      progress: row.progress,
      context: row.context,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getClaim(issueId: string): Promise<Claim | null> {
    const rows = await this.sql`
      SELECT * FROM claims WHERE issue_id = ${issueId}
    `;
    return rows.length > 0 ? this.rowToClaim(rows[0]) : null;
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    let query = this.sql`SELECT * FROM claims WHERE 1=1`;

    if (filter?.status) {
      query = this.sql`${query} AND status = ${filter.status}`;
    }
    if (filter?.source) {
      query = this.sql`${query} AND source = ${filter.source}`;
    }

    query = this.sql`${query} ORDER BY updated_at DESC`;

    const rows = await query;
    return rows.map((row: any) => this.rowToClaim(row));
  }

  async createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim> {
    const id = nanoid();
    const now = new Date();

    const [row] = await this.sql`
      INSERT INTO claims (id, issue_id, source, source_ref, title, description, status, claimant, progress, context, metadata, created_at, updated_at)
      VALUES (
        ${id},
        ${data.issueId},
        ${data.source},
        ${data.sourceRef || null},
        ${data.title},
        ${data.description || null},
        ${data.status},
        ${data.claimant ? JSON.stringify(data.claimant) : null},
        ${data.progress},
        ${data.context || null},
        ${data.metadata ? JSON.stringify(data.metadata) : null},
        ${now},
        ${now}
      )
      RETURNING *
    `;

    const claim = this.rowToClaim(row);
    this.emit({ type: "created", claim });
    return claim;
  }

  async updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null> {
    const existing = await this.getClaim(issueId);
    if (!existing) return null;

    const now = new Date();

    const [row] = await this.sql`
      UPDATE claims SET
        status = COALESCE(${updates.status || null}, status),
        progress = COALESCE(${updates.progress ?? null}, progress),
        context = COALESCE(${updates.context || null}, context),
        claimant = COALESCE(${updates.claimant ? JSON.stringify(updates.claimant) : null}, claimant),
        updated_at = ${now}
      WHERE issue_id = ${issueId}
      RETURNING *
    `;

    const claim = this.rowToClaim(row);
    this.emit({ type: "updated", claim, changes: updates });
    return claim;
  }

  async deleteClaim(issueId: string): Promise<boolean> {
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

  async close(): Promise<void> {
    await this.sql.end();
  }
}
