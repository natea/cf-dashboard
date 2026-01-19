# Claims Dashboard Implementation Plan (GOAP Method)

**Date**: 2026-01-19
**Methodology**: Goal-Oriented Action Planning (GOAP)
**Status**: Implementation Ready

---

## Executive Summary

This document applies Goal-Oriented Action Planning (GOAP) methodology to the Claims Dashboard implementation. GOAP works backwards from the goal state, decomposing the objective into atomic actions with explicit preconditions and effects. The planner then finds the optimal action sequence that transforms the initial world state into the goal state.

---

## 1. World State Definition

### 1.1 Initial State (Current)

```typescript
const INITIAL_STATE: WorldState = {
  // Infrastructure
  hasProjectStructure: false,
  hasDockerCompose: false,
  hasPostgresRunning: false,
  hasClaimsTable: false,
  hasNotifyTrigger: false,

  // Backend
  hasBunServer: false,
  hasHonoRoutes: false,
  hasStorageAdapter: false,
  hasPostgresBackend: false,
  hasSqliteBackend: false,
  hasWebSocketHub: false,
  hasEventAggregator: false,
  hasHookReceiver: false,

  // Frontend
  hasViteReactApp: false,
  hasZustandStores: false,
  hasWebSocketHook: false,
  hasBoardComponent: false,
  hasDragDrop: false,
  hasActivityPanel: false,
  hasAuthFlow: false,

  // Integration
  hasClaimsApi: true,  // Existing MCP tools
  hasGitHubSync: false,
  hasMcpHookReceiver: false,

  // Quality
  testCoverage: 0,
  hasE2eTests: false,
  hasErrorHandling: false,
  isResponsive: false,
  hasDarkMode: false,

  // Deployment
  isDeployable: false,
  hasHealthChecks: false,
  hasMigrations: false,
};
```

### 1.2 Goal State (Target)

```typescript
const GOAL_STATE: WorldState = {
  // Infrastructure
  hasProjectStructure: true,
  hasDockerCompose: true,
  hasPostgresRunning: true,
  hasClaimsTable: true,
  hasNotifyTrigger: true,

  // Backend
  hasBunServer: true,
  hasHonoRoutes: true,
  hasStorageAdapter: true,
  hasPostgresBackend: true,
  hasSqliteBackend: true,
  hasWebSocketHub: true,
  hasEventAggregator: true,
  hasHookReceiver: true,

  // Frontend
  hasViteReactApp: true,
  hasZustandStores: true,
  hasWebSocketHook: true,
  hasBoardComponent: true,
  hasDragDrop: true,
  hasActivityPanel: true,
  hasAuthFlow: true,

  // Integration
  hasClaimsApi: true,
  hasGitHubSync: true,
  hasMcpHookReceiver: true,

  // Quality
  testCoverage: 80,
  hasE2eTests: true,
  hasErrorHandling: true,
  isResponsive: true,
  hasDarkMode: true,

  // Deployment
  isDeployable: true,
  hasHealthChecks: true,
  hasMigrations: true,
};
```

---

## 2. Action Library

Each action defines what must be true before it can execute (preconditions), what becomes true after (effects), and the estimated cost.

### 2.1 Infrastructure Actions

```yaml
action: CREATE_PROJECT_STRUCTURE
  preconditions: []
  effects:
    - hasProjectStructure: true
  cost: 1
  deliverables:
    - dashboard/
    - dashboard/package.json
    - dashboard/bunfig.toml
    - dashboard/tsconfig.json
    - dashboard/server/
    - dashboard/src/
    - dashboard/migrations/
  verification: "ls -la dashboard/ && cat dashboard/package.json"

action: CREATE_DOCKER_COMPOSE
  preconditions:
    - hasProjectStructure: true
  effects:
    - hasDockerCompose: true
  cost: 1
  deliverables:
    - dashboard/docker-compose.yml
    - dashboard/Dockerfile
    - dashboard/.env.example
  verification: "docker-compose config"

action: START_POSTGRES
  preconditions:
    - hasDockerCompose: true
  effects:
    - hasPostgresRunning: true
  cost: 1
  verification: "docker-compose ps | grep postgres"

action: CREATE_CLAIMS_SCHEMA
  preconditions:
    - hasPostgresRunning: true
    - hasProjectStructure: true
  effects:
    - hasClaimsTable: true
    - hasMigrations: true
  cost: 2
  deliverables:
    - dashboard/migrations/001_claims_table.sql
    - dashboard/migrations/002_claim_events.sql
  verification: "psql -c '\\d claims'"

action: CREATE_NOTIFY_TRIGGER
  preconditions:
    - hasClaimsTable: true
  effects:
    - hasNotifyTrigger: true
  cost: 1
  deliverables:
    - Trigger function in 001_claims_table.sql
  verification: "psql -c \"SELECT * FROM pg_trigger WHERE tgname='claims_notify'\""
```

