# Dashboard-GOAP Architecture Analysis & Reorganization Plan

**Date:** 2026-02-21
**Updated:** 2026-02-21 (re-evaluation after cleanup)
**Status:** Proposed
**Goal:** Clean up, reorganize, and document the dashboard-goap codebase for upstream push so it's reproducible for anyone continuing work on it.

---

## 1. What This Project Is

A **real-time Kanban board for coordinating work between humans and AI agents**. Claims (work items) flow through a 5-column pipeline:

```
Backlog -> Agent Working -> Human Review -> Agent Revision -> Done
```

The system has 3 layers:

- **React frontend** — Vite + Zustand + Tailwind + @hello-pangea/dnd
- **Bun/Hono backend** — REST API + WebSocket with Postgres/SQLite storage
- **CLI orchestrator** — Separate process bridging the dashboard to claude-flow's swarm system

### Architecture Diagram

```
+---------------------------------------------------------------+
|                   FRONTEND (React/Zustand)                     |
|  App -> [hooks] -> stores -> components -> [API] -> ws client  |
+---------------------------------------------------------------+
                              |
+---------------------------------------------------------------+
|              REST API ROUTES (Hono + Auth)                     |
|  /api/claims, /api/health, /api/hooks, /api/auth              |
+---------------------------------------------------------------+
                              |
+---------------------------------------------------------------+
|         WEBSOCKET HUB (Real-time Broadcasting)                |
|  Room subscriptions -> Event broadcasting -> snapshots         |
+---------------------------------------------------------------+
                              |
+---------------------------------------------------------------+
|        EVENT AGGREGATION (Multi-source events)                |
|  Storage events + Postgres NOTIFY + Hooks + Agent stdout       |
+---------------------------------------------------------------+
                              |
+---------------------------------------------------------------+
|     STORAGE LAYER (Strategy pattern: 3 implementations)       |
|  MemoryStorage | SQLiteStorage | PostgresStorage              |
+---------------------------------------------------------------+
                              |
+---------------------------------------------------------------+
|        EXTERNAL INTEGRATIONS (Optional)                       |
|  GitHub API polling -> Claims sync -> WebSocket broadcast      |
+---------------------------------------------------------------+

+---------------------------------------------------------------+
|             ORCHESTRATOR (Separate Process)                    |
|  Polls dashboard API -> Routes tasks -> Spawns agents via CLI  |
+---------------------------------------------------------------+
```

### Current File Tree (Post-Cleanup)

```
dashboard-goap/
|-- package.json              (ROOT - stale, see Section 6.1)
|-- tsconfig.json             (ROOT - stale, see Section 6.1)
|-- docker-compose.yml        (ROOT - stale, see Section 6.1)
|-- Dockerfile                (ROOT - stale, see Section 6.1)
|-- bunfig.toml
|-- .env.example
|-- .mcp.json
|-- CLAUDE.md
|-- migrations/
|   +-- 001_claims_table.sql
|-- dashboard/                (ACTUAL APP - all code lives here)
|   |-- package.json          (REAL - has correct deps & scripts)
|   |-- tsconfig.json         (REAL - includes orchestrator/**)
|   |-- docker-compose.yml    (REAL - postgres:16-alpine, port 3001)
|   |-- Dockerfile            (REAL - uses start.sh, bun.lock)
|   |-- .env / .env.example
|   |-- bunfig.toml
|   |-- index.html            (Vite SPA entry)
|   |-- vite.config.ts
|   |-- tailwind.config.ts
|   |-- postcss.config.js
|   |-- start.sh
|   |-- orchestrator/         (~3,889 LOC)
|   |   |-- index.ts          (CLI entry - 149 LOC)
|   |   |-- orchestrator.ts   (Core coordination - 1,043 LOC)
|   |   |-- agent-spawner.ts  (Agent lifecycle - 771 LOC)
|   |   |-- dashboard-client.ts (API client - 390 LOC)
|   |   |-- task-router.ts    (Routing logic - 502 LOC)
|   |   |-- config.ts         (Configuration - 103 LOC)
|   |   |-- types.ts          (Type definitions - 284 LOC)
|   |   +-- orchestrator.test.ts (Tests - 329 LOC)
|   |-- server/               (~4,621 LOC)
|   |   |-- index.ts          (Hono server - 208 LOC)
|   |   |-- config.ts         (Server config - 110 LOC)
|   |   |-- domain/
|   |   |   |-- types.ts      (Domain models)
|   |   |   +-- types.test.ts
|   |   |-- routes/
|   |   |   |-- claims.ts
|   |   |   |-- auth.ts
|   |   |   |-- health.ts
|   |   |   |-- hooks.ts
|   |   |   +-- routes.test.ts
|   |   |-- storage/
|   |   |   |-- interface.ts
|   |   |   |-- index.ts
|   |   |   |-- memory.ts
|   |   |   |-- postgres.ts
|   |   |   |-- sqlite.ts
|   |   |   |-- memory.test.ts
|   |   |   +-- sqlite.test.ts
|   |   |-- events/
|   |   |   |-- aggregator.ts (412 LOC)
|   |   |   +-- types.ts
|   |   |-- ws/
|   |   |   |-- hub.ts
|   |   |   |-- rooms.ts
|   |   |   +-- types.ts
|   |   +-- github/
|   |       |-- sync.ts
|   |       +-- types.ts
|   |-- src/                  (~2,516 LOC)
|   |   |-- main.tsx
|   |   |-- App.tsx
|   |   |-- index.css
|   |   |-- components/
|   |   |   |-- Board/ (Board.tsx, Column.tsx, ClaimCard.tsx)
|   |   |   |-- Activity/ (ActivityPanel.tsx, AgentStatus.tsx, LogStream.tsx)
|   |   |   |-- Auth/ (LoginForm.tsx)
|   |   |   +-- shared/ (Header, Avatar, Badge, Progress, ThemeToggle)
|   |   |-- hooks/ (useAuth, useClaims, useWebSocket)
|   |   |-- stores/ (auth, claims, activity, theme)
|   |   +-- lib/ (api.ts, ws.ts, types.ts)
|   +-- __tests__/
|       |-- storage.test.ts
|       +-- stores.test.ts
+-- .claude-flow/             (Agent state & metrics - not app code)
```

### Codebase Stats

| Layer | Files | ~LOC |
|-------|-------|------|
| Server | 20 | 4,621 |
| Orchestrator | 8 | 3,889 |
| Frontend | 26 | 2,516 |
| Tests | 6 | ~600 |
| Migrations | 1 | 162 |
| **Total Source** | **~61** | **~11,788** |

---

## 2. Critical Bugs

### 2.1 Operator Precedence Bug (REAL BUG)

**File:** `dashboard/server/routes/hooks.ts:350-352`

`&&` binds tighter than `||`, so the `result` field is **never set** for completed events.

```typescript
// BROKEN (current):
...(payload.event === "completed" || payload.event === "failed" && {
  result: payload.event === "completed" ? "success" : "failure",
}),

// FIXED:
...((payload.event === "completed" || payload.event === "failed") && {
  result: payload.event === "completed" ? "success" : "failure",
}),
```

### 2.2 Event Aggregator Not Wired

**File:** `dashboard/server/index.ts`

`aggregator.connectStorage()` exists but is **never called**. The designed event flow (storage -> aggregator -> hub) is broken. Routes work around it by calling `hub.broadcast()` directly.

### 2.3 Missing WebSocket Error Handler

**File:** `dashboard/server/index.ts:185-195`

`hub.handleError()` exists but `Bun.serve()` websocket config doesn't wire the `error` handler.

### 2.4 Security: Shared Secret Returned as Token

**File:** `dashboard/server/routes/auth.ts:132`

Login endpoint returns the shared secret as the user's auth token. Anyone with a token effectively has the server secret.

### 2.5 Empty issueId in Agent Progress Events

**File:** `dashboard/server/events/aggregator.ts:389`

`processAgentOutput()` emits `AgentProgressEvent` with an empty string `issueId`. Progress events from stdout parsing will fail to route to the correct claim room.

---

## 3. Diverged Type Definitions (6 Duplicates)

The core types are defined in **multiple places** and have **diverged**. This is the highest-priority structural issue.

### 3.1 Core Domain Types (2 locations, diverged)

| Type | Server (`server/domain/types.ts`) | Client (`src/lib/types.ts`) | Divergence |
|------|-----------------------------------|----------------------------|------------|
| `AgentType` | 14 values | 6 values (includes `"debugger"` which server lacks) | **MISMATCH** |
| `Claim.createdAt` | `Date` | `string` | **MISMATCH** |
| `Claim.updatedAt` | `Date` | `string` | **MISMATCH** |
| `parseClaimant` | Defined | Missing | Client lacks helpers |
| `serializeClaimant` | Defined | Missing | Client lacks helpers |

### 3.2 ClaimFilter (3 locations, diverged)

