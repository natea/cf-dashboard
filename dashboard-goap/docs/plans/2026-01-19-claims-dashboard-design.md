# Claims Dashboard Design

**Date**: 2026-01-19
**Status**: Proposed
**Author**: Collaborative design session

## Overview

A real-time web-based Kanban dashboard for visualizing and managing Claude Flow claims - the work coordination system that manages task ownership between humans and AI agents.

## Goals

1. **Visualize** all claims across a 5-column workflow board
2. **Real-time updates** as agents work and humans review
3. **Coordinate handoffs** between humans and AI agents via drag-drop
4. **Monitor agent activity** with live logs and progress
5. **Integrate** with GitHub Issues, manual creation, and MCP tasks

## Target Users

Small team (2-5 people) coordinating with AI agents:
- Developers reviewing agent work
- Team leads monitoring progress
- AI agents (via MCP tools) claiming and completing work

## Key Decisions Summary

| Decision | Choice | ADR |
|----------|--------|-----|
| Architecture | Bun + Hono + React + WebSocket | [ADR-001](../adr/ADR-001-dashboard-architecture.md) |
| Data Source | RuVector/Postgres (SQLite fallback) | [ADR-002](../adr/ADR-002-claims-persistence.md) |
| Real-time | Hybrid: PG NOTIFY + Claude Flow hooks | [ADR-003](../adr/ADR-003-realtime-events.md) |
| Frontend | React + Vite + Zustand + @hello-pangea/dnd | [ADR-004](../adr/ADR-004-frontend-architecture.md) |
| Deployment | Docker Compose with RuVector | [ADR-005](../adr/ADR-005-deployment.md) |
| GitHub | Read-only sync initially | [ADR-006](../adr/ADR-006-github-integration.md) |
| Auth | Simple shared secret + name | ADR-004 |
| Columns | 5-column agent-aware workflow | Domain Model |

## Workflow Columns

```
┌──────────┐   ┌───────────────┐   ┌──────────────┐   ┌────────────────┐   ┌──────┐
│ Backlog  │ → │ Agent Working │ → │ Human Review │ → │ Agent Revision │ → │ Done │
│          │   │               │   │              │   │                │   │      │
│ Unclaimed│   │ AI working    │   │ Human needed │   │ AI fixing      │   │  ✓   │
│          │   │               │   │              │   │                │   │      │
│ Sources: │   │ • Progress %  │   │ • Drag here  │   │ • Post-review  │   │      │
│ • GitHub │   │ • Live logs   │   │   to review  │   │   fixes        │   │      │
│ • Manual │   │ • Agent type  │   │ • Approve or │   │ • Back to      │   │      │
│ • MCP    │   │               │   │   send back  │   │   review       │   │      │
└──────────┘   └───────────────┘   └──────────────┘   └────────────────┘   └──────┘
```

## Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Kanban Board (5 columns)                   │   │
│  │  • Drag-drop between columns                            │   │
│  │  • Real-time claim cards                                │   │
│  │  • Agent activity sidebar                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ▲ WebSocket                          │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                     BUN SERVER (Hono)                           │
│                                                                 │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │ REST API   │    │ WebSocket    │    │ Event Aggregator │    │
│  │            │    │ Hub          │◄───│                  │    │
│  │ /claims    │    │              │    │ • PG LISTEN      │    │
│  │ /auth      │    │ Rooms:       │    │ • Hook receiver  │    │
│  │ /github    │    │ • board      │    │ • GitHub poller  │    │
│  └────────────┘    │ • logs       │    └──────────────────┘    │
│                    │ • agent/*    │                             │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
          │                   │                    │
          ▼                   ▼                    ▼
┌──────────────────┐ ┌────────────────┐ ┌─────────────────────┐
│ RuVector/Postgres│ │ Claude Flow    │ │ GitHub API          │
│                  │ │ Hooks          │ │                     │
│ • claims table   │ │ • post-task    │ │ • Issues (read-only)│
│ • NOTIFY trigger │ │ • post-edit    │ │ • Poll every 60s    │
└──────────────────┘ └────────────────┘ └─────────────────────┘
```

### Data Flow

```
1. BACKLOG SOURCES
   GitHub Issues ──poll──┐
   Manual Creation ──────┼──► claims table (status='backlog')
   MCP task_create ──────┘

2. CLAIM LIFECYCLE
   Backlog ──agent claims──► Agent Working ──request review──► Human Review
                                   ▲                               │
                                   └────────send back──────────────┘
                                                                   │
                                                          ──approve──► Done

3. REAL-TIME UPDATES
   claims table ──NOTIFY──► Event Aggregator ──WebSocket──► Browser
   Claude Flow hooks ──────────────┘
```

## Domain Model

See [Domain Model](../ddd/domain-model.md) for full DDD documentation.

### Core Types

```typescript
interface Claim {
  id: string;
  issueId: string;
  source: 'github' | 'manual' | 'mcp';
  sourceRef?: string;

  title: string;
  description?: string;

  status: ClaimStatus;
  claimant?: Claimant;
  progress: number;
  context?: string;

  createdAt: Date;
  updatedAt: Date;
}

type ClaimStatus =
  | 'backlog'
  | 'active'
  | 'paused'
  | 'blocked'
  | 'review-requested'
  | 'completed';

type Claimant =
  | { type: 'human'; userId: string; name: string }
  | { type: 'agent'; agentId: string; agentType: string };
```

## Project Structure

```
dashboard/
├── docker-compose.yml        # Full stack deployment
├── Dockerfile
├── package.json
├── bunfig.toml
├── vite.config.ts
├── tailwind.config.ts
│
├── server/
│   ├── index.ts              # Bun + Hono entry
│   ├── routes/
│   │   ├── claims.ts         # CRUD + transitions
│   │   ├── auth.ts           # Simple auth
│   │   ├── hooks.ts          # Claude Flow receiver
│   │   └── github.ts         # GitHub sync status
│   ├── ws/
│   │   ├── hub.ts            # WebSocket hub
│   │   └── rooms.ts          # Room management
│   ├── storage/
│   │   ├── interface.ts      # Storage adapter
│   │   ├── sqlite.ts         # Dev backend
│   │   └── postgres.ts       # Production backend
│   ├── github/
│   │   └── sync.ts           # Issue polling
│   └── events/
│       ├── aggregator.ts     # Event normalization
│       └── types.ts
│
├── src/                      # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── stores/
│   │   ├── claims.ts         # Zustand
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
│   └── lib/
│       ├── api.ts
│       ├── ws.ts
│       └── types.ts
│
└── migrations/
    ├── 001_claims_table.sql
    └── 002_claim_events.sql
```

## Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Project scaffolding (Bun + Vite + React + Tailwind)
- [ ] Docker Compose with RuVector
- [ ] Postgres claims table + NOTIFY trigger
- [ ] Basic REST API (CRUD)
- [ ] Simple auth (shared secret)
- [ ] Static Kanban board (no drag-drop)

### Phase 2: Real-time
- [ ] WebSocket server with Hono
- [ ] Postgres LISTEN integration
- [ ] Frontend WebSocket hook
- [ ] Zustand stores with WS updates
- [ ] Live claim card updates

### Phase 3: Interactivity
- [ ] @hello-pangea/dnd integration
- [ ] Drag-drop status transitions
- [ ] Optimistic updates
- [ ] Claim detail modal
- [ ] Progress updates

### Phase 4: Backlog Sources
- [ ] Manual issue creation form
- [ ] GitHub Issues polling
- [ ] MCP task_create hook receiver
- [ ] Source badges on cards

### Phase 5: Agent Activity
- [ ] Activity panel sidebar
- [ ] Claude Flow hook receiver
- [ ] Per-agent log streams
- [ ] Agent status indicators
- [ ] Progress visualization

### Phase 6: Polish
- [ ] Error handling + toasts
- [ ] Loading states
- [ ] Keyboard shortcuts
- [ ] Mobile responsive
- [ ] Dark mode

## Quick Start (After Implementation)

```bash
# Clone and start
git clone <repo>
cd dashboard

# Start RuVector + Dashboard
docker-compose up -d

# Open browser
open http://localhost:3000

# Login with team secret
# Default: "changeme" (set TEAM_SECRET env var)
```

## Configuration

```bash
# Required
DATABASE_URL=postgres://claude:claude-flow-test@localhost:5432/claude_flow

# Optional
TEAM_SECRET=your-secret-here
GITHUB_TOKEN=ghp_xxx          # For private repos
GITHUB_OWNER=ruvnet
GITHUB_REPO=claude-flow
GITHUB_LABELS=ready,approved  # Filter issues
GITHUB_POLL_INTERVAL=60       # Seconds
```

## Related Documents

- [ADR-001: Dashboard Architecture](../adr/ADR-001-dashboard-architecture.md)
- [ADR-002: Claims Persistence](../adr/ADR-002-claims-persistence.md)
- [ADR-003: Real-time Events](../adr/ADR-003-realtime-events.md)
- [ADR-004: Frontend Architecture](../adr/ADR-004-frontend-architecture.md)
- [ADR-005: Docker Compose Deployment](../adr/ADR-005-deployment.md)
- [ADR-006: GitHub Integration](../adr/ADR-006-github-integration.md)
- [Domain Model](../ddd/domain-model.md)