### 2.2 Backend Actions

```yaml
action: CREATE_BUN_SERVER
  preconditions:
    - hasProjectStructure: true
  effects:
    - hasBunServer: true
  cost: 2
  deliverables:
    - dashboard/server/index.ts
    - dashboard/server/config.ts
  verification: "bun run server/index.ts --dry-run"

action: CREATE_HONO_ROUTES
  preconditions:
    - hasBunServer: true
  effects:
    - hasHonoRoutes: true
  cost: 3
  deliverables:
    - dashboard/server/routes/claims.ts
    - dashboard/server/routes/auth.ts
    - dashboard/server/routes/health.ts
  verification: "curl http://localhost:3000/health"

action: CREATE_STORAGE_ADAPTER
  preconditions:
    - hasBunServer: true
  effects:
    - hasStorageAdapter: true
  cost: 2
  deliverables:
    - dashboard/server/storage/interface.ts
    - dashboard/server/storage/types.ts
  verification: "tsc --noEmit server/storage/interface.ts"

action: IMPLEMENT_POSTGRES_BACKEND
  preconditions:
    - hasStorageAdapter: true
    - hasClaimsTable: true
  effects:
    - hasPostgresBackend: true
  cost: 3
  deliverables:
    - dashboard/server/storage/postgres.ts
  verification: "Integration test with Postgres"

action: IMPLEMENT_SQLITE_BACKEND
  preconditions:
    - hasStorageAdapter: true
  effects:
    - hasSqliteBackend: true
  cost: 2
  deliverables:
    - dashboard/server/storage/sqlite.ts
  verification: "Integration test with SQLite"

action: CREATE_WEBSOCKET_HUB
  preconditions:
    - hasBunServer: true
  effects:
    - hasWebSocketHub: true
  cost: 3
  deliverables:
    - dashboard/server/ws/hub.ts
    - dashboard/server/ws/rooms.ts
    - dashboard/server/ws/types.ts
  verification: "WebSocket connection test"

action: CREATE_EVENT_AGGREGATOR
  preconditions:
    - hasWebSocketHub: true
    - hasPostgresBackend: true
    - hasNotifyTrigger: true
  effects:
    - hasEventAggregator: true
  cost: 3
  deliverables:
    - dashboard/server/events/aggregator.ts
    - dashboard/server/events/types.ts
  verification: "Insert claim, verify WS broadcast"

action: CREATE_HOOK_RECEIVER
  preconditions:
    - hasHonoRoutes: true
    - hasEventAggregator: true
  effects:
    - hasHookReceiver: true
    - hasMcpHookReceiver: true
  cost: 2
  deliverables:
    - dashboard/server/routes/hooks.ts
  verification: "POST /hooks/event with test payload"
```

### 2.3 Frontend Actions

