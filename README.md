# Claims Dashboard

A real-time Kanban board for coordinating work between humans and AI agents. Claims (work items) flow through a 5-column pipeline:

```
Backlog --> Agent Working --> Human Review --> Agent Revision --> Done
```

The dashboard provides live updates via WebSocket, drag-and-drop card management, agent activity logs, and optional GitHub issue synchronization.

```
+---------------------+          +-----------------------+
|  React + Vite       |  WS/REST |  Hono Server          |
|  (Kanban Board UI)  | <------> |  (API + WebSocket Hub)|
+---------------------+          +----------+------------+
                                            |
                          +-----------------+-----------------+
                          |                                   |
                  +-------+--------+               +---------+---------+
                  | Storage Layer  |               | Orchestrator      |
                  | Memory/SQLite/ |               | Agent Spawner +   |
                  | PostgreSQL     |               | Task Router       |
                  +----------------+               +-------------------+
                                                          |
                                                   claude-flow agents
```

## Prerequisites

- **Bun** >= 1.0 (runtime and package manager)
- **Docker + Docker Compose** (for PostgreSQL; optional if using in-memory or SQLite storage)
- **Node.js 20+** (optional, only needed if running the orchestrator CLI separately)

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Start the database

The app supports 3 storage backends. For local development, PostgreSQL is recommended:

```bash
# Start ONLY the postgres service (not the full stack)
docker compose up -d postgres
```

> **Important:** Use `docker compose up -d postgres`, not `docker compose up -d`. The latter also starts a containerized dashboard on port 3001, which conflicts with local dev.

Migrations run automatically — the `migrations/` directory is mounted into the Postgres container via `docker-entrypoint-initdb.d`, so the schema is created on first startup.

Alternatively, skip Docker entirely:
- **SQLite**: Don't set `DATABASE_URL` — the server falls back to SQLite automatically
- **In-memory**: Set `NODE_ENV=test` — uses in-memory storage (data lost on restart)

### 3. Configure environment

```bash
cp .env.example .env   # edit as needed
```

The defaults work out of the box with the Docker postgres service (user: `claude`, password: `claude-flow-test`, db: `claude_flow`).

### 4. Start the dev server

```bash
bun run dev
```

This starts both the Hono API server (port 3000) and the Vite dev server (port 5173) concurrently. The Vite dev server proxies `/api` and `/ws` requests to the backend.

Open http://localhost:5173 in your browser.

### 5. Log in

Authentication is **disabled by default** in development (`NODE_ENV=development`). You'll be logged in automatically.

In production, the login screen asks for a **Name** and **Secret**. Enter any display name and the value of `TEAM_SECRET` from your `.env` file. With the defaults from `.env.example`:

- **Name**: anything you like (e.g. `Nate`)
- **Secret**: `changeme-in-production`

To force auth on in development, set `AUTH_DISABLED=false` in your `.env`. To force it off in production, set `AUTH_DISABLED=true`.

### 6. Start the orchestrator (optional)

The orchestrator polls the dashboard for backlog items and spawns Claude Code agents to work on them. It runs as a separate process:

```bash
# In a second terminal
bun run orchestrator
```

Or start everything together (server + frontend + orchestrator):

```bash
bun run dev:all
```