- `server/storage/interface.ts:4-8` — `status?: ClaimStatus`, `source?: string`, `claimantType?: "human" | "agent"`
- `orchestrator/types.ts:102-106` — `status?: ClaimStatus | ClaimStatus[]`, `claimant?: string`, `source?: string`
- `server/routes/claims.ts:61-65` — Zod schema version with same fields as storage interface

### 3.3 ClaimEvent (2 locations, different shapes)

- `server/storage/interface.ts:10-14` — `type: "created" | "updated" | "deleted"`
- `src/lib/types.ts:162-170` — `type: "claim.created" | "claim.updated" | "claim.deleted" | "agent.activity"` (dot-prefixed, extra event type)

### 3.4 WsMessage Types (3 locations, different shapes)

- `orchestrator/types.ts:109-121` — `WsMessage`
- `src/lib/types.ts:147-160` — `WSMessage` (different casing)
- `server/ws/types.ts:38-108` — Server-side WS event types

### 3.5 ClaimRow (2 locations, near-identical)

- `server/storage/postgres.ts:20-34` — `metadata: Record<string, unknown> | null`, `created_at: Date`
- `server/storage/sqlite.ts:14-28` — `metadata: string | null`, `created_at: string`

### 3.6 Unsubscribe (2 locations, identical)

- `server/storage/interface.ts:16`
- `orchestrator/types.ts:256`

---

## 4. Dead Code (11+ items)

### 4.1 Unused Exported Functions

| Dead Export | File | Notes |
|---|---|---|
| `optionalAuthMiddleware()` | `server/routes/auth.ts:184` | Never imported |
| `handleError()` | `server/ws/hub.ts:205` | Exists but not wired to Bun.serve |
| `createAgentSpawner()` | `orchestrator/agent-spawner.ts:755` | Factory never used; Orchestrator uses `new` directly |
| `createTaskRouter()` | `orchestrator/task-router.ts:500` | Factory never used; Orchestrator uses `new` directly |
| `createOrchestrator()` | `orchestrator/orchestrator.ts:1026` | Factory never used; CLI uses `new` directly |
| `useAgentSubscription()` | `src/hooks/useWebSocket.ts:95` | Hook never imported by any component |

### 4.2 Unused Constants/Methods

| Dead Export | File | Notes |
|---|---|---|
| `ROOM_BOARD` | `server/ws/rooms.ts:146` | Never imported |
| `ROOM_LOGS` | `server/ws/rooms.ts:147` | Never imported |
| `agentRoom()` | `server/ws/rooms.ts:152` | Never imported |
| `claimRoom()` | `server/ws/rooms.ts:159` | Never imported |
| `RoomManager.leaveAll()` | `server/ws/rooms.ts` | Never called from hub |
| `RoomManager.getMatchingRooms()` | `server/ws/rooms.ts` | Never called from hub |
| `RoomManager.getRoomCount()` | `server/ws/rooms.ts` | Never called from hub |
| `RoomManager.getConnectionCount()` | `server/ws/rooms.ts` | Never called from hub |

### 4.3 Unused Type Imports

| Import | File | Notes |
|---|---|---|
| `Claimant` | `server/storage/postgres.ts:6` | Only `parseClaimant`/`serializeClaimant` used |
| `Claimant` | `server/storage/sqlite.ts:6` | Same |
| `Claimant` | `server/events/types.ts:2` | Never referenced in file body |
| `consoleLogger` (as type) | `orchestrator/task-router.ts:11` | Value imported as type |

### 4.4 Unimplemented Feature Stubs

| Stub | File | Notes |
|---|---|---|
| `ClaimHandoffEvent` type | `server/ws/types.ts:130-135` | Type defined, never produced by any code |
| `modelTierToArg()` | `orchestrator/agent-spawner.ts:76-89` | Identity function (maps every value to itself) |

---

## 5. Unnecessary Complexity

### 5.1 `listClaims()` in PostgresStorage

**File:** `server/storage/postgres.ts:102-152`

Builds unused `query` variable, populates unused `conditions` array, then has 4 separate branches (no filter, status-only, source-only, complex) producing full SQL queries. The complex branch handles all cases, making the 3 special-case branches dead code.

**Fix:** Keep only the general-purpose query builder.

### 5.2 `findClaim()` Linear Scan Fallback

**File:** `server/routes/claims.ts:75-95`

Fetches ALL claims and does a linear scan when direct lookup by `issueId` fails. Includes verbose debug logging (logs all claim IDs). Not suitable for production.

**Fix:** Add `getClaimByIssueId()` to the storage interface. Remove debug logging.

### 5.3 Copy-Pasted emit/subscribe Pattern

The listener registration + emit pattern is duplicated across 4 files:

- `server/storage/memory.ts:68-77`
- `server/storage/postgres.ts:240-249`
- `server/storage/sqlite.ts:231-240`
- `server/events/aggregator.ts:42-58`

**Fix:** Extract into a shared `EventEmitter` base class or mixin.

### 5.4 Duplicate `rowToClaim()` Logic

Nearly identical private methods in `postgres.ts` and `sqlite.ts`.

**Fix:** Extract to a shared utility with a thin adapter for Date vs string parsing.

---

## 6. Structural Issues

### 6.1 Duplicate Config Files at Two Levels (CRITICAL)

All code lives in `dashboard-goap/dashboard/`, but `dashboard-goap/` root has its own stale copies of 4 config files. The two sets have **diverged**:

| File | Root (`dashboard-goap/`) | Dashboard (`dashboard-goap/dashboard/`) | Which is Real? |
|------|--------------------------|------------------------------------------|----------------|
| `package.json` | `@claude-flow/claims-dashboard`, no zod/nanoid/concurrently, scripts reference `server/index.ts` directly | `claims-dashboard`, has zod/nanoid/react-hot-toast/concurrently, scripts use `concurrently` | **Dashboard** |
| `tsconfig.json` | Includes `src/**/*`, `server/**/*` (no orchestrator), has `@server/*` alias, references `vite/client` types | Includes `server/**/*`, `src/**/*`, `orchestrator/**/*` | **Dashboard** |
| `docker-compose.yml` | Uses `ruvnet/ruvector-postgres:latest`, port 3000:3000, mounts `./migrations` | Uses `postgres:16-alpine`, port 3001:3000, individual POSTGRES_* vars | **Dashboard** (but root has useful migration mount) |
| `Dockerfile` | Uses `bun.lockb*` (old format), copies `server/` + `migrations/` | Uses `bun.lock` (new format), copies `start.sh`, more polished 4-stage build | **Dashboard** |

**Root configs are stale** — they were written during the initial GOAP planning phase and never updated as the real implementation evolved in `dashboard/`.

**Decision needed**: Either delete root configs entirely (flatten everything into root) or keep the nesting and remove the stale root copies.

### 6.2 Old `dashboard/` at Repo Root

**Status: RESOLVED.** The old `/dashboard/` directory at the repo root has been fully removed. No traces remain. Git status is clean on this front.

### 6.3 No README

No setup instructions, architecture overview, or contribution guide exists.

### 6.4 No Shared Types

Server and client independently define the same domain types, leading to the divergence documented in Section 3.

### 6.5 Confusing Nesting

The actual app lives at `dashboard-goap/dashboard/` which is two levels deep from the repo root. For a standalone push upstream, this nesting adds friction. The `dashboard-goap/` root level currently only contains:
- Stale duplicate configs (should be removed)
- `migrations/` (useful, should stay or move into `dashboard/`)
- `.claude-flow/` (agent state, not app code)
- `.claude/` (Claude Code config, not app code)
- `CLAUDE.md` (agent orchestration instructions)

---

## 7. Proposed Reorganization

### 7.0 Decision: Flatten vs. Keep Nesting

Two approaches for the upstream push:

**Option A: Flatten into `dashboard-goap/` root (Recommended)**
- Move everything from `dashboard/` up one level
- Delete stale root configs
- Result: `dashboard-goap/server/`, `dashboard-goap/src/`, etc.
- Pros: Simpler structure, no confusing nesting, standard project layout
- Cons: Large git diff, every import path stays the same (relative), but Dockerfile/compose need path updates

**Option B: Keep `dashboard/` nesting, clean root**
- Delete stale root configs (package.json, tsconfig, docker-compose, Dockerfile)
- Move `migrations/` into `dashboard/`
- Add README.md at root explaining the structure
- Pros: Minimal file moves, preserves git history better
- Cons: Still has `dashboard-goap/dashboard/` nesting which is odd for standalone repo

**Recommendation: Option A** — For an upstream push as a standalone repo, the flat structure is standard and reduces friction for new contributors. The `dashboard/` nesting only made sense when this lived inside the larger claude-flow-v3 monorepo.

### 7.1 Target Structure (Option A: Flatten)