```yaml
action: CREATE_VITE_REACT_APP
  preconditions:
    - hasProjectStructure: true
  effects:
    - hasViteReactApp: true
  cost: 2
  deliverables:
    - dashboard/vite.config.ts
    - dashboard/index.html
    - dashboard/src/main.tsx
    - dashboard/src/App.tsx
    - dashboard/tailwind.config.ts
    - dashboard/postcss.config.js
  verification: "bun run dev & curl localhost:5173"

action: CREATE_ZUSTAND_STORES
  preconditions:
    - hasViteReactApp: true
  effects:
    - hasZustandStores: true
  cost: 2
  deliverables:
    - dashboard/src/stores/claims.ts
    - dashboard/src/stores/activity.ts
    - dashboard/src/stores/auth.ts
  verification: "Unit tests for store actions"

action: CREATE_WEBSOCKET_HOOK
  preconditions:
    - hasViteReactApp: true
    - hasZustandStores: true
  effects:
    - hasWebSocketHook: true
  cost: 2
  deliverables:
    - dashboard/src/hooks/useWebSocket.ts
    - dashboard/src/lib/ws.ts
  verification: "Connect to server, receive snapshot"

action: CREATE_BOARD_COMPONENT
  preconditions:
    - hasZustandStores: true
    - hasWebSocketHook: true
  effects:
    - hasBoardComponent: true
  cost: 3
  deliverables:
    - dashboard/src/components/Board/Board.tsx
    - dashboard/src/components/Board/Column.tsx
    - dashboard/src/components/Board/ClaimCard.tsx
  verification: "Visual inspection, 5 columns render"

action: IMPLEMENT_DRAG_DROP
  preconditions:
    - hasBoardComponent: true
  effects:
    - hasDragDrop: true
  cost: 3
  deliverables:
    - DragDropContext in Board.tsx
    - Droppable columns
    - Draggable cards
  verification: "Drag card between columns, API called"

action: CREATE_ACTIVITY_PANEL
  preconditions:
    - hasZustandStores: true
    - hasWebSocketHook: true
  effects:
    - hasActivityPanel: true
  cost: 2
  deliverables:
    - dashboard/src/components/Activity/ActivityPanel.tsx
    - dashboard/src/components/Activity/AgentStatus.tsx
    - dashboard/src/components/Activity/LogStream.tsx
  verification: "Agent logs display in sidebar"

action: IMPLEMENT_AUTH_FLOW
  preconditions:
    - hasViteReactApp: true
    - hasHonoRoutes: true
  effects:
    - hasAuthFlow: true
  cost: 2
  deliverables:
    - dashboard/src/components/Auth/LoginForm.tsx
    - dashboard/src/hooks/useAuth.ts
    - Auth middleware in server
  verification: "Login, receive token, access board"
```

### 2.4 Integration Actions

```yaml
action: IMPLEMENT_GITHUB_SYNC
  preconditions:
    - hasStorageAdapter: true
    - hasPostgresBackend: true
  effects:
    - hasGitHubSync: true
  cost: 3
  deliverables:
    - dashboard/server/github/sync.ts
    - dashboard/server/github/types.ts
  verification: "Sync issues from test repo"
```

### 2.5 Quality Actions

```yaml
action: ADD_UNIT_TESTS
  preconditions:
    - hasStorageAdapter: true
    - hasZustandStores: true
  effects:
    - testCoverage: 50
  cost: 3
  deliverables:
    - dashboard/__tests__/storage.test.ts
    - dashboard/__tests__/stores.test.ts
  verification: "bun test --coverage"

action: ADD_INTEGRATION_TESTS
  preconditions:
    - testCoverage >= 50
    - hasPostgresBackend: true
  effects:
    - testCoverage: 70
  cost: 3
  deliverables:
    - dashboard/__tests__/api.test.ts
    - dashboard/__tests__/websocket.test.ts
  verification: "bun test --coverage"

action: ADD_E2E_TESTS
  preconditions:
    - testCoverage >= 70
    - hasDragDrop: true
  effects:
    - hasE2eTests: true
    - testCoverage: 80
  cost: 4
  deliverables:
    - dashboard/e2e/board.spec.ts
    - dashboard/playwright.config.ts
  verification: "bun run test:e2e"

action: ADD_ERROR_HANDLING
  preconditions:
    - hasHonoRoutes: true
    - hasZustandStores: true
  effects:
    - hasErrorHandling: true
  cost: 2
  deliverables:
    - Error middleware
    - Toast notifications
    - Retry logic
  verification: "Trigger errors, verify recovery"

action: MAKE_RESPONSIVE
  preconditions:
    - hasBoardComponent: true
    - hasActivityPanel: true
  effects:
    - isResponsive: true
  cost: 2
  deliverables:
    - Mobile breakpoints
    - Collapsible sidebar
  verification: "Chrome DevTools mobile view"

action: ADD_DARK_MODE
  preconditions:
    - hasViteReactApp: true
  effects:
    - hasDarkMode: true
  cost: 1
  deliverables:
    - Theme toggle
    - Dark color scheme
  verification: "Toggle dark mode, verify colors"
```

