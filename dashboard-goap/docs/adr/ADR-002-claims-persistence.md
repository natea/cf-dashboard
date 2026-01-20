# ADR-002: Claims Persistence and Real-time Events

## Status
Proposed

## Date
2026-01-19

## Context
Investigation revealed:
- Claims MCP tools work but are **in-memory only** (lost on restart)
- Memory system can persist to SQLite with semantic search
- RuVector/Postgres is the target production backend
- We need persistence AND real-time events

## Decision

### Dual-Backend Architecture

Support both SQLite (local dev) and RuVector/Postgres (production) via a storage adapter pattern.

```
┌─────────────────────────────────────────────────────────────────┐
│                      DASHBOARD SERVER                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Storage Adapter                          ││
│  │  ┌─────────────────┐     ┌─────────────────────────────┐   ││
│  │  │ SQLite Backend  │ OR  │ RuVector/Postgres Backend   │   ││
│  │  │ (dev/local)     │     │ (production)                │   ││
│  │  │                 │     │                             │   ││
│  │  │ memory_entries  │     │ claims table + NOTIFY       │   ││
│  │  │ namespace:claims│     │ 77+ AI SQL functions        │   ││
│  │  │ Polling 1s      │     │ Real-time via LISTEN        │   ││
│  │  └─────────────────┘     └─────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Storage Interface

```typescript
interface ClaimsStorage {
  // CRUD
  getClaim(issueId: string): Promise<Claim | null>;
  listClaims(filter?: ClaimFilter): Promise<Claim[]>;
  saveClaim(claim: Claim): Promise<void>;
  deleteClaim(issueId: string): Promise<void>;

  // Real-time
  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe;
}
```

### SQLite Implementation
Uses Claude Flow memory MCP tools with `namespace: 'claims'`:
```typescript
class SQLiteClaimsStorage implements ClaimsStorage {
  async saveClaim(claim: Claim) {
    await mcp.memory_store({
      key: `claim:${claim.issueId}`,
      value: JSON.stringify(claim),
      metadata: { namespace: 'claims', type: 'claim' }
    });
  }

  subscribe(callback) {
    // Poll every 1s, diff, emit changes
    return startPolling(1000, callback);
  }
}
```

### RuVector/Postgres Implementation
Direct database access with LISTEN/NOTIFY:
```typescript
class RuVectorClaimsStorage implements ClaimsStorage {
  async saveClaim(claim: Claim) {
    await sql`INSERT INTO claims ...`;
    // NOTIFY triggered automatically by trigger
  }

  subscribe(callback) {
    return pg.listen('claim_changes', callback);
  }
}
```

### Postgres Schema

```sql
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'backlog',
  claimant_type VARCHAR(10) NOT NULL,  -- 'human' | 'agent'
  claimant_id VARCHAR(255) NOT NULL,
  claimant_name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(100),              -- null for humans
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  context TEXT,                         -- handoff notes
  metadata JSONB,                       -- extensible metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN (
    'backlog', 'agent_working', 'human_review', 'revision', 'done'
  ))
);

-- Trigger for real-time notifications
CREATE OR REPLACE FUNCTION notify_claim_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('claim_changes', json_build_object(
    'operation', TG_OP,
    'claim_id', COALESCE(NEW.id, OLD.id),
    'issue_id', COALESCE(NEW.issue_id, OLD.issue_id),
    'status', NEW.status,
    'claimant_type', NEW.claimant_type,
    'claimant_name', NEW.claimant_name,
    'progress', NEW.progress,
    'updated_at', NEW.updated_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_notify
AFTER INSERT OR UPDATE ON claims
FOR EACH ROW EXECUTE FUNCTION notify_claim_change();
```

### Sync with MCP Tools
Dashboard mutations also call MCP tools to keep in-memory state consistent:
```typescript
async function claimIssue(issueId: string, claimant: string) {
  // 1. Persist to storage
  await storage.saveClaim({ issueId, claimant, status: 'active', ... });

  // 2. Sync to MCP (keeps in-memory state consistent)
  await mcp.claims_claim({ issueId, claimant });
}
```

## Consequences

### Positive
- Works locally with SQLite (zero setup)
- Scales to production with RuVector/Postgres
- MCP tools remain source of truth for agent operations
- Dashboard reads from persistent storage

### Negative
- Dual-write to storage + MCP (must keep in sync)
- SQLite polling adds 1s latency (vs instant with Postgres NOTIFY)
