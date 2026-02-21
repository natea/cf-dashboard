# Dashboard-GOAP Architecture Analysis & Reorganization Plan

**Date:** 2026-02-21
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

### Codebase Stats

| Layer | Files | ~LOC |
|-------|-------|------|
| Server | 20 | 1,200 |
| Orchestrator | 7 | 780 |
| Frontend | 22 | 1,000 |
| Config/Docker | 6 | 200 |
| **Total** | **~55** | **~3,200** |

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

### 6.1 Confusing Nesting

Current structure has `dashboard-goap/dashboard/` which nests the actual app one level too deep. The root `dashboard-goap/` also has its own `docker-compose.yml`, `Dockerfile`, `tsconfig.json`, and `package.json` that overlap with `dashboard-goap/dashboard/`'s versions.

### 6.2 Old `dashboard/` in Git

The root-level `dashboard/` directory (the pre-GOAP version) shows as dozens of deleted files in `git status`. These need to be committed as removed.

### 6.3 No README

No setup instructions, architecture overview, or contribution guide exists.

### 6.4 No Shared Types

Server and client independently define the same domain types, leading to the divergence documented in Section 3.

---

## 7. Proposed Reorganization

### 7.1 Target Structure

Flatten the nesting and create a shared types layer:

```
dashboard-goap/
|-- README.md                     # NEW: Setup + architecture + contributing
|-- package.json                  # KEEP (root workspace)
|-- tsconfig.json                 # KEEP (root config)
|-- docker-compose.yml            # KEEP (root orchestration)
|-- Dockerfile                    # KEEP (production build)
|-- .env.example                  # MOVE from dashboard/
|-- migrations/                   # KEEP as-is
|   +-- 001_create_claims.sql
|-- shared/                       # NEW: Single source of truth
|   |-- types.ts                  # Unified Claim, ClaimStatus, AgentType, etc.
|   |-- events.ts                 # Unified event types (ClaimEvent, WsMessage)
|   +-- filters.ts               # Unified ClaimFilter
|-- server/                       # MOVE from dashboard/server/
|   |-- index.ts                  # App entry
|   |-- config.ts                 # Server config
|   |-- domain/
|   |   +-- types.ts              # REMOVE (replaced by shared/types.ts)
|   |-- routes/
|   |   |-- claims.ts
|   |   |-- health.ts
|   |   |-- hooks.ts              # FIX operator precedence bug
|   |   +-- auth.ts               # REMOVE optionalAuthMiddleware dead export
|   |-- storage/
|   |   |-- interface.ts          # SIMPLIFY (import from shared/)
|   |   |-- base.ts               # NEW: shared emit/subscribe + rowToClaim
|   |   |-- memory.ts
|   |   |-- postgres.ts           # SIMPLIFY listClaims(), remove ClaimRow dupe
|   |   |-- sqlite.ts             # SIMPLIFY, remove ClaimRow dupe
|   |   +-- index.ts
|   |-- events/
|   |   |-- aggregator.ts         # WIRE to storage in server/index.ts
|   |   +-- types.ts              # REMOVE (replaced by shared/events.ts)
|   |-- ws/
|   |   |-- hub.ts                # WIRE error handler
|   |   |-- rooms.ts              # REMOVE unused exports
|   |   +-- types.ts              # SIMPLIFY (import from shared/)
|   +-- github/
|       |-- sync.ts
|       +-- types.ts
|-- orchestrator/                 # MOVE from dashboard/orchestrator/
|   |-- index.ts
|   |-- orchestrator.ts           # REMOVE createOrchestrator() dead export
|   |-- agent-spawner.ts          # REMOVE createAgentSpawner(), modelTierToArg()
|   |-- task-router.ts            # REMOVE createTaskRouter(), fix consoleLogger import
|   |-- config.ts
|   |-- dashboard-client.ts
|   +-- types.ts                  # SIMPLIFY (import from shared/)
|-- src/                          # MOVE from dashboard/src/
|   |-- App.tsx
|   |-- main.tsx
|   |-- index.css
|   |-- components/
|   |   |-- Board/
|   |   |   |-- Board.tsx
|   |   |   |-- Column.tsx
|   |   |   |-- ClaimCard.tsx
|   |   |   +-- index.ts
|   |   |-- Activity/
|   |   |   |-- ActivityPanel.tsx
|   |   |   |-- LogStream.tsx
|   |   |   +-- AgentStatus.tsx
|   |   |-- Auth/
|   |   |   +-- LoginForm.tsx
|   |   +-- shared/
|   |       |-- Header.tsx
|   |       |-- Badge.tsx
|   |       |-- Avatar.tsx
|   |       |-- Progress.tsx
|   |       +-- ThemeToggle.tsx
|   |-- hooks/
|   |   |-- useAuth.ts
|   |   |-- useWebSocket.ts       # REMOVE useAgentSubscription dead export
|   |   +-- useClaims.ts
|   |-- stores/
|   |   |-- claims.ts
|   |   |-- activity.ts
|   |   |-- auth.ts
|   |   +-- theme.ts
|   +-- lib/
|       |-- api.ts
|       |-- ws.ts
|       +-- types.ts              # REMOVE (replaced by shared/types.ts)
|-- __tests__/                    # MOVE from dashboard/__tests__/
|   |-- stores.test.ts
|   +-- storage.test.ts
|-- vite.config.ts                # MOVE from dashboard/
|-- tailwind.config.ts            # MOVE from dashboard/
+-- postcss.config.js             # MOVE from dashboard/
```

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

