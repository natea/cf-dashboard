// dashboard/server/storage/sqlite.ts
// SQLite storage backend for development/fallback using Bun's native SQLite

import { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import type { Claim, Claimant, ClaimStatus, ClaimSource } from "../domain/types";
import type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";
import { parseClaimant, serializeClaimant } from "../domain/types";

export interface SqliteConfig {
  path: string;
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
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteStorage implements ClaimsStorage {
  private db: Database;
  private listeners = new Set<(event: ClaimEvent) => void>();
  private initialized = false;

  constructor(config: SqliteConfig) {
    // Create directory if needed
    const dir = config.path.substring(0, config.path.lastIndexOf("/"));
    if (dir) {
      try {
        Bun.spawnSync(["mkdir", "-p", dir]);
      } catch {
        // Directory might already exist
      }
    }

    this.db = new Database(config.path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create claims table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        issue_id TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        source_ref TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        claimant TEXT,
        progress INTEGER NOT NULL DEFAULT 0,
        context TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_issue_id ON claims(issue_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_claims_source ON claims(source)`);

    this.initialized = true;
  }

  async getClaim(issueId: string): Promise<Claim | null> {
    await this.initialize();

    const stmt = this.db.prepare<ClaimRow, [string]>(
      "SELECT * FROM claims WHERE issue_id = ?"
    );
    const row = stmt.get(issueId);

    if (!row) return null;
    return this.rowToClaim(row);
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    await this.initialize();

    let sql = "SELECT * FROM claims WHERE 1=1";
    const params: string[] = [];

    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    if (filter?.source) {
      sql += " AND source = ?";
      params.push(filter.source);
    }
    if (filter?.claimantType) {
      if (filter.claimantType === "human") {
        sql += " AND claimant LIKE 'human:%'";
      } else {
        sql += " AND claimant LIKE 'agent:%'";
      }
    }

    sql += " ORDER BY updated_at DESC";

    const stmt = this.db.prepare<ClaimRow, string[]>(sql);
    const rows = stmt.all(...params);

    return rows.map((row) => this.rowToClaim(row));
  }

  async createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim> {
    await this.initialize();

    const id = nanoid();
    const now = new Date();
    const nowStr = now.toISOString();
    const claimantStr = data.claimant ? serializeClaimant(data.claimant) : null;
    const metadataStr = data.metadata ? JSON.stringify(data.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO claims (
        id, issue_id, source, source_ref, title, description,
        status, claimant, progress, context, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.issueId,
      data.source,
      data.sourceRef ?? null,
      data.title,
      data.description ?? null,
      data.status,
      claimantStr,
      data.progress,
      data.context ?? null,
      metadataStr,
      nowStr,
      nowStr
    );

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
    const nowStr = now.toISOString();

    // Build update parts
    // Use "in" check to allow explicitly clearing claimant with undefined
    const claimant = "claimant" in updates ? updates.claimant : existing.claimant;
    const claimantStr = claimant ? serializeClaimant(claimant) : null;
    const metadata = updates.metadata ?? existing.metadata;
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      UPDATE claims SET
        title = ?,
        description = ?,
        status = ?,
        claimant = ?,
        progress = ?,
        context = ?,
        metadata = ?,
        updated_at = ?
      WHERE issue_id = ?
    `);

    stmt.run(
      updates.title ?? existing.title,
      updates.description ?? existing.description ?? null,
      updates.status ?? existing.status,
      claimantStr,
      updates.progress ?? existing.progress,
      updates.context ?? existing.context ?? null,
      metadataStr,
      nowStr,
      issueId
    );

    const updated: Claim = {
      ...existing,
      ...updates,
      claimant,
      updatedAt: now,
    };

    this.emit({ type: "updated", claim: updated, changes: updates });
    return updated;
  }

  async deleteClaim(issueId: string): Promise<boolean> {
    await this.initialize();

    const existing = await this.getClaim(issueId);
    if (!existing) return false;

    const stmt = this.db.prepare("DELETE FROM claims WHERE issue_id = ?");
    stmt.run(issueId);

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
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // Close database
  close(): void {
    this.db.close();
  }
}