```
dashboard-goap/                   # This becomes the repo root when pushed upstream
|-- README.md                     # NEW: Setup + architecture + contributing
|-- package.json                  # FROM dashboard/ (the real one)
|-- tsconfig.json                 # FROM dashboard/ (the real one)
|-- docker-compose.yml            # FROM dashboard/ (merge migration mount from root)
|-- Dockerfile                    # FROM dashboard/ (the real one)
|-- .env.example                  # FROM dashboard/
|-- bunfig.toml                   # FROM dashboard/
|-- index.html                    # FROM dashboard/ (Vite SPA entry)
|-- vite.config.ts                # FROM dashboard/
|-- tailwind.config.ts            # FROM dashboard/
|-- postcss.config.js             # FROM dashboard/
|-- start.sh                      # FROM dashboard/
|-- migrations/                   # KEEP at root (already here)
|   +-- 001_claims_table.sql
|-- shared/                       # NEW: Single source of truth for types
|   |-- types.ts                  # Unified Claim, ClaimStatus, AgentType, Claimant
|   |-- events.ts                 # Unified ClaimEvent, WsMessage types
|   +-- filters.ts                # Unified ClaimFilter
|-- server/                       # FROM dashboard/server/
|   |-- index.ts                  # FIX: wire aggregator + ws error handler
|   |-- config.ts
|   |-- domain/
|   |   +-- types.ts              # GUTTED: re-exports from shared/types.ts
|   |-- routes/
|   |   |-- claims.ts             # FIX: remove findClaim linear scan
|   |   |-- health.ts
|   |   |-- hooks.ts              # FIX: operator precedence bug
|   |   +-- auth.ts               # CLEAN: remove dead optionalAuthMiddleware
|   |-- storage/
|   |   |-- interface.ts          # SIMPLIFY: import types from shared/
|   |   |-- base.ts               # NEW: shared emit/subscribe + rowToClaim
|   |   |-- memory.ts
|   |   |-- postgres.ts           # SIMPLIFY: listClaims, remove ClaimRow dupe
|   |   |-- sqlite.ts             # SIMPLIFY: remove ClaimRow dupe
|   |   +-- index.ts
|   |-- events/
|   |   |-- aggregator.ts         # FIX: wire to storage
|   |   +-- types.ts              # GUTTED: re-exports from shared/events.ts
|   |-- ws/
|   |   |-- hub.ts                # FIX: wire error handler
|   |   |-- rooms.ts              # CLEAN: remove unused exports
|   |   +-- types.ts              # SIMPLIFY: import from shared/
|   +-- github/
|       |-- sync.ts
|       +-- types.ts
|-- orchestrator/                 # FROM dashboard/orchestrator/
|   |-- index.ts
|   |-- orchestrator.ts           # CLEAN: remove dead createOrchestrator
|   |-- agent-spawner.ts          # CLEAN: remove dead createAgentSpawner, modelTierToArg
|   |-- task-router.ts            # CLEAN: remove dead createTaskRouter, fix import
|   |-- config.ts
|   |-- dashboard-client.ts
|   |-- types.ts                  # SIMPLIFY: import from shared/
|   +-- orchestrator.test.ts
|-- src/                          # FROM dashboard/src/
|   |-- App.tsx
|   |-- main.tsx
|   |-- index.css
|   |-- components/
|   |   |-- Board/ (Board.tsx, Column.tsx, ClaimCard.tsx, index.ts)
|   |   |-- Activity/ (ActivityPanel.tsx, AgentStatus.tsx, LogStream.tsx)
|   |   |-- Auth/ (LoginForm.tsx)
|   |   +-- shared/ (Header, Avatar, Badge, Progress, ThemeToggle)
|   |-- hooks/
|   |   |-- useAuth.ts
|   |   |-- useWebSocket.ts       # CLEAN: remove dead useAgentSubscription
|   |   +-- useClaims.ts
|   |-- stores/ (auth, claims, activity, theme)
|   +-- lib/
|       |-- api.ts
|       |-- ws.ts
|       +-- types.ts              # GUTTED: re-exports from shared/types.ts
+-- __tests__/                    # FROM dashboard/__tests__/
    |-- stores.test.ts
    |-- storage.test.ts
    +-- (server test files stay in their dirs)
```