### Phase 1: Fix Bugs (P0)
1. Fix operator precedence in `hooks.ts`
2. Wire `aggregator.connectStorage()` in `server/index.ts`
3. Wire WebSocket `error` handler in `server/index.ts`

### Phase 2: Unify Types (P1)
4. Create `shared/types.ts` with canonical type definitions
5. Create `shared/events.ts` with unified event types
6. Create `shared/filters.ts` with unified ClaimFilter
7. Update all imports across server, orchestrator, and frontend

### Phase 3: Flatten Structure (P1)
8. Move `dashboard/server/` -> `server/`
9. Move `dashboard/orchestrator/` -> `orchestrator/`
10. Move `dashboard/src/` -> `src/`
11. Move `dashboard/__tests__/` -> `__tests__/`
12. Move config files (`vite.config.ts`, `tailwind.config.ts`, etc.) to root
13. Deduplicate `docker-compose.yml`, `Dockerfile`, `tsconfig.json`, `package.json`
14. Update all import paths

### Phase 4: Remove Dead Code (P1)
15. Remove unused factory functions (`createAgentSpawner`, `createTaskRouter`, `createOrchestrator`)
16. Remove unused exports (`optionalAuthMiddleware`, `useAgentSubscription`, room constants)
17. Remove unused type imports
18. Remove `modelTierToArg()` identity function
19. Remove `ClaimHandoffEvent` stub (or implement it)

### Phase 5: Reduce Duplication (P2)
20. Extract `BaseStorage` with shared emit/subscribe pattern
21. Extract shared `rowToClaim()` utility
22. Simplify `listClaims()` in PostgresStorage
23. Replace `findClaim()` linear scan with `getClaimByIssueId()`

### Phase 6: Document (P1)
24. Write `README.md` per outline in Section 8
25. Clean git state (commit old `dashboard/` removal)

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

- [ ] All P0 bugs fixed
- [ ] Single source of truth for all shared types
- [ ] No `dashboard/dashboard/` nesting
- [ ] No duplicate config files at different levels
- [ ] All dead code removed
- [ ] Full test suite passes
- [ ] `docker compose up` works from project root
- [ ] `bun run dev` serves frontend
- [ ] README enables a new developer to set up and run the project
- [ ] Clean git status (no old `dashboard/` artifacts)
