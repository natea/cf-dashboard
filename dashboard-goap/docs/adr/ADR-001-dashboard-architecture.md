# ADR-001: Real-time Kanban Dashboard Architecture

## Status
Proposed

## Date
2026-01-19

## Context
We need a web-based Kanban dashboard for a small team (2-5 people) to:
- Visualize claims/tasks across human-agent workflow stages
- See real-time updates as agents work and humans review
- Coordinate handoffs between humans and AI agents

## Decision
We will build a **Bun + React hybrid real-time architecture**:

### Backend (Bun)
- **Hono** framework for REST API (lightweight, fast, TypeScript-native)
- **Native Bun WebSocket** server for real-time broadcasts
- **postgres.js** for RuVector/Postgres connection with LISTEN/NOTIFY
- **HTTP endpoint** receiving Claude Flow hook events

### Frontend (React + Vite)
- **@hello-pangea/dnd** for drag-drop (maintained fork of react-beautiful-dnd)
- **Zustand** for state management (simple, WebSocket-friendly)
- **Native WebSocket** client with reconnection logic

### Real-time Strategy (Hybrid)
1. Postgres NOTIFY on claims table changes → instant state sync
2. Claude Flow hooks (post-task, post-edit) → agent activity stream
3. Client reconnection pulls full state to avoid drift

## Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Kanban Board (5 columns)                   │   │
│  │  Backlog → Agent Working → Human Review → Revision → Done│   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ▲ WebSocket                          │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                     BUN SERVER                                  │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │ REST API   │    │ WebSocket    │    │ Event Aggregator │    │
│  │ /claims    │    │ Server       │◄───│                  │    │
│  │ /auth      │    │ (broadcast)  │    │ • PG NOTIFY      │    │
│  └────────────┘    └──────────────┘    │ • Hook receiver  │    │
│         │                              └──────────────────┘    │
└─────────┼──────────────────────────────────────┼───────────────┘
          │                                      │
          ▼                                      ▼
┌──────────────────────┐              ┌──────────────────────────┐
│  RuVector/Postgres   │              │  Claude Flow Hooks       │
│  • claims table      │              │  • post-task events      │
│  • agents table      │              │  • agent stdout/stderr   │
│  • LISTEN/NOTIFY     │              │  • progress updates      │
└──────────────────────┘              └──────────────────────────┘
```

## Consequences

### Positive
- Sub-100ms update latency via Postgres NOTIFY
- Rich agent activity context via hooks integration
- Single runtime (Bun) simplifies deployment
- Type-safe end-to-end with TypeScript

### Negative
- Requires Postgres connection (not just Claude Flow MCP)
- Hook endpoint must be registered with Claude Flow
- WebSocket reconnection needs careful state reconciliation

## Alternatives Considered

1. **Polling** - Simpler but 1-2s latency, more database load
2. **Pure MCP integration** - No direct Postgres access, limited real-time
3. **Server-Sent Events** - Simpler than WebSocket but unidirectional