The orchestrator connects to the dashboard API at `http://localhost:3000` by default. See the [Orchestrator config](#orchestrator) section for all options.

## Configuration

All configuration is done through environment variables. Copy `.env.example` to `.env` and adjust:

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `HOST` | `0.0.0.0` | Server bind address |
| `NODE_ENV` | `development` | Environment: `development`, `production`, `test` |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | _(unset)_ | PostgreSQL connection string. If unset, falls back to SQLite or in-memory storage |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `claude_flow` | PostgreSQL database name |
| `POSTGRES_USER` | `claude` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `claude-flow-test` | PostgreSQL password |
| `DB_CONNECT_RETRIES` | `30` | Number of DB connection retry attempts |
| `DB_CONNECT_INTERVAL` | `2` | Seconds between connection retries |
| `SKIP_MIGRATIONS` | `false` | Set to `true` to skip automatic migrations |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `TEAM_SECRET` | _(unset)_ | Shared secret for the login screen. Required when auth is enabled |
| `AUTH_DISABLED` | _(unset)_ | Explicit override. If unset, auth is off in development, on in production |

### GitHub Integration (Optional)

The dashboard can sync GitHub issues into the Kanban board as claims. Issues are polled periodically and imported — the sync is read-only and never writes back to GitHub.

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_OWNER` | _(unset)_ | Repository owner (e.g. `natea`) |
| `GITHUB_REPO` | _(unset)_ | Repository name (e.g. `my-project`) |
| `GITHUB_TOKEN` | _(unset)_ | Fine-grained Personal Access Token (see below) |
| `GITHUB_LABELS` | _(unset)_ | Comma-separated label filter (only import matching issues) |
| `GITHUB_POLL_INTERVAL` | `60` | Polling interval in seconds |

**Creating a GitHub PAT**: Go to [GitHub Settings > Fine-grained tokens](https://github.com/settings/personal-access-tokens/new) and create a token with:
- **Repository access**: Select the specific repository you want to sync
- **Permissions**: Issues → **Read-only** (Metadata read-only is granted automatically)

No other permissions are needed. For public repos, the token is optional but recommended to avoid rate limits (60 req/hr unauthenticated vs 5,000 req/hr with a token).

### Orchestrator

The orchestrator polls the dashboard for backlog claims and spawns Claude Code agents to work on them.

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCHESTRATOR_ENABLED` | `false` | Set to `true` in `start.sh`/Docker to auto-start the orchestrator |
| `ORCHESTRATOR_DASHBOARD_URL` | `http://localhost:3000` | Dashboard API URL the orchestrator connects to |
| `ORCHESTRATOR_API_KEY` | _(unset)_ | API key for dashboard auth (required when auth is enabled) |
| `ORCHESTRATOR_MAX_AGENTS` | `4` | Maximum concurrent agents |
| `ORCHESTRATOR_POLL_INTERVAL_MS` | `5000` | How often to check for backlog items (ms) |
| `ORCHESTRATOR_WORKING_DIR` | `cwd` | Working directory for agent processes |
| `ORCHESTRATOR_USE_WORKTREES` | `true` | Use git worktrees to isolate agent work |
| `ORCHESTRATOR_CLEANUP_WORKTREES` | `false` | Remove worktrees after agent completes |

### WebSocket / CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_HEARTBEAT_INTERVAL` | `30000` | WebSocket heartbeat interval (ms) |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |

## Architecture

### Layer Diagram

```
Frontend (React + Vite + Tailwind)
  |  Zustand stores, drag-and-drop (@hello-pangea/dnd)
  |
  v
WebSocket (/ws)  +  REST API (/api/*)
  |
  v
Server (Hono on Bun)
  ├── routes/claims.ts    -- CRUD + claim/release/handoff endpoints
  ├── routes/auth.ts      -- Team-secret authentication
  ├── routes/health.ts    -- Health, readiness, liveness probes
  ├── routes/hooks.ts     -- claude-flow webhook receiver
  ├── ws/hub.ts           -- WebSocket connection management + rooms
  ├── events/aggregator.ts -- Event fan-out from storage to WebSocket
  └── github/sync.ts      -- GitHub issue polling + sync
  |
  v
Storage Layer (pluggable)
  ├── memory.ts   -- In-memory (dev/test)
  ├── sqlite.ts   -- SQLite via bun:sqlite (single-node production)
  └── postgres.ts -- PostgreSQL (multi-node production)
  |
  v
Orchestrator (separate process)
  ├── orchestrator.ts    -- Lifecycle: poll backlog, assign agents
  ├── agent-spawner.ts   -- Spawn claude-flow agents via CLI
  ├── task-router.ts     -- Route tasks to agent types + models
  └── dashboard-client.ts -- REST/WS client for the dashboard API
```

### Shared Types

The `shared/` directory is the single source of truth for types used across server, frontend, and orchestrator:

- `shared/types.ts` -- `Claim`, `ClaimJSON`, `ClaimStatus`, `Claimant`, `AgentType`
- `shared/events.ts` -- `DashboardEvent`, `ClaimEvent`, `AgentEvent`, WebSocket message types
- `shared/filters.ts` -- `ClaimFilter`, `Unsubscribe`

## Project Structure

```
./
├── server/                  # Hono API server
│   ├── index.ts             # Server entry point (Bun.serve + WebSocket)
│   ├── config.ts            # Environment-based configuration
│   ├── domain/              # Domain types
│   ├── events/              # Event aggregator (storage -> WS)
│   ├── github/              # GitHub issue sync service
│   ├── routes/              # API route handlers + tests
│   ├── storage/             # Pluggable storage (memory/sqlite/postgres)
│   └── ws/                  # WebSocket hub + room management
├── orchestrator/            # Agent lifecycle management
│   ├── orchestrator.ts      # Core orchestrator (poll + assign)
│   ├── orchestrator.test.ts # Orchestrator tests
│   ├── agent-spawner.ts     # Agent process spawning
│   ├── task-router.ts       # Task-to-agent routing
│   ├── dashboard-client.ts  # Dashboard REST/WS client
│   ├── config.ts            # Orchestrator config loader
│   ├── index.ts             # CLI entry point
│   └── types.ts             # Orchestrator type definitions
├── src/                     # React frontend
│   ├── main.tsx             # App entry point
│   ├── App.tsx              # Root component
│   ├── index.css            # Tailwind base styles
│   ├── components/          # UI components
│   │   ├── Board/           # Kanban board, columns, claim cards
│   │   ├── Activity/        # Agent activity panel + log stream
│   │   ├── Auth/            # Login form
│   │   └── shared/          # Header, Avatar, Badge, ThemeToggle
│   ├── hooks/               # React hooks (useAuth, useClaims, useWebSocket)
│   ├── lib/                 # API client, WebSocket client, types
│   └── stores/              # Zustand stores (claims, activity, auth, theme)
├── shared/                  # Canonical types (shared across layers)
│   ├── types.ts             # Claim, ClaimJSON, Claimant, AgentType
│   ├── events.ts            # DashboardEvent, WebSocket messages
│   └── filters.ts           # ClaimFilter, Unsubscribe
├── __tests__/               # Integration tests
│   ├── storage.test.ts      # Storage layer tests
│   └── stores.test.ts       # Zustand store tests
├── migrations/              # SQL schema migrations
│   └── 001_claims_table.sql # Core claims table + NOTIFY triggers
├── index.html               # Vite HTML entry point
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build configuration
├── tailwind.config.ts       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS plugins
├── bunfig.toml              # Bun configuration (peer deps, coverage)
├── Dockerfile               # Multi-stage production build
├── docker-compose.yml       # PostgreSQL + dashboard services
├── start.sh                 # Docker container startup script
├── .env.example             # Environment variable reference
├── .dockerignore            # Docker build exclusions
└── .gitignore               # Git exclusions
```

## Development

```bash
# Install dependencies
bun install

# Start dev server (API + Vite concurrently)
bun run dev

# Start everything (API + Vite + orchestrator)
bun run dev:all

# Start only the API server (with hot reload)
bun run dev:server

# Start only the Vite frontend dev server
bun run dev:client

# Start only the orchestrator (with hot reload)
bun run dev:orchestrator

# Run all tests
bun test

# Type check without emitting
npx tsc --noEmit

# Build for production
bun run build

# Run database migrations manually
bun run db:migrate
```

## Deployment

### Docker Compose (full stack)

For production or self-contained deployment, Docker Compose runs both PostgreSQL and the dashboard:

```bash
# Build and start everything
docker compose up --build -d

# View logs
docker compose logs -f dashboard
```

This starts:
- **PostgreSQL** on port 5432 (with auto-migration via `migrations/` volume mount)
- **Dashboard + Orchestrator** on port 3001 (host) → 3000 (container), built from the multi-stage Dockerfile. The orchestrator starts automatically inside the container (`ORCHESTRATOR_ENABLED=true`)

The Dockerfile uses a 4-stage build: base (bun:1-alpine) → deps (production only) → builder (full build) → runner (minimal runtime). The `start.sh` script waits for the database to be ready before starting the server.

### Manual Production Build

```bash
bun run build          # Builds frontend to dist/client, server to dist/server
bun run start          # Starts the production server
```

The production server serves the built React frontend as static files and handles API requests on the same port.