### 2.6 Deployment Actions

```yaml
action: ADD_HEALTH_CHECKS
  preconditions:
    - hasBunServer: true
    - hasPostgresBackend: true
  effects:
    - hasHealthChecks: true
  cost: 1
  deliverables:
    - /health endpoint
    - Docker HEALTHCHECK
  verification: "curl /health returns 200"

action: FINALIZE_DEPLOYMENT
  preconditions:
    - hasDockerCompose: true
    - hasMigrations: true
    - hasHealthChecks: true
    - hasErrorHandling: true
  effects:
    - isDeployable: true
  cost: 2
  deliverables:
    - Production Dockerfile
    - Environment documentation
    - Start scripts
  verification: "docker-compose up --build"
```

---

## 3. GOAP Planning: Optimal Path

The GOAP planner uses A* search to find the lowest-cost action sequence from initial state to goal state. Here is the computed optimal path:

### 3.1 Milestone 1: Foundation (Cost: 8)

**Goal**: Establish project structure with running database

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 1 | CREATE_PROJECT_STRUCTURE | (none) | hasProjectStructure |
| 2 | CREATE_DOCKER_COMPOSE | hasProjectStructure | hasDockerCompose |
| 3 | START_POSTGRES | hasDockerCompose | hasPostgresRunning |
| 4 | CREATE_CLAIMS_SCHEMA | hasPostgresRunning, hasProjectStructure | hasClaimsTable, hasMigrations |
| 5 | CREATE_NOTIFY_TRIGGER | hasClaimsTable | hasNotifyTrigger |

**Success Criteria**:
- [ ] `docker-compose up -d` starts Postgres successfully
- [ ] Claims table exists with all required columns
- [ ] NOTIFY trigger fires on INSERT/UPDATE/DELETE
- [ ] Migrations can be run idempotently

**Verification Script**:
```bash
#!/bin/bash
cd dashboard
docker-compose up -d ruvector-postgres
sleep 5
bun run db:migrate
psql $DATABASE_URL -c "INSERT INTO claims (issue_id, title) VALUES ('test-1', 'Test');"
# Should see NOTIFY in pg logs
```

---

### 3.2 Milestone 2: Backend Core (Cost: 13)

**Goal**: Working REST API with storage adapters

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 6 | CREATE_BUN_SERVER | hasProjectStructure | hasBunServer |
| 7 | CREATE_HONO_ROUTES | hasBunServer | hasHonoRoutes |
| 8 | CREATE_STORAGE_ADAPTER | hasBunServer | hasStorageAdapter |
| 9 | IMPLEMENT_POSTGRES_BACKEND | hasStorageAdapter, hasClaimsTable | hasPostgresBackend |
| 10 | IMPLEMENT_SQLITE_BACKEND | hasStorageAdapter | hasSqliteBackend |

**Success Criteria**:
- [ ] Server starts on port 3000
- [ ] GET /api/claims returns empty array
- [ ] POST /api/claims creates a claim
- [ ] PUT /api/claims/:id updates status
- [ ] Both Postgres and SQLite backends work

**Verification Script**:
```bash
#!/bin/bash
cd dashboard
bun run server/index.ts &
sleep 2
# Test CRUD
curl -X POST http://localhost:3000/api/claims \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Claim", "description": "Testing"}'
curl http://localhost:3000/api/claims
```

---

### 3.3 Milestone 3: Real-time Backend (Cost: 8)

**Goal**: WebSocket hub with event aggregation

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 11 | CREATE_WEBSOCKET_HUB | hasBunServer | hasWebSocketHub |
| 12 | CREATE_EVENT_AGGREGATOR | hasWebSocketHub, hasPostgresBackend, hasNotifyTrigger | hasEventAggregator |
| 13 | CREATE_HOOK_RECEIVER | hasHonoRoutes, hasEventAggregator | hasHookReceiver, hasMcpHookReceiver |

