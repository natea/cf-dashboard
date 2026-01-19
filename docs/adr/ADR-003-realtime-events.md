# ADR-003: Real-time Event Architecture

## Status
Proposed

## Date
2026-01-19

## Context
Dashboard needs real-time updates from multiple sources:
1. Claim state changes (from storage)
2. Agent activity/logs (from Claude Flow hooks)
3. Worker output (from background agents)

## Decision

### Event Aggregator Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     EVENT AGGREGATOR                             │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │ Storage Events │  │ Hook Events    │  │ Agent Stdout     │   │
│  │                │  │                │  │                  │   │
│  │ • claim.created│  │ • post-task    │  │ • progress %     │   │
│  │ • claim.updated│  │ • post-edit    │  │ • log lines      │   │
│  │ • claim.deleted│  │ • post-command │  │ • errors         │   │
│  └───────┬────────┘  └───────┬────────┘  └────────┬─────────┘   │
│          │                   │                    │              │
│          └───────────────────┼────────────────────┘              │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ Event Normalizer │                          │
│                    │                 │                          │
│                    │ → ClaimEvent    │                          │
│                    │ → ActivityEvent │                          │
│                    │ → LogEvent      │                          │
│                    └────────┬────────┘                          │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │ WebSocket Hub   │
                    │                 │
                    │ • Room: board   │ ← All claim updates
                    │ • Room: logs    │ ← Agent activity
                    │ • Room: agent/* │ ← Per-agent streams
                    └─────────────────┘
```

### Event Types

```typescript
// Normalized events sent to clients
type DashboardEvent =
  | { type: 'claim.created'; claim: Claim }
  | { type: 'claim.updated'; claim: Claim; changes: Partial<Claim> }
  | { type: 'claim.deleted'; issueId: string }
  | { type: 'claim.handoff'; from: Claimant; to: Claimant; issueId: string }
  | { type: 'agent.progress'; agentId: string; issueId: string; progress: number }
  | { type: 'agent.log'; agentId: string; level: 'info'|'warn'|'error'; message: string }
  | { type: 'agent.started'; agentId: string; agentType: string }
  | { type: 'agent.completed'; agentId: string; result: 'success'|'failure' };
```

### Hook Receiver Endpoint

```typescript
// POST /hooks/event - receives Claude Flow hook callbacks
app.post('/hooks/event', async (c) => {
  const event = await c.req.json();

  switch (event.hook) {
    case 'post-task':
      // Agent completed a task
      aggregator.emit({
        type: 'agent.progress',
        agentId: event.agentId,
        issueId: event.taskId,
        progress: event.success ? 100 : event.progress
      });
      break;

    case 'post-edit':
      // Agent edited a file
      aggregator.emit({
        type: 'agent.log',
        agentId: event.agentId,
        level: 'info',
        message: `Edited ${event.filePath}`
      });
      break;
  }
});
```

### WebSocket Protocol

```typescript
// Client → Server
type ClientMessage =
  | { action: 'subscribe'; rooms: string[] }
  | { action: 'unsubscribe'; rooms: string[] }
  | { action: 'ping' };

// Server → Client
type ServerMessage =
  | { type: 'event'; event: DashboardEvent }
  | { type: 'snapshot'; claims: Claim[] }  // Initial state on connect
  | { type: 'pong' };
```

### Room-based Subscriptions

Clients subscribe to specific rooms to reduce bandwidth:

| Room | Events | Use Case |
|------|--------|----------|
| `board` | All claim events | Main Kanban view |
| `logs` | All agent logs | Activity sidebar |
| `agent:{id}` | Single agent events | Agent detail view |
| `claim:{id}` | Single claim events | Claim detail modal |

## Consequences

### Positive
- Single WebSocket connection for all event types
- Room-based filtering reduces bandwidth
- Normalized events simplify frontend logic
- Hook integration captures rich agent context

### Negative
- Hook endpoint must be registered with Claude Flow config
- Agent stdout capture requires process spawning (for local agents)
