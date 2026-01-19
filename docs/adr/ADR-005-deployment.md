# ADR-005: Docker Compose Deployment

## Status
Proposed

## Date
2026-01-19

## Context
The dashboard needs to run alongside RuVector/Postgres. We need a deployment strategy that:
- Integrates with existing RuVector Docker setup
- Is easy to spin up for development
- Supports the full real-time architecture

## Decision

### Extend Existing RuVector Docker Compose

Add the dashboard service to the existing `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # Existing RuVector/Postgres service
  ruvector-postgres:
    image: ruvnet/ruvector-postgres:latest
    container_name: ruvector-postgres
    environment:
      POSTGRES_USER: claude
      POSTGRES_PASSWORD: claude-flow-test
      POSTGRES_DB: claude_flow
    ports:
      - "5432:5432"
    volumes:
      - ruvector_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U claude -d claude_flow"]
      interval: 5s
      timeout: 5s
      retries: 5

  # NEW: Claims Dashboard
  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    container_name: claims-dashboard
    environment:
      # Database
      DATABASE_URL: postgres://claude:claude-flow-test@ruvector-postgres:5432/claude_flow

      # Server
      PORT: 3000
      HOST: 0.0.0.0

      # Auth
      TEAM_SECRET: ${TEAM_SECRET:-changeme}

      # Claude Flow hooks (optional)
      CLAUDE_FLOW_HOOK_URL: http://host.docker.internal:3001/hooks
    ports:
      - "3000:3000"
    depends_on:
      ruvector-postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  ruvector_data:
```

### Dashboard Dockerfile

```dockerfile
# dashboard/Dockerfile
FROM oven/bun:1.0-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build frontend
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./

# Run migrations and start server
CMD ["bun", "run", "start"]
```

### Startup Script

```bash
#!/bin/bash
# start.sh - Run migrations and start server

# Wait for Postgres
echo "Waiting for database..."
until bun run db:ping 2>/dev/null; do
  sleep 1
done

# Run migrations
echo "Running migrations..."
bun run db:migrate

# Start server
echo "Starting dashboard..."
exec bun run server/index.ts
```

### Quick Start Commands

```bash
# Option 1: Use CLI to generate docker-compose
npx @claude-flow/cli@latest dashboard setup --output ./my-dashboard
cd my-dashboard
docker-compose up -d

# Option 2: Clone and run
git clone <repo>
cd dashboard
docker-compose up -d

# Option 3: Add to existing RuVector setup
# Copy dashboard service to existing docker-compose.yml
docker-compose up -d dashboard
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (required) | Postgres connection string |
| `PORT` | 3000 | Dashboard server port |
| `HOST` | 0.0.0.0 | Bind address |
| `TEAM_SECRET` | changeme | Shared auth secret |
| `CLAUDE_FLOW_HOOK_URL` | - | Optional: Hook receiver URL |
| `LOG_LEVEL` | info | Logging verbosity |

### Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Network                              │
│                                                                 │
│  ┌─────────────────────┐      ┌─────────────────────────────┐  │
│  │ ruvector-postgres   │      │ claims-dashboard            │  │
│  │                     │      │                             │  │
│  │ Port: 5432 (internal)│◄────│ Connects via DATABASE_URL   │  │
│  │ Port: 5432 (host)   │      │ Port: 3000 (host)           │  │
│  └─────────────────────┘      └─────────────────────────────┘  │
│           │                              │                      │
└───────────┼──────────────────────────────┼──────────────────────┘
            │                              │
            ▼                              ▼
    Host: localhost:5432           Host: localhost:3000
    (DB tools, debugging)          (Browser access)
```

### Database Migrations

The dashboard will auto-run migrations on startup:

```sql
-- migrations/001_claims_table.sql
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id VARCHAR(255) NOT NULL UNIQUE,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',  -- 'github', 'manual', 'mcp'
  source_ref VARCHAR(255),                       -- GitHub issue URL, etc.

  status VARCHAR(50) NOT NULL DEFAULT 'backlog',
  claimant_type VARCHAR(10),
  claimant_id VARCHAR(255),
  claimant_name VARCHAR(255),
  agent_type VARCHAR(100),

  progress INTEGER DEFAULT 0,
  context TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN (
    'backlog', 'active', 'paused', 'blocked',
    'review-requested', 'completed'
  )),
  CONSTRAINT valid_source CHECK (source IN (
    'github', 'manual', 'mcp'
  ))
);

-- NOTIFY trigger for real-time updates
CREATE OR REPLACE FUNCTION notify_claim_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('claim_changes', json_build_object(
    'operation', TG_OP,
    'claim', row_to_json(COALESCE(NEW, OLD))
  )::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_notify
AFTER INSERT OR UPDATE OR DELETE ON claims
FOR EACH ROW EXECUTE FUNCTION notify_claim_change();

-- Indexes
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_claims_source ON claims(source);
CREATE INDEX idx_claims_claimant ON claims(claimant_type, claimant_id);
```

## Consequences

### Positive
- Single `docker-compose up` starts everything
- Reuses existing RuVector setup
- Health checks ensure proper startup order
- Migrations run automatically

### Negative
- Requires Docker (not just Bun)
- Need to manage secrets via environment variables
- Host networking for hooks requires `host.docker.internal`