**Success Criteria**:
- [ ] WebSocket connection established at ws://localhost:3000/ws
- [ ] Client receives snapshot on connect
- [ ] Database changes broadcast to all clients
- [ ] POST /hooks/event triggers WS broadcast
- [ ] Room-based subscriptions work (board, logs, agent/*)

**Verification Script**:
```bash
#!/bin/bash
cd dashboard
# Start server
bun run dev &
sleep 2
# Connect WebSocket and listen
wscat -c ws://localhost:3000/ws &
# Insert claim in another terminal
psql $DATABASE_URL -c "INSERT INTO claims (issue_id, title, status) VALUES ('ws-test', 'WS Test', 'backlog');"
# Should see event in wscat output
```

---

### 3.4 Milestone 4: Frontend Foundation (Cost: 11)

**Goal**: React app with state management and WebSocket

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 14 | CREATE_VITE_REACT_APP | hasProjectStructure | hasViteReactApp |
| 15 | CREATE_ZUSTAND_STORES | hasViteReactApp | hasZustandStores |
| 16 | CREATE_WEBSOCKET_HOOK | hasViteReactApp, hasZustandStores | hasWebSocketHook |
| 17 | IMPLEMENT_AUTH_FLOW | hasViteReactApp, hasHonoRoutes | hasAuthFlow |
| 18 | CREATE_BOARD_COMPONENT | hasZustandStores, hasWebSocketHook | hasBoardComponent |

**Success Criteria**:
- [ ] `bun run dev` starts Vite on port 5173
- [ ] Login form appears on first visit
- [ ] After login, 5-column board renders
- [ ] Claims appear in correct columns
- [ ] Real-time updates work (no page refresh needed)

**Verification Script**:
```bash
#!/bin/bash
cd dashboard
bun run dev &
sleep 3
# Open browser
open http://localhost:5173
# Login with test credentials
# Insert claim via API
curl -X POST http://localhost:3000/api/claims \
  -H "Content-Type: application/json" \
  -d '{"title": "Frontend Test"}'
# Should appear in Backlog column
```

---

### 3.5 Milestone 5: Interactive Board (Cost: 8)

**Goal**: Drag-drop functionality with activity panel

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 19 | IMPLEMENT_DRAG_DROP | hasBoardComponent | hasDragDrop |
| 20 | CREATE_ACTIVITY_PANEL | hasZustandStores, hasWebSocketHook | hasActivityPanel |
| 21 | ADD_ERROR_HANDLING | hasHonoRoutes, hasZustandStores | hasErrorHandling |

**Success Criteria**:
- [ ] Cards can be dragged between columns
- [ ] Optimistic update shows immediately
- [ ] API failure rolls back UI change
- [ ] Activity panel shows agent logs
- [ ] Toast notifications for errors

**Verification Script**:
```bash
# Manual testing required
# 1. Create claim in Backlog
# 2. Drag to Agent Working
# 3. Verify API call in Network tab
# 4. Check activity panel for events
# 5. Disconnect server, try drag, verify rollback
```

---

### 3.6 Milestone 6: Integrations (Cost: 3)

**Goal**: GitHub sync and MCP integration

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 22 | IMPLEMENT_GITHUB_SYNC | hasStorageAdapter, hasPostgresBackend | hasGitHubSync |

**Success Criteria**:
- [ ] GitHub issues sync to Backlog on startup
- [ ] Sync runs every 60 seconds
- [ ] Issues have `source: 'github'` badge
- [ ] Duplicate issues not created on re-sync
- [ ] Label filtering works

**Verification Script**:
```bash
#!/bin/bash
cd dashboard
# Configure GitHub
export GITHUB_OWNER=ruvnet
export GITHUB_REPO=claude-flow
export GITHUB_LABELS=ready
# Start server
bun run dev &
sleep 5
# Check claims
curl http://localhost:3000/api/claims | jq '.[] | select(.source=="github")'
```

---

### 3.7 Milestone 7: Production Ready (Cost: 13)

**Goal**: Tests, polish, and deployment

| # | Action | Preconditions Met | Effects |
|---|--------|-------------------|---------|
| 23 | ADD_UNIT_TESTS | hasStorageAdapter, hasZustandStores | testCoverage: 50 |
| 24 | ADD_INTEGRATION_TESTS | testCoverage >= 50, hasPostgresBackend | testCoverage: 70 |
| 25 | ADD_E2E_TESTS | testCoverage >= 70, hasDragDrop | hasE2eTests, testCoverage: 80 |
| 26 | MAKE_RESPONSIVE | hasBoardComponent, hasActivityPanel | isResponsive |
| 27 | ADD_DARK_MODE | hasViteReactApp | hasDarkMode |
| 28 | ADD_HEALTH_CHECKS | hasBunServer, hasPostgresBackend | hasHealthChecks |
| 29 | FINALIZE_DEPLOYMENT | hasDockerCompose, hasMigrations, hasHealthChecks, hasErrorHandling | isDeployable |

**Success Criteria**:
- [ ] `bun test` passes with 80%+ coverage
- [ ] `bun run test:e2e` passes all scenarios
- [ ] Board works on mobile (320px width)
- [ ] Dark mode toggle works
- [ ] `docker-compose up` brings up full stack
- [ ] /health returns 200 when healthy

**Verification Script**:
```bash
#!/bin/bash
cd dashboard
# Run all tests
bun test --coverage
bun run test:e2e
# Build and deploy
docker-compose build
docker-compose up -d
sleep 10
# Health check
curl http://localhost:3000/health
# Browser test
open http://localhost:3000
```

---

## 4. Complete Action Sequence

```
GOAP Optimal Path (29 actions, estimated cost: 64)

1.  CREATE_PROJECT_STRUCTURE     [M1] cost=1
2.  CREATE_DOCKER_COMPOSE        [M1] cost=1
3.  START_POSTGRES               [M1] cost=1
4.  CREATE_CLAIMS_SCHEMA         [M1] cost=2
5.  CREATE_NOTIFY_TRIGGER        [M1] cost=1
                                 --- Milestone 1 Complete ---
6.  CREATE_BUN_SERVER            [M2] cost=2
7.  CREATE_HONO_ROUTES           [M2] cost=3
8.  CREATE_STORAGE_ADAPTER       [M2] cost=2
9.  IMPLEMENT_POSTGRES_BACKEND   [M2] cost=3
10. IMPLEMENT_SQLITE_BACKEND     [M2] cost=2
                                 --- Milestone 2 Complete ---
11. CREATE_WEBSOCKET_HUB         [M3] cost=3
12. CREATE_EVENT_AGGREGATOR      [M3] cost=3
13. CREATE_HOOK_RECEIVER         [M3] cost=2
                                 --- Milestone 3 Complete ---
14. CREATE_VITE_REACT_APP        [M4] cost=2
15. CREATE_ZUSTAND_STORES        [M4] cost=2
16. CREATE_WEBSOCKET_HOOK        [M4] cost=2
17. IMPLEMENT_AUTH_FLOW          [M4] cost=2
18. CREATE_BOARD_COMPONENT       [M4] cost=3
                                 --- Milestone 4 Complete ---
19. IMPLEMENT_DRAG_DROP          [M5] cost=3
20. CREATE_ACTIVITY_PANEL        [M5] cost=2
21. ADD_ERROR_HANDLING           [M5] cost=2
                                 --- Milestone 5 Complete ---
22. IMPLEMENT_GITHUB_SYNC        [M6] cost=3
                                 --- Milestone 6 Complete ---
23. ADD_UNIT_TESTS               [M7] cost=3
24. ADD_INTEGRATION_TESTS        [M7] cost=3
25. ADD_E2E_TESTS                [M7] cost=4
26. MAKE_RESPONSIVE              [M7] cost=2
27. ADD_DARK_MODE                [M7] cost=1
28. ADD_HEALTH_CHECKS            [M7] cost=1
29. FINALIZE_DEPLOYMENT          [M7] cost=2
                                 --- Milestone 7 Complete ---
                                 === GOAL STATE ACHIEVED ===
```

---

## 5. Dependency Graph

```
                    CREATE_PROJECT_STRUCTURE
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      CREATE_DOCKER_COMPOSE  CREATE_BUN_SERVER  CREATE_VITE_REACT_APP
              │               │               │
              ▼               │               ▼
        START_POSTGRES        │       CREATE_ZUSTAND_STORES
              │               │               │
              ▼               │               ▼
      CREATE_CLAIMS_SCHEMA    │       CREATE_WEBSOCKET_HOOK
              │               │               │
              ▼               │               ├──────┐
      CREATE_NOTIFY_TRIGGER   │               │      │
              │               │               │      │
              │               ▼               ▼      ▼
              │      ┌─ CREATE_HONO_ROUTES ── CREATE_BOARD_COMPONENT
              │      │        │               │
              │      │        ▼               ▼
              │      │ IMPLEMENT_AUTH_FLOW   IMPLEMENT_DRAG_DROP
              │      │        │               │
              │      ▼        │               │
              │ CREATE_STORAGE_ADAPTER        │
              │      │                        │
              │      ├────────────────────────┤
              │      ▼                        ▼
              └─► IMPLEMENT_POSTGRES_BACKEND  CREATE_ACTIVITY_PANEL
                          │                        │
                          ├────────────────────────┘
                          ▼
                 CREATE_WEBSOCKET_HUB
                          │
                          ▼
                 CREATE_EVENT_AGGREGATOR
                          │
                          ▼
                 CREATE_HOOK_RECEIVER
                          │
                          ├─────────────────┐
                          ▼                 ▼
                 IMPLEMENT_GITHUB_SYNC  ADD_ERROR_HANDLING
                          │                 │
                          └────────┬────────┘
                                   ▼
                             ADD_UNIT_TESTS
                                   │
                                   ▼
                          ADD_INTEGRATION_TESTS
                                   │
                                   ▼
                             ADD_E2E_TESTS
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             MAKE_RESPONSIVE  ADD_DARK_MODE  ADD_HEALTH_CHECKS
                    │              │              │
                    └──────────────┴──────────────┘
                                   │
                                   ▼
                          FINALIZE_DEPLOYMENT
                                   │
                                   ▼
                            GOAL STATE
```

---

## 6. Risk Assessment

### High Risk Actions

| Action | Risk | Mitigation |
|--------|------|------------|
| CREATE_EVENT_AGGREGATOR | Postgres LISTEN may disconnect | Implement reconnection with exponential backoff |
| IMPLEMENT_DRAG_DROP | Optimistic updates may conflict | Queue mutations, serialize with sequence numbers |
| IMPLEMENT_GITHUB_SYNC | Rate limiting, auth issues | Implement retry with backoff, cache tokens |

### Medium Risk Actions

| Action | Risk | Mitigation |
|--------|------|------------|
| CREATE_WEBSOCKET_HUB | Memory leaks from dangling connections | Implement heartbeat + timeout cleanup |
| IMPLEMENT_AUTH_FLOW | Token handling complexity | Use signed JWT with short expiry |

### Parallelization Opportunities

These action pairs can execute concurrently:

1. **M2 + M4 Frontend Start**: After Milestone 1, backend and frontend can develop in parallel until integration points
2. **M5 Drag-Drop + Activity Panel**: Independent UI components
3. **M7 Tests + Polish**: Unit tests, responsive, dark mode can run parallel

---

## 7. Time Estimation

| Milestone | Actions | Cost | Est. Hours | Cumulative |
|-----------|---------|------|------------|------------|
| M1: Foundation | 5 | 6 | 4h | 4h |
| M2: Backend Core | 5 | 12 | 8h | 12h |
| M3: Real-time Backend | 3 | 8 | 6h | 18h |
| M4: Frontend Foundation | 5 | 11 | 8h | 26h |
| M5: Interactive Board | 3 | 7 | 5h | 31h |
| M6: Integrations | 1 | 3 | 3h | 34h |
| M7: Production Ready | 7 | 16 | 10h | 44h |
| **Total** | **29** | **63** | **44h** | |

**Estimated calendar time**: 5-6 working days (with focused effort)

---

## 8. Success Metrics

### Functional Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Claim CRUD operations | 100% working | API integration tests |
| Real-time update latency | < 200ms | Measure PG NOTIFY to browser |
| Drag-drop accuracy | 100% | E2E tests |
| GitHub sync | Within 60s of issue creation | Manual test |

### Quality Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Test coverage | >= 80% | bun test --coverage |
| E2E test pass rate | 100% | Playwright reports |
| TypeScript strict | true | tsc --noEmit |
| Lighthouse performance | >= 90 | Chrome DevTools |

### Operational Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Cold start time | < 5s | Docker startup measurement |
| Memory usage | < 256MB | docker stats |
| Concurrent connections | 50+ | Load test |
| Uptime | 99.9% | Health check monitoring |

---

## 9. Checkpoint Verification Matrix

Each milestone has automated verification:

```bash
#!/bin/bash
# verify-milestone.sh <milestone-number>

MILESTONE=$1

case $MILESTONE in
  1)
    docker-compose config || exit 1
    docker-compose up -d ruvector-postgres || exit 1
    psql $DATABASE_URL -c '\d claims' || exit 1
    echo "Milestone 1: PASSED"
    ;;
  2)
    curl -f http://localhost:3000/health || exit 1
    curl -f http://localhost:3000/api/claims || exit 1
    echo "Milestone 2: PASSED"
    ;;
  3)
    wscat -c ws://localhost:3000/ws --execute "ping" || exit 1
    echo "Milestone 3: PASSED"
    ;;
  4)
    curl -f http://localhost:5173 || exit 1
    echo "Milestone 4: PASSED"
    ;;
  5)
    bun run test:e2e -- --grep "drag-drop" || exit 1
    echo "Milestone 5: PASSED"
    ;;
  6)
    curl http://localhost:3000/api/claims | jq -e '.[] | select(.source=="github")' || exit 1
    echo "Milestone 6: PASSED"
    ;;
  7)
    bun test --coverage | grep -E "All files.*[89][0-9]%" || exit 1
    bun run test:e2e || exit 1
    docker-compose up -d && curl -f http://localhost:3000/health || exit 1
    echo "Milestone 7: PASSED"
    echo "=== GOAL STATE ACHIEVED ==="
    ;;
esac
```

---

## 10. Appendix: File Manifest

Complete list of files to be created:

```
dashboard/
├── package.json
├── bunfig.toml
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── playwright.config.ts
│
├── migrations/
│   ├── 001_claims_table.sql
│   └── 002_claim_events.sql
│
├── server/
│   ├── index.ts
│   ├── config.ts
│   ├── routes/
│   │   ├── claims.ts
│   │   ├── auth.ts
│   │   ├── hooks.ts
│   │   └── health.ts
│   ├── ws/
│   │   ├── hub.ts
│   │   ├── rooms.ts
│   │   └── types.ts
│   ├── storage/
│   │   ├── interface.ts
│   │   ├── types.ts
│   │   ├── postgres.ts
│   │   └── sqlite.ts
│   ├── github/
│   │   ├── sync.ts
│   │   └── types.ts
│   └── events/
│       ├── aggregator.ts
│       └── types.ts
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── stores/
│   │   ├── claims.ts
│   │   ├── activity.ts
│   │   └── auth.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useClaims.ts
│   │   └── useAuth.ts
│   ├── components/
│   │   ├── Board/
│   │   │   ├── Board.tsx
│   │   │   ├── Column.tsx
│   │   │   └── ClaimCard.tsx
│   │   ├── Activity/
│   │   │   ├── ActivityPanel.tsx
│   │   │   ├── AgentStatus.tsx
│   │   │   └── LogStream.tsx
│   │   ├── Auth/
│   │   │   └── LoginForm.tsx
│   │   └── shared/
│   │       ├── Avatar.tsx
│   │       ├── Progress.tsx
│   │       ├── Badge.tsx
│   │       └── Toast.tsx
│   └── lib/
│       ├── api.ts
│       ├── ws.ts
│       └── types.ts
│
├── __tests__/
│   ├── storage.test.ts
│   ├── stores.test.ts
│   ├── api.test.ts
│   └── websocket.test.ts
│
└── e2e/
    ├── auth.spec.ts
    ├── board.spec.ts
    └── drag-drop.spec.ts
```

**Total Files**: ~45 source files + tests

---

## Related Documents

- [Claims Dashboard Design](./2026-01-19-claims-dashboard-design.md) - Main design document
- [ADR-001: Dashboard Architecture](../adr/ADR-001-dashboard-architecture.md)
- [ADR-002: Claims Persistence](../adr/ADR-002-claims-persistence.md)
- [ADR-003: Real-time Events](../adr/ADR-003-realtime-events.md)
- [ADR-004: Frontend Architecture](../adr/ADR-004-frontend-architecture.md)
- [ADR-005: Deployment](../adr/ADR-005-deployment.md)
- [ADR-006: GitHub Integration](../adr/ADR-006-github-integration.md)
- [Domain Model](../ddd/domain-model.md)
