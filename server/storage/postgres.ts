// dashboard/server/storage/postgres.ts
// PostgreSQL storage backend using postgres.js
//
// The actual table schema is defined in migrations/001_claims_table.sql.
// Claimant data is stored in 4 columns: claimant_type, claimant_id,
// claimant_name, agent_type. The id column is UUID (not nanoid).

import postgres from "postgres";
import type { Claim, Claimant, ClaimSource, ClaimStatus } from "../domain/types";
import type { ClaimFilter } from "./interface";
import { BaseStorage } from "./base";

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
}

// Row shape matching migrations/001_claims_table.sql
interface PgRow {
  id: string;
  issue_id: string;
  source: string;
  source_ref: string | null;
  title: string;
  description: string | null;
  status: string;
  claimant_type: string | null;
  claimant_id: string | null;
  claimant_name: string | null;
  agent_type: string | null;
  progress: number;
  context: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresStorage extends BaseStorage {
  private sql: postgres.Sql;
  private initialized = false;

  constructor(config: PostgresConfig) {
    super();

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

    // Table is created by migrations/001_claims_table.sql (via docker-entrypoint-initdb.d).
    // We only verify connectivity here — do NOT re-create with a different schema.
    await this.sql`SELECT 1`;

    this.initialized = true;
  }

  // -- Row mapping (PgRow → Claim domain object) --

  private pgRowToClaim(row: PgRow): Claim {
    let claimant: Claimant | undefined;
    if (row.claimant_type === "human" && row.claimant_id) {
      claimant = {
        type: "human",
        userId: row.claimant_id,
        name: row.claimant_name ?? row.claimant_id,
      };
    } else if (row.claimant_type === "agent" && row.claimant_id) {
      claimant = {
        type: "agent",
        agentId: row.claimant_id,
        agentType: row.agent_type ?? "coder",
      };
    }

    return {
      id: row.id,
      issueId: row.issue_id,
      source: row.source as ClaimSource,
      sourceRef: row.source_ref ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as ClaimStatus,
      claimant,
      progress: row.progress,
      context: row.context ?? undefined,
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // -- CRUD --

  async getClaim(issueId: string): Promise<Claim | null> {
    await this.initialize();

    const rows = await this.sql<PgRow[]>`
      SELECT * FROM claims WHERE issue_id = ${issueId}
    `;

    if (rows.length === 0) return null;
    return this.pgRowToClaim(rows[0]);
  }

  async getClaimByIssueId(issueId: string): Promise<Claim | null> {
    return this.getClaim(issueId);
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    await this.initialize();

    const rows = await this.sql<PgRow[]>`
      SELECT * FROM claims
      WHERE 1=1
        ${filter?.status
          ? Array.isArray(filter.status)
            ? this.sql`AND status = ANY(${filter.status})`
            : this.sql`AND status = ${filter.status}`
          : this.sql``}
        ${filter?.source
          ? this.sql`AND source = ${filter.source}`
          : this.sql``}
        ${filter?.claimantType
          ? this.sql`AND claimant_type = ${filter.claimantType}`
          : this.sql``}
      ORDER BY updated_at DESC
    `;

    return rows.map((row) => this.pgRowToClaim(row));
  }

  async createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim> {
    await this.initialize();

    const now = new Date();

    const rows = await this.sql<PgRow[]>`
      INSERT INTO claims (
        issue_id, source, source_ref, title, description,
        status, claimant_type, claimant_id, claimant_name, agent_type,
        progress, context, metadata
      ) VALUES (
        ${data.issueId},
        ${data.source},
        ${data.sourceRef ?? null},
        ${data.title},
        ${data.description ?? null},
        ${data.status},
        ${data.claimant?.type ?? null},
        ${data.claimant ? (data.claimant.type === "human" ? data.claimant.userId : data.claimant.agentId) : null},
        ${data.claimant?.type === "human" ? data.claimant.name : null},
        ${data.claimant?.type === "agent" ? data.claimant.agentType : null},
        ${data.progress},
        ${data.context ?? null},
        ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb
      )
      RETURNING *
    `;

    const claim = this.pgRowToClaim(rows[0]);
    this.emit({ type: "created", claim });
    return claim;
  }

  async updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null> {
    await this.initialize();

    const existing = await this.getClaim(issueId);
    if (!existing) return null;

    // Resolve claimant: allow explicitly clearing with undefined via "in" check
    const claimant = "claimant" in updates ? updates.claimant : existing.claimant;

    const rows = await this.sql<PgRow[]>`
      UPDATE claims SET
        title = ${updates.title ?? existing.title},
        description = ${updates.description ?? existing.description ?? null},
        status = ${updates.status ?? existing.status},
        claimant_type = ${claimant?.type ?? null},
        claimant_id = ${claimant ? (claimant.type === "human" ? claimant.userId : claimant.agentId) : null},
        claimant_name = ${claimant?.type === "human" ? claimant.name : null},
        agent_type = ${claimant?.type === "agent" ? claimant.agentType : null},
        progress = ${updates.progress ?? existing.progress},
        context = ${updates.context ?? existing.context ?? null},
        metadata = ${updates.metadata ? JSON.stringify(updates.metadata) : (existing.metadata ? JSON.stringify(existing.metadata) : null)}::jsonb
      WHERE issue_id = ${issueId}
      RETURNING *
    `;

    const updated = this.pgRowToClaim(rows[0]);
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

  // Close connection pool
  async close(): Promise<void> {
    await this.sql.end();
  }
}