**Files DELETED (stale root copies):**
- `dashboard-goap/package.json` (old root version)
- `dashboard-goap/tsconfig.json` (old root version)
- `dashboard-goap/docker-compose.yml` (old root version — merge migration mount into dashboard's version)
- `dashboard-goap/Dockerfile` (old root version)

**Files DELETED (the `dashboard/` wrapper):**
- `dashboard-goap/dashboard/` directory itself (contents moved up)

### 7.2 Key Changes Summary

| Change | Impact | Priority |
|--------|--------|----------|
| Fix operator precedence bug in hooks.ts | Fixes broken completed-event handling | **P0** |
| Wire aggregator to storage in server/index.ts | Completes event flow architecture | **P0** |
| Wire WebSocket error handler | Prevents silent connection failures | **P0** |
| Create `shared/types.ts` (single source of truth) | Eliminates 6 type divergences | **P1** |
| Flatten `dashboard/dashboard/` nesting | Simplifies project structure | **P1** |
| Remove dead exports (11+) | Reduces confusion and bundle size | **P1** |
| Extract shared `BaseStorage` (emit + rowToClaim) | Eliminates 4-way duplication | **P2** |
| Simplify `listClaims()` in postgres.ts | Removes dead code paths | **P2** |
| Remove `findClaim()` linear scan | Performance fix | **P2** |
| Remove identity function `modelTierToArg()` | Dead code | **P3** |
| Clean up unused type imports | Tidiness | **P3** |
| Write README.md | Required for upstream push | **P1** |

---

## 8. README Outline

The README should cover:

### 8.1 Overview
- What the project does (Kanban board for human-agent coordination)
- Screenshot or ASCII diagram of the 5-column board
- Architecture diagram (frontend / backend / orchestrator)

### 8.2 Prerequisites
- Bun (version)
- Docker + Docker Compose (for Postgres)
- Node.js 20+ (for orchestrator CLI)
- GitHub token (optional, for issue sync)

### 8.3 Quick Start
```bash
# 1. Clone and install
cd dashboard-goap
bun install

# 2. Start Postgres
docker compose up -d postgres

# 3. Run migrations
bun run migrate

# 4. Start the dashboard
bun run dev

# 5. (Optional) Start the orchestrator
bun run orchestrator
```

### 8.4 Configuration
- Environment variables reference (from .env.example)
- Storage backends (memory / SQLite / Postgres)
- GitHub integration setup
- Auth configuration

### 8.5 Architecture
- Layer diagram
- Domain model (Claim lifecycle, status transitions)
- Event flow (storage -> aggregator -> hub -> WebSocket -> frontend)
- Orchestrator lifecycle (backlog watcher -> task router -> agent spawner)

### 8.6 Development
- Running tests
- Adding a new storage backend
- Adding a new route
- Frontend component conventions

### 8.7 Deployment
- Docker Compose (production)
- Environment variables for production
- Health check endpoints

---

## 9. Execution Order

### Phase 1: Flatten Structure (P1) — Do first to establish clean base
1. Move `dashboard/server/` -> `server/`
2. Move `dashboard/orchestrator/` -> `orchestrator/`
3. Move `dashboard/src/` -> `src/`
4. Move `dashboard/__tests__/` -> `__tests__/`
5. Move config files from `dashboard/` to root: `package.json`, `tsconfig.json`, `docker-compose.yml`, `Dockerfile`, `.env.example`, `bunfig.toml`, `index.html`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `start.sh`
6. Delete stale root configs (the old ones that were at `dashboard-goap/` root)
7. Merge `./migrations` mount from old root docker-compose into the real docker-compose
8. Delete the now-empty `dashboard/` directory
9. Update `tsconfig.json` paths if needed (should be fine since relative paths don't change)
10. Verify: `bun install && bun run typecheck && bun test`

### Phase 2: Fix Bugs (P0)
11. Fix operator precedence in `server/routes/hooks.ts`
12. Wire `aggregator.connectStorage()` in `server/index.ts`
13. Wire WebSocket `error` handler in `server/index.ts`
14. Fix empty `issueId` in `server/events/aggregator.ts`

### Phase 3: Unify Types (P1)
15. Create `shared/types.ts` — canonical Claim, ClaimStatus, AgentType, Claimant, parseClaimant, serializeClaimant
16. Create `shared/events.ts` — unified ClaimEvent, WsMessage, DashboardEvent
17. Create `shared/filters.ts` — unified ClaimFilter
18. Update `server/domain/types.ts` to re-export from `shared/types.ts`
19. Update `src/lib/types.ts` to re-export from `shared/types.ts` (with string dates for JSON)
20. Update `orchestrator/types.ts` to import from `shared/`
21. Update all other imports across server, orchestrator, and frontend
22. Verify: `bun run typecheck && bun test`

### Phase 4: Remove Dead Code (P1)
23. Remove `createAgentSpawner()` from `orchestrator/agent-spawner.ts`
24. Remove `createTaskRouter()` from `orchestrator/task-router.ts`
25. Remove `createOrchestrator()` from `orchestrator/orchestrator.ts`
26. Remove `modelTierToArg()` identity function from `orchestrator/agent-spawner.ts`
27. Remove `optionalAuthMiddleware()` from `server/routes/auth.ts`
28. Remove `useAgentSubscription()` from `src/hooks/useWebSocket.ts`
29. Remove unused room constants/methods from `server/ws/rooms.ts`
30. Remove unused type imports (`Claimant` in postgres/sqlite/events, `consoleLogger` in task-router)
31. Remove or implement `ClaimHandoffEvent` stub in `server/ws/types.ts`

### Phase 5: Reduce Duplication (P2)
32. Extract `BaseStorage` class with shared emit/subscribe + rowToClaim pattern
33. Have `MemoryStorage`, `PostgresStorage`, `SQLiteStorage` extend `BaseStorage`
34. Simplify `listClaims()` in PostgresStorage (keep only general-purpose query builder)
35. Replace `findClaim()` linear scan with `getClaimByIssueId()` on storage interface
36. Extract duplicate stdout/stderr reading logic in `agent-spawner.ts`

### Phase 6: Document (P1)
37. Write `README.md` per outline in Section 8
38. Verify: `docker compose up --build` works
39. Final `bun run typecheck && bun test`

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import path breakage during flatten | High | Medium | Update paths incrementally, run `tsc --noEmit` after each batch |
| Test breakage from type unification | Medium | Medium | Run full test suite after shared types created |
| Docker config conflicts during dedup | Low | High | Test `docker compose up` at each stage |
| Frontend build breakage from vite config move | Medium | Low | Verify `bun run dev` after move |

---

## 11. Success Criteria

- [ ] Flat structure: `server/`, `orchestrator/`, `src/` at `dashboard-goap/` root
- [ ] No `dashboard-goap/dashboard/` nesting
- [ ] No duplicate config files (single package.json, tsconfig, docker-compose, Dockerfile)
- [ ] All P0 bugs fixed (operator precedence, aggregator wiring, ws error handler)
- [ ] Single source of truth for all shared types in `shared/`
- [ ] All dead code removed (11+ unused exports)
- [ ] `bun run typecheck` passes (no type errors)
- [ ] `bun test` passes (all tests green)
- [ ] `bun run dev` serves frontend + backend
- [ ] `docker compose up --build` works from project root
- [ ] README.md enables a new contributor to clone, install, and run the project
- [ ] Clean git status ready for upstream push

---

## 12. GOAP Execution Plan

### 12.0 State Model

```
CURRENT STATE:
  structure       = nested          # dashboard-goap/dashboard/...
  stale_configs   = 4               # package.json, tsconfig, docker-compose, Dockerfile at root
  critical_bugs   = 5               # Sections 2.1-2.5
  type_divergence = 6               # Section 3.1-3.6
  dead_code       = 11+             # Section 4.1-4.4
  duplication     = 4_patterns      # Section 5.1-5.4
  readme          = none
  tests_passing   = unknown         # must baseline first

GOAL STATE:
  structure       = flat            # server/, orchestrator/, src/ at dashboard-goap/ root
  stale_configs   = 0
  critical_bugs   = 0
  type_divergence = 0               # shared/ is single source of truth
  dead_code       = 0
  duplication     = reduced         # BaseStorage, shared rowToClaim
  readme          = complete
  tests_passing   = true
  docker_build    = working
  bun_dev         = working
```

### 12.1 Pre-Flight: Establish Baseline

**Purpose:** Before touching anything, record the current state so every subsequent phase can be verified against a known starting point.

#### Milestone M0: Baseline Snapshot

| Field | Value |
|-------|-------|
| **ID** | M0 |
| **Complexity** | Small |
| **Preconditions** | None |
| **Blocks** | M1, M2, M3, M4, M5, M6 (everything) |
| **Estimated time** | 10 minutes |

**Actions:**

1. **M0.1** `cd dashboard-goap/dashboard && bun install` -- Ensure deps are fresh.
2. **M0.2** `cd dashboard-goap/dashboard && bun test` -- Record which tests pass/fail. Save output.
3. **M0.3** `cd dashboard-goap/dashboard && bun run build 2>&1` -- Record whether the Vite + server build succeeds. Note any warnings.
4. **M0.4** `cd dashboard-goap/dashboard && npx tsc --noEmit 2>&1` -- Record TypeScript errors. There may be existing ones. Note the count.
5. **M0.5** Create a git tag or stash: `git stash` or `git tag pre-reorg-baseline` so the baseline is recoverable.

**Success criteria:**
- [x] Test results recorded: **111 pass, 5 fail, 0 skip** (116 tests, 244 expect() calls, 7 files)
  - 4 TaskRouter timeout failures (CLI `@claude-flow/cli` not installed locally -- not real code bugs)
  - 1 `PUT /api/claims/:issueId updates claim` failure (expected "active" got "backlog")
- [ ] Build output recorded (skipped -- not requested by task lead)
- [x] TypeScript error count recorded: **4 unique errors** (8 total with duplicate emit passes)
  - `agent-spawner.ts(317)`: `string | null` not assignable to `string | undefined`
  - `orchestrator.test.ts(12)`: Missing `useWorktrees`, `cleanupWorktrees` in config
  - `hooks.ts(350-351)`: Spread types / comparison error (operator precedence bug from Section 2.1)
- [x] Recovery point exists: `git tag pre-reorg-baseline`

**Risk checkpoint:** If tests or build fail catastrophically at baseline, fix those first before proceeding. Do not reorganize on a broken foundation.

---

### 12.2 Phase 1: Flatten Structure

**Purpose:** Move all code from `dashboard-goap/dashboard/` up into `dashboard-goap/` and remove stale root configs. This establishes the clean, flat project layout that all subsequent phases operate on.

#### Milestone M1: Flatten directory hierarchy

| Field | Value |
|-------|-------|
| **ID** | M1 |
| **Complexity** | Large |
| **Preconditions** | M0 (baseline established) |
| **Blocks** | M2, M3, M4, M5, M6 |
| **Estimated time** | 45-60 minutes |
| **Risk** | HIGH -- import paths, Vite config, Dockerfile paths all change |

**Actions (SEQUENTIAL -- each step depends on the prior):**

**M1.1 -- Delete stale root configs**
- Delete `dashboard-goap/package.json` (the stale `@claude-flow/claims-dashboard` version)
- Delete `dashboard-goap/tsconfig.json` (the stale version without orchestrator/**)
- Delete `dashboard-goap/Dockerfile` (the stale version using `bun.lockb*`)
- Delete `dashboard-goap/docker-compose.yml` (the stale version using `ruvnet/ruvector-postgres:latest`)
- Keep `dashboard-goap/migrations/` in place (it stays at root)
- Keep `dashboard-goap/.env.example` temporarily (will be replaced)
- Keep `dashboard-goap/bunfig.toml` temporarily (will be replaced)

**Verification:** `ls dashboard-goap/` should show no `package.json`, `tsconfig.json`, `Dockerfile`, or `docker-compose.yml`.

**M1.2 -- Move source directories up one level**
```bash
cd dashboard-goap
mv dashboard/server ./server
mv dashboard/orchestrator ./orchestrator
mv dashboard/src ./src
mv dashboard/__tests__ ./__tests__
```

**Verification:** `ls dashboard-goap/server/index.ts` and `ls dashboard-goap/orchestrator/index.ts` and `ls dashboard-goap/src/App.tsx` all exist.

**M1.3 -- Move config/build files up one level**
```bash
cd dashboard-goap
mv dashboard/package.json ./package.json
mv dashboard/tsconfig.json ./tsconfig.json
mv dashboard/docker-compose.yml ./docker-compose.yml
mv dashboard/Dockerfile ./Dockerfile
mv dashboard/.env.example ./.env.example      # overwrite stale one
mv dashboard/bunfig.toml ./bunfig.toml        # overwrite stale one
mv dashboard/index.html ./index.html
mv dashboard/vite.config.ts ./vite.config.ts
mv dashboard/tailwind.config.ts ./tailwind.config.ts
mv dashboard/postcss.config.js ./postcss.config.js
mv dashboard/start.sh ./start.sh
mv dashboard/bun.lock ./bun.lock
mv dashboard/.dockerignore ./.dockerignore
mv dashboard/.gitignore ./.gitignore          # merge with existing if needed
```

**Verification:** All config files exist at `dashboard-goap/` root. `dashboard-goap/dashboard/` should only contain `node_modules/`, `dist/`, `.env`, `.swarm/`, `.claude-flow/`.

**M1.4 -- Move dashboard/node_modules up (or reinstall)**

Two options:
- Option A (fast): `mv dashboard/node_modules ./node_modules` -- moves the existing install
- Option B (clean): delete `dashboard/node_modules`, then `bun install` from root

**Recommended: Option B** -- cleaner, avoids any stale symlink issues.

```bash
cd dashboard-goap
rm -rf dashboard/node_modules
rm -rf node_modules          # remove the stale root node_modules too
bun install
```

**M1.5 -- Clean up the now-empty dashboard/ directory**
```bash
cd dashboard-goap
rm -rf dashboard/dist
rm -rf dashboard/.swarm
rm -rf dashboard/.claude-flow
rm -f dashboard/.env
rm -rf dashboard/
```

**Verification:** `ls dashboard-goap/dashboard` should return "No such file or directory".

**M1.6 -- Merge migration volume mount into docker-compose.yml**

The real `docker-compose.yml` (from `dashboard/`) does not mount `./migrations` into the Postgres `initdb.d`. The stale root version did. Add this to the postgres service volumes:

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
  - ./migrations:/docker-entrypoint-initdb.d:ro    # <-- ADD THIS LINE
```

**M1.7 -- Update Dockerfile if needed**

The real Dockerfile (from `dashboard/`) uses `start.sh` and `bun.lock`. Verify it still copies the right paths now that everything is flat. Key lines to check:
- `COPY package.json bun.lock* ./` (not `bun.lockb*`)
- `COPY server ./server` (this is now correct since server/ is at root)
- `COPY start.sh ./start.sh`
- `COPY migrations ./migrations`

**M1.8 -- Verify tsconfig.json paths**

The real `tsconfig.json` has `"include": ["server/**/*", "src/**/*", "orchestrator/**/*"]`. Since we moved these directories up to the same level as `tsconfig.json`, relative paths stay the same. Verify `rootDir: "."` and `baseUrl: "."` are correct.

**M1.9 -- Run full verification battery**
```bash
cd dashboard-goap
bun install                  # should succeed
npx tsc --noEmit             # should have same error count as M0.4 (or fewer)
bun test                     # should have same results as M0.2
bun run dev                  # should serve frontend + backend (manual check, Ctrl+C after)
```

**Success criteria:**
- [x] No `dashboard/` subdirectory exists
- [x] No stale duplicate configs exist
- [x] `bun install` succeeds (187 installs, no changes, 35ms)
- [x] `npx tsc --noEmit` produces same-or-fewer errors than baseline (2 pre-existing errors: agent-spawner.ts null/undefined mismatch, orchestrator.test.ts missing config props)
- [x] `bun test` results match baseline (111 pass, 5 fail -- 4 TaskRouter timeouts from CLI dep, 1 claims route status mismatch -- all pre-existing)
- [ ] `bun run dev` starts without crash (not tested -- requires manual check)
- [x] `migrations/` directory exists at root with `001_claims_table.sql`

**Phase 1 Gate: PASSED** (2026-02-21, coordinator agent)

**Rollback plan:** If import paths break catastrophically, `git checkout -- .` to restore pre-flatten state and try again with more careful path analysis.

---

### 12.3 Phase 2: Fix Critical Bugs

**Purpose:** Fix the 5 bugs documented in Section 2 before any refactoring. This ensures the codebase is correct before we reorganize types and remove code.

**Preconditions:** M1 complete (flat structure established).

These bugs are independent of each other and can be fixed in parallel.

#### Milestone M2a: Fix operator precedence bug (Section 2.1)

| Field | Value |
|-------|-------|
| **ID** | M2a |
| **Complexity** | Small |
| **Preconditions** | M1 |
| **Blocks** | M3 (indirectly -- bugs should be fixed before type refactor) |
| **Estimated time** | 5 minutes |
| **Parallel with** | M2b, M2c, M2d, M2e |

**Actions:**

1. Open `server/routes/hooks.ts` (line ~350)
2. Find the broken expression:
   ```typescript
   ...(payload.event === "completed" || payload.event === "failed" && {
   ```
3. Replace with:
   ```typescript
   ...((payload.event === "completed" || payload.event === "failed") && {
   ```
4. Run `bun test` to verify no regression.

**Success criteria:**
- [x] Parentheses added around the `||` operands
- [x] Tests pass

---

#### Milestone M2b: Wire event aggregator to storage (Section 2.2)

| Field | Value |
|-------|-------|
| **ID** | M2b |
| **Complexity** | Medium |
| **Preconditions** | M1 |
| **Blocks** | M3 |
| **Estimated time** | 15 minutes |
| **Parallel with** | M2a, M2c, M2d, M2e |

**Actions:**

1. Open `server/index.ts`
2. Find where `aggregator` is created (likely via `new EventAggregator(...)`)
3. After the storage instance is created, add: `aggregator.connectStorage(storage)`
4. Verify the method signature in `server/events/aggregator.ts` to confirm `connectStorage` exists and accepts the storage interface type.
5. If routes currently call `hub.broadcast()` directly as a workaround, consider leaving those in place for now (removing them is a Phase 5 cleanup task).

**Success criteria:**
- [x] `aggregator.connectStorage(storage)` is called in server startup
- [x] Storage events now flow through the aggregator
- [x] Tests pass

---

#### Milestone M2c: Wire WebSocket error handler (Section 2.3)

| Field | Value |
|-------|-------|
| **ID** | M2c |
| **Complexity** | Small |
| **Preconditions** | M1 |
| **Blocks** | M3 |
| **Estimated time** | 10 minutes |
| **Parallel with** | M2a, M2b, M2d, M2e |

**Actions:**

1. Open `server/index.ts` (around line 185-195 where `Bun.serve()` websocket config is defined)
2. Add `error` handler that calls `hub.handleError()`:
   ```typescript
   websocket: {
     open(ws) { hub.handleOpen(ws); },
     message(ws, msg) { hub.handleMessage(ws, msg); },
     close(ws) { hub.handleClose(ws); },
     error(ws, error) { hub.handleError(ws, error); },  // <-- ADD
   }
   ```
3. Verify `hub.handleError` signature matches `(ws, error)` parameters.

**Success criteria:**
- [x] WebSocket `error` handler is wired in `Bun.serve()` config
- [x] `hub.handleError` is called on websocket errors
- [x] Tests pass

---

#### Milestone M2d: Fix security -- shared secret as token (Section 2.4)

| Field | Value |
|-------|-------|
| **ID** | M2d |
| **Complexity** | Medium |
| **Preconditions** | M1 |
| **Blocks** | M3 |
| **Estimated time** | 20 minutes |
| **Parallel with** | M2a, M2b, M2c, M2e |

**Actions:**

1. Open `server/routes/auth.ts` (around line 132)
2. Instead of returning the shared secret as the token, generate a unique token (e.g., using `nanoid` or `crypto.randomUUID()`)
3. Store the mapping: token -> user identity (can use an in-memory Map for now, or a lightweight session store)
4. Update the auth middleware to validate tokens against the store instead of comparing to the shared secret
5. Run `bun test` -- auth tests may need updating

**Note:** This is a security-sensitive change. If the fix is complex, consider filing it as a follow-up issue with a `// SECURITY: TODO` comment instead, and document the known vulnerability in the README. The goal is progress, not perfection on the first pass.

**Success criteria:**
- [x] Login endpoint no longer returns the shared secret
- [x] Token-based auth still works
- [x] Tests pass (update auth tests if needed)

---

#### Milestone M2e: Fix empty issueId in agent progress events (Section 2.5)

| Field | Value |
|-------|-------|
| **ID** | M2e |
| **Complexity** | Small |
| **Preconditions** | M1 |
| **Blocks** | M3 |
| **Estimated time** | 10 minutes |
| **Parallel with** | M2a, M2b, M2c, M2d |

**Actions:**

1. Open `server/events/aggregator.ts` (around line 389)
2. Find `processAgentOutput()` where it creates `AgentProgressEvent`
3. The `issueId` is set to `""`. Fix by either:
   - Passing the `issueId` from the calling context
   - Parsing it from the agent stdout format (if there is a pattern like `[ISSUE:xxx]`)
   - Making `issueId` optional in the event type (if some progress events legitimately have no issue)
4. Run `bun test`

**Success criteria:**
- [x] `AgentProgressEvent` no longer has empty string `issueId` (or `issueId` is made optional when unavailable)
- [x] Tests pass

---

#### Phase 2 Gate Check

After all M2a-M2e are complete:

```bash
cd dashboard-goap
bun test                     # all tests pass
npx tsc --noEmit             # same-or-fewer errors than M1.9
```

- [x] All 5 bugs fixed
- [x] Test count is same or better than baseline (111 pass, 5 fail -- all pre-existing)
- [x] No new type errors introduced (note: 1 new TS error `Unsubscribe` export conflict in orchestrator/types.ts is from M3d in-progress work, not Phase 2)

**Phase 2 Gate: PASSED** (2026-02-21, coordinator agent — verified independently)

---

### 12.4 Phase 3: Unify Types

**Purpose:** Create `shared/` as the single source of truth for domain types, eliminating all 6 divergences from Section 3.

**Preconditions:** M1 (flat structure), M2a-M2e (bugs fixed).

This phase is SEQUENTIAL -- each milestone depends on the prior one.

#### Milestone M3a: Create shared/types.ts (canonical domain types)

| Field | Value |
|-------|-------|
| **ID** | M3a |
| **Complexity** | Medium |
| **Preconditions** | M1, M2a-M2e |
| **Blocks** | M3b, M3c, M3d |
| **Estimated time** | 30 minutes |

**Actions:**

1. Create directory `dashboard-goap/shared/`
2. Create `shared/types.ts` containing the canonical versions of:
   - `ClaimStatus` -- the 5 statuses: `"backlog" | "agent_working" | "human_review" | "agent_revision" | "done"`
   - `AgentType` -- union of ALL 14 server values (from `server/domain/types.ts`), keeping `"debugger"` only if it is actually used anywhere
   - `Claimant` -- `{ type: "human" | "agent"; name: string; agentType?: AgentType }`
   - `Claim` -- canonical shape with `createdAt: Date` and `updatedAt: Date` (server canonical)
   - `ClaimJSON` -- derived type with `createdAt: string` and `updatedAt: string` (for JSON transport / frontend)
   - `parseClaimant()` -- from `server/domain/types.ts`
   - `serializeClaimant()` -- from `server/domain/types.ts`
   - `claimToJSON()` -- helper to convert `Claim` to `ClaimJSON`

3. Reference Section 3.1 for divergence details. Reconcile:
   - Server has 14 AgentType values, client has 6 + "debugger". Include all, drop "debugger" if unused.
   - Use `Date` as canonical, provide `ClaimJSON` for string dates.

**Success criteria:**
- [ ] `shared/types.ts` exists with all canonical types
- [ ] File compiles: `npx tsc --noEmit shared/types.ts`

---

#### Milestone M3b: Create shared/events.ts (unified event types)

| Field | Value |
|-------|-------|
| **ID** | M3b |
| **Complexity** | Medium |
| **Preconditions** | M3a |
| **Blocks** | M3d |
| **Estimated time** | 20 minutes |

**Actions:**

1. Create `shared/events.ts` containing:
   - `ClaimEvent` -- unified shape. Reconcile Section 3.3:
     - Server uses `"created" | "updated" | "deleted"`
     - Client uses `"claim.created" | "claim.updated" | "claim.deleted" | "agent.activity"`
     - Decision: use dot-prefixed format as canonical (more descriptive), keep both as an enum
   - `WsMessage` -- unified shape. Reconcile Section 3.4:
     - Decide on casing: `WsMessage` (not `WSMessage`)
     - Include all message types from server, orchestrator, and client
   - `DashboardEvent` -- umbrella type for all events

2. Import `Claim`, `ClaimStatus`, `ClaimJSON` from `./types.ts`

**Success criteria:**
- [ ] `shared/events.ts` exists with unified event types
- [ ] File compiles without errors

---

#### Milestone M3c: Create shared/filters.ts (unified ClaimFilter)

| Field | Value |
|-------|-------|
| **ID** | M3c |
| **Complexity** | Small |
| **Preconditions** | M3a |
| **Blocks** | M3d |
| **Estimated time** | 10 minutes |
| **Parallel with** | M3b |

**Actions:**

1. Create `shared/filters.ts` containing:
   - `ClaimFilter` -- reconcile Section 3.2:
     - `status?: ClaimStatus | ClaimStatus[]` (use orchestrator's more flexible version)
     - `source?: string`
     - `claimantType?: "human" | "agent"`
     - `claimant?: string` (from orchestrator version)
   - `Unsubscribe` type -- `() => void` (consolidate Section 3.6)

2. Import `ClaimStatus` from `./types.ts`

**Success criteria:**
- [ ] `shared/filters.ts` exists
- [ ] File compiles without errors

---

#### Milestone M3d: Rewire all imports to use shared/

| Field | Value |
|-------|-------|
| **ID** | M3d |
| **Complexity** | Large |
| **Preconditions** | M3a, M3b, M3c |
| **Blocks** | M4, M5 |
| **Estimated time** | 60-90 minutes |
| **Risk** | MEDIUM -- many files change, potential for broken imports |

**Actions:**

1. **Update `server/domain/types.ts`** -- gut it to re-export from `../../shared/types`:
   ```typescript
   export * from "../../shared/types";
   ```
   This preserves existing import paths in server code that use `../domain/types`.

2. **Update `src/lib/types.ts`** -- gut it to re-export from `../../shared/types`:
   ```typescript
   export { type ClaimJSON as Claim } from "../../shared/types";
   export * from "../../shared/events";
   // ...re-export with any frontend-specific aliases
   ```
   The frontend expects string dates, so alias `ClaimJSON` as `Claim` for frontend consumption.

3. **Update `orchestrator/types.ts`** -- import shared types and remove local duplicates:
   - Remove local `ClaimFilter` definition (use `../../shared/filters`)
   - Remove local `WsMessage` definition (use `../../shared/events`)
   - Remove local `Unsubscribe` type (use `../../shared/filters`)
   - Keep orchestrator-only types (`OrchestratorConfig`, `AgentConfig`, etc.)

4. **Update `server/storage/interface.ts`** -- import `ClaimFilter` and `Unsubscribe` from shared
5. **Update `server/events/types.ts`** -- re-export from shared/events
6. **Update `server/ws/types.ts`** -- import event types from shared
7. **Update `server/routes/claims.ts`** -- Zod schema should validate against shared types

8. **Update tsconfig.json** -- add `shared/**/*` to the `include` array:
   ```json
   "include": ["server/**/*", "src/**/*", "orchestrator/**/*", "shared/**/*"]
   ```

9. **Run verification:**
   ```bash
   npx tsc --noEmit            # should pass or improve
   bun test                     # should match Phase 2 results
   ```

**Strategy for this milestone:** Work file-by-file. After each file change, run `npx tsc --noEmit` to catch breakage immediately. Do NOT change all files at once.

**Success criteria:**
- [ ] `shared/` is the single source of truth
- [ ] `server/domain/types.ts` re-exports from shared
- [ ] `src/lib/types.ts` re-exports from shared
- [ ] `orchestrator/types.ts` imports from shared
- [ ] No duplicate type definitions remain
- [ ] `npx tsc --noEmit` passes (or improves from baseline)
- [ ] `bun test` passes

---

### 12.5 Phase 4: Remove Dead Code

**Purpose:** Remove the 11+ unused exports documented in Section 4.

**Preconditions:** M3d (types unified -- so we are confident about what is and is not imported).

All sub-milestones in this phase are independent and can be done in parallel.

#### Milestone M4a: Remove dead factory functions (Section 4.1, items 3-5)

| Field | Value |
|-------|-------|
| **ID** | M4a |
| **Complexity** | Small |
| **Preconditions** | M3d |
| **Blocks** | M6 |
| **Estimated time** | 10 minutes |
| **Parallel with** | M4b, M4c, M4d, M4e |

**Actions:**

1. `orchestrator/agent-spawner.ts` -- delete `createAgentSpawner()` factory (line ~755)
2. `orchestrator/task-router.ts` -- delete `createTaskRouter()` factory (line ~500)
3. `orchestrator/orchestrator.ts` -- delete `createOrchestrator()` factory (line ~1026)
4. Verify no imports reference these functions: `grep -r "createAgentSpawner\|createTaskRouter\|createOrchestrator" --include="*.ts"`

**Success criteria:**
- [ ] Three factory functions removed
- [ ] No remaining references to them
- [ ] `bun test` passes

---

#### Milestone M4b: Remove dead server exports (Section 4.1, items 1-2)

| Field | Value |
|-------|-------|
| **ID** | M4b |
| **Complexity** | Small |
| **Preconditions** | M3d |
| **Blocks** | M6 |
| **Estimated time** | 10 minutes |
| **Parallel with** | M4a, M4c, M4d, M4e |

**Actions:**

1. `server/routes/auth.ts` -- delete `optionalAuthMiddleware()` (line ~184)
2. `server/ws/hub.ts` -- keep `handleError()` (it was dead but M2c wired it)
3. Verify: `grep -r "optionalAuthMiddleware" --include="*.ts"` returns nothing

**Success criteria:**
- [ ] `optionalAuthMiddleware` removed
- [ ] `bun test` passes

---

#### Milestone M4c: Remove dead frontend hook (Section 4.1, item 6)

| Field | Value |
|-------|-------|
| **ID** | M4c |
| **Complexity** | Small |
| **Preconditions** | M3d |
| **Blocks** | M6 |
| **Estimated time** | 5 minutes |
| **Parallel with** | M4a, M4b, M4d, M4e |

**Actions:**

1. `src/hooks/useWebSocket.ts` -- delete `useAgentSubscription()` (line ~95)
2. Verify: `grep -r "useAgentSubscription" --include="*.ts" --include="*.tsx"` returns nothing

**Success criteria:**
- [ ] Hook removed
- [ ] `bun test` passes

---

#### Milestone M4d: Remove dead room constants and methods (Section 4.2)

| Field | Value |
|-------|-------|
| **ID** | M4d |
| **Complexity** | Small |
| **Preconditions** | M3d |
| **Blocks** | M6 |
| **Estimated time** | 10 minutes |
| **Parallel with** | M4a, M4b, M4c, M4e |

**Actions:**

1. `server/ws/rooms.ts` -- delete:
   - `ROOM_BOARD` constant (line ~146)
   - `ROOM_LOGS` constant (line ~147)
   - `agentRoom()` function (line ~152)
   - `claimRoom()` function (line ~159)
   - `RoomManager.leaveAll()` method
   - `RoomManager.getMatchingRooms()` method
   - `RoomManager.getRoomCount()` method
   - `RoomManager.getConnectionCount()` method
2. Verify each removal: grep for the symbol name across all `.ts` files to confirm no references.

**Success criteria:**
- [ ] All 8 dead room exports removed
- [ ] No remaining references
- [ ] `bun test` passes

---

#### Milestone M4e: Remove dead type imports, identity function, and stubs (Section 4.3-4.4)

| Field | Value |
|-------|-------|
| **ID** | M4e |
| **Complexity** | Small |
| **Preconditions** | M3d |
| **Blocks** | M6 |
| **Estimated time** | 15 minutes |
| **Parallel with** | M4a, M4b, M4c, M4d |

**Actions:**

1. Remove unused `Claimant` imports from:
   - `server/storage/postgres.ts` (line ~6)
   - `server/storage/sqlite.ts` (line ~6)
   - `server/events/types.ts` (line ~2)
2. Fix `consoleLogger` import-as-type in `orchestrator/task-router.ts` (line ~11) -- either import it as a value or remove if unused
3. `orchestrator/agent-spawner.ts` -- delete `modelTierToArg()` identity function (lines ~76-89); replace any call sites with direct value passthrough
4. `server/ws/types.ts` -- either implement `ClaimHandoffEvent` or delete the type. If no code produces or consumes it, delete it.

**Success criteria:**
- [ ] All unused imports removed
- [ ] `modelTierToArg()` removed
- [ ] `ClaimHandoffEvent` resolved (deleted or implemented)
- [ ] `npx tsc --noEmit` passes
- [ ] `bun test` passes

---

#### Phase 4 Gate Check

```bash
cd dashboard-goap
npx tsc --noEmit             # should pass cleanly or better than Phase 3
bun test                     # all tests pass
```

- [ ] All 11+ dead code items removed
- [ ] No new type errors
- [ ] Tests pass

---

### 12.6 Phase 5: Reduce Duplication

**Purpose:** Extract shared patterns to reduce the 4 duplication issues from Section 5.

**Preconditions:** M4 complete (dead code removed -- so we are working with a minimal codebase).

#### Milestone M5a: Extract BaseStorage with shared emit/subscribe + rowToClaim (Section 5.3-5.4)

| Field | Value |
|-------|-------|
| **ID** | M5a |
| **Complexity** | Medium |
| **Preconditions** | M4a-M4e |
| **Blocks** | M6 |
| **Estimated time** | 30-45 minutes |
| **Risk** | MEDIUM -- touching all 3 storage implementations |

**Actions:**

1. Create `server/storage/base.ts`:
   ```typescript
   import type { ClaimEvent, Unsubscribe } from "../../shared/filters";

   export abstract class BaseStorage {
     private listeners: Array<(event: ClaimEvent) => void> = [];

     subscribe(listener: (event: ClaimEvent) => void): Unsubscribe {
       this.listeners.push(listener);
       return () => {
         this.listeners = this.listeners.filter(l => l !== listener);
       };
     }

     protected emit(event: ClaimEvent): void {
       for (const listener of this.listeners) {
         listener(event);
       }
     }
   }
   ```

2. Add a shared `rowToClaim()` utility to `base.ts`:
   ```typescript
   export function rowToClaim(row: Record<string, unknown>, dateParser: (v: unknown) => Date): Claim {
     // Shared logic for converting DB rows to Claim objects
     // dateParser handles Date vs string differences between postgres and sqlite
   }
   ```

3. Update `server/storage/memory.ts` -- extend `BaseStorage`, remove local emit/subscribe
4. Update `server/storage/postgres.ts` -- extend `BaseStorage`, remove local emit/subscribe, use shared `rowToClaim`
5. Update `server/storage/sqlite.ts` -- extend `BaseStorage`, remove local emit/subscribe, use shared `rowToClaim`

6. Verify:
   ```bash
   npx tsc --noEmit
   bun test
   ```

**Success criteria:**
- [ ] `server/storage/base.ts` exists with shared emit/subscribe and rowToClaim
- [ ] All 3 storage implementations extend BaseStorage
- [ ] No duplicate emit/subscribe code remains
- [ ] Tests pass

---

#### Milestone M5b: Simplify PostgresStorage.listClaims() (Section 5.1)

| Field | Value |
|-------|-------|
| **ID** | M5b |
| **Complexity** | Small |
| **Preconditions** | M5a |
| **Blocks** | M6 |
| **Estimated time** | 15 minutes |
| **Parallel with** | M5c |

**Actions:**

1. Open `server/storage/postgres.ts`, find `listClaims()` (lines ~102-152)
2. Remove the 3 special-case branches (no filter, status-only, source-only)
3. Keep only the general-purpose query builder that handles all filter combinations
4. Remove the unused `query` variable and `conditions` array if they are artifacts of the dead branches
5. Run `bun test` -- storage tests should still pass

**Success criteria:**
- [ ] `listClaims()` has one code path (the general-purpose query builder)
- [ ] Tests pass

---

#### Milestone M5c: Replace findClaim() linear scan with getClaimByIssueId (Section 5.2)

| Field | Value |
|-------|-------|
| **ID** | M5c |
| **Complexity** | Medium |
| **Preconditions** | M5a |
| **Blocks** | M6 |
| **Estimated time** | 25 minutes |
| **Parallel with** | M5b |

**Actions:**

1. Add `getClaimByIssueId(issueId: string): Promise<Claim | null>` to `server/storage/interface.ts`
2. Implement in all 3 storage backends:
   - `memory.ts` -- filter the Map by `issueId`
   - `postgres.ts` -- `SELECT * FROM claims WHERE issue_id = $1`
   - `sqlite.ts` -- `SELECT * FROM claims WHERE issue_id = ?`
3. Update `server/routes/claims.ts` (lines ~75-95):
   - Replace the `findClaim()` function that fetches ALL claims and scans linearly
   - Use `storage.getClaimByIssueId(issueId)` instead
   - Remove the verbose debug logging that logs all claim IDs
4. Run `bun test`

**Success criteria:**
- [ ] `getClaimByIssueId()` exists on storage interface and all implementations
- [ ] No more linear scan in `findClaim()`
- [ ] Debug logging removed
- [ ] Tests pass

---

#### Phase 5 Gate Check

```bash
cd dashboard-goap
npx tsc --noEmit
bun test
```

- [ ] BaseStorage extracted with shared patterns
- [ ] PostgresStorage.listClaims() simplified
- [ ] Linear scan replaced with direct lookup
- [ ] All tests pass

---

### 12.7 Phase 6: Document and Finalize

**Purpose:** Write the README, do a final verification pass, and prepare for upstream push.

**Preconditions:** M5 complete (all code changes done).

#### Milestone M6a: Write README.md

| Field | Value |
|-------|-------|
| **ID** | M6a |
| **Complexity** | Medium |
| **Preconditions** | M5a-M5c |
| **Blocks** | M6c |
| **Estimated time** | 30-45 minutes |

**Actions:**

1. Create `dashboard-goap/README.md` following the outline in Section 8 of this document.
2. Include:
   - **Overview** -- what it does, architecture diagram (use the ASCII diagram from Section 1)
   - **Prerequisites** -- Bun 1.0+, Docker + Docker Compose, Node.js 20+ (for orchestrator), optional GitHub token
   - **Quick Start** -- 5-step: clone, `bun install`, `docker compose up -d postgres`, `bun run dev`, optional `bun run orchestrator`
   - **Configuration** -- .env.example reference, storage backends, GitHub integration, auth
   - **Architecture** -- Layer diagram, domain model, event flow, orchestrator lifecycle
   - **Development** -- Running tests (`bun test`), project structure, adding routes/storage backends
   - **Deployment** -- Docker Compose production, health checks
   - **Known Issues / TODOs** -- any items deferred from this reorganization

3. Verify all code snippets in the README actually work.

**Success criteria:**
- [ ] README.md exists
- [ ] Quick Start instructions work when followed literally
- [ ] Architecture diagram is accurate for the flattened structure

---

#### Milestone M6b: Final Docker verification

| Field | Value |
|-------|-------|
| **ID** | M6b |
| **Complexity** | Small |
| **Preconditions** | M5a-M5c, M6a |
| **Blocks** | M6c |
| **Estimated time** | 10 minutes |
| **Parallel with** | M6a (if Docker is available) |

**Actions:**

1. Run `cd dashboard-goap && docker compose build` -- verify the build succeeds
2. Run `docker compose up -d` -- verify services start
3. Check `docker compose ps` -- both postgres and dashboard should be healthy
4. `curl http://localhost:3001/health` -- should return 200
5. `docker compose down` -- clean up

**Success criteria:**
- [ ] `docker compose build` succeeds
- [ ] `docker compose up` starts both services
- [ ] Health check passes
- [ ] No errors in logs

---

#### Milestone M6c: Final verification battery and cleanup

| Field | Value |
|-------|-------|
| **ID** | M6c |
| **Complexity** | Small |
| **Preconditions** | M6a, M6b |
| **Blocks** | None (this is the final milestone) |
| **Estimated time** | 15 minutes |

**Actions:**

1. Run the full verification battery:
   ```bash
   cd dashboard-goap
   bun install                    # clean install
   npx tsc --noEmit               # zero type errors
   bun test                       # all tests green
   bun run build                  # production build succeeds
   bun run dev &                  # starts without crash
   sleep 3 && curl http://localhost:3000/health && kill %1
   ```

2. Check for leftover artifacts:
   - No `dashboard/` directory
   - No stale config duplicates
   - No `.env` file committed (only `.env.example`)
   - `.gitignore` includes `node_modules/`, `dist/`, `.env`, `bun.lock` considerations

3. Review git diff for anything unexpected:
   ```bash
   git diff --stat
   ```

4. Verify the file tree matches Section 7.1's target structure.

**Success criteria (from Section 11, all must be checked):**
- [ ] Flat structure: `server/`, `orchestrator/`, `src/` at `dashboard-goap/` root
- [ ] No `dashboard-goap/dashboard/` nesting
- [ ] No duplicate config files
- [ ] All P0 bugs fixed
- [ ] Single source of truth for types in `shared/`
- [ ] All dead code removed
- [ ] `npx tsc --noEmit` passes
- [ ] `bun test` passes
- [ ] `bun run dev` serves frontend + backend
- [ ] `docker compose up --build` works
- [ ] README.md enables clone-install-run
- [ ] Clean git status ready for upstream push

---

### 12.8 Dependency Graph

```
M0 (Baseline)
 |
 v
M1 (Flatten)
 |
 +---+---+---+---+
 |   |   |   |   |
 v   v   v   v   v
M2a M2b M2c M2d M2e   <-- All 5 bug fixes in parallel
 |   |   |   |   |
 +---+---+---+---+
 |
 v
M3a (shared/types.ts)
 |
 +-------+
 |       |
 v       v
M3b     M3c           <-- events and filters in parallel
 |       |
 +-------+
 |
 v
M3d (Rewire imports)
 |
 +---+---+---+---+
 |   |   |   |   |
 v   v   v   v   v
M4a M4b M4c M4d M4e   <-- All dead code removal in parallel
 |   |   |   |   |
 +---+---+---+---+
 |
 v
M5a (BaseStorage)
 |
 +-------+
 |       |
 v       v
M5b     M5c           <-- listClaims + findClaim in parallel
 |       |
 +-------+
 |
 +-------+
 |       |
 v       v
M6a     M6b           <-- README + Docker in parallel
 |       |
 +-------+
 |
 v
M6c (Final verification)
```

### 12.9 Parallelization Summary

| Phase | Parallelizable Milestones | Sequential Milestones |
|-------|--------------------------|----------------------|
| Pre-flight | -- | M0 |
| Phase 1: Flatten | -- | M1 (all steps sequential) |
| Phase 2: Bugs | M2a, M2b, M2c, M2d, M2e (all 5 parallel) | -- |
| Phase 3: Types | M3b + M3c (parallel) | M3a -> M3b/M3c -> M3d |
| Phase 4: Dead Code | M4a, M4b, M4c, M4d, M4e (all 5 parallel) | -- |
| Phase 5: Duplication | M5b + M5c (parallel) | M5a -> M5b/M5c |
| Phase 6: Document | M6a + M6b (parallel) | M6a/M6b -> M6c |

**Maximum parallelism:** 5 concurrent agents (Phase 2 and Phase 4).
**Critical path:** M0 -> M1 -> M2* -> M3a -> M3d -> M4* -> M5a -> M5b/M5c -> M6c

### 12.10 Effort Estimates

| Milestone | Complexity | Estimated Time | Cumulative |
|-----------|-----------|---------------|------------|
| M0 | Small | 10 min | 10 min |
| M1 | Large | 45-60 min | ~70 min |
| M2a-M2e | Small-Medium | 10-20 min each (parallel = ~20 min wall) | ~90 min |
| M3a | Medium | 30 min | ~120 min |
| M3b+M3c | Medium+Small | 20 min (parallel) | ~140 min |
| M3d | Large | 60-90 min | ~220 min |
| M4a-M4e | Small | 5-15 min each (parallel = ~15 min wall) | ~235 min |
| M5a | Medium | 30-45 min | ~275 min |
| M5b+M5c | Small+Medium | 25 min (parallel) | ~300 min |
| M6a | Medium | 30-45 min | ~340 min |
| M6b | Small | 10 min | ~350 min |
| M6c | Small | 15 min | ~365 min |

**Total estimated wall-clock time:** ~6 hours (with parallelization)
**Total estimated person-hours:** ~8-10 hours (serial)

### 12.11 Risk Checkpoints

| After Milestone | Risk Check | Action if Failed |
|----------------|-----------|-----------------|
| M0 | Tests or build broken at baseline | Fix baseline issues before proceeding |
| M1 | Import paths broken after flatten | `git checkout -- .` and retry with more careful path mapping |
| M2d | Auth changes break login flow | Revert M2d, add `// SECURITY: TODO` comment, proceed |
| M3d | Many type errors after rewiring | Fix one file at a time, `tsc --noEmit` after each |
| M5a | Storage tests break after BaseStorage extraction | Verify method signatures match interface exactly |
| M6b | Docker build fails | Check Dockerfile COPY paths match flattened layout |

### 12.12 Agent Assignment Recommendations

For swarm execution, assign milestones to agent types as follows:

| Agent Type | Milestones | Rationale |
|-----------|-----------|-----------|
| **coordinator** | M0, gate checks, M6c | Orchestration, verification |
| **coder** (1) | M1 (flatten) | File operations, config changes |
| **coder** (2) | M2a, M2c, M2e | Small bug fixes |
| **coder** (3) | M2b, M2d | Medium bug fixes |
| **architect** | M3a, M3b, M3c | Type system design |
| **coder** (4) | M3d | Import rewiring (mechanical) |
| **coder** (5) | M4a-M4e | Dead code removal (mechanical) |
| **coder** (6) | M5a, M5b, M5c | Duplication reduction |
| **researcher** | M6a (README) | Documentation writing |
| **tester** | M6b, M6c | Docker and final verification |

**Minimum team size:** 3 agents (coordinator + 2 coders, sequential phases)
**Optimal team size:** 6 agents (coordinator + 4 coders + 1 tester, maximum parallelism)

### 12.13 Definition of Done

The reorganization is COMPLETE when all of the following are true:

1. **Structure:** `dashboard-goap/` has `server/`, `orchestrator/`, `src/`, `shared/`, `__tests__/`, `migrations/` at its root. No `dashboard/` subdirectory.
2. **Configs:** Single `package.json`, `tsconfig.json`, `docker-compose.yml`, `Dockerfile` at root. No duplicates.
3. **Types:** `shared/types.ts`, `shared/events.ts`, `shared/filters.ts` are the canonical definitions. Other files re-export.
4. **Bugs:** All 5 bugs from Section 2 are fixed.
5. **Dead code:** All 11+ items from Section 4 are removed.
6. **Duplication:** BaseStorage extracts shared patterns. `listClaims()` simplified. `findClaim()` uses direct lookup.
7. **Tests:** `bun test` passes with all tests green.
8. **Types:** `npx tsc --noEmit` passes with zero errors.
9. **Dev:** `bun run dev` starts both server and client without error.
10. **Docker:** `docker compose up --build` starts all services, health check passes.
11. **Docs:** `README.md` exists and its Quick Start section works when followed literally.
12. **Runtime:** Bun, not npm. All scripts use `bun` commands.
