# ADR-007: Agent Orchestrator

## Status
Proposed

## Date
2026-01-19

## Context

The Claims Dashboard provides a coordination layer for tracking work claims, but lacks automated agent spawning. Currently:

1. GitHub issues sync to the backlog automatically
2. Agents must manually query and claim issues via API
3. There's no automated bridge between backlog items and agent execution
4. Claude-flow has existing swarm orchestration infrastructure that's underutilized

We need to decide how to automatically assign and spawn agents for unclaimed issues.

## Decision

Implement a **thin CLI adapter** that bridges the Claims Dashboard with Claude-flow's existing swarm system:

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR                            │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Backlog      │    │ Task Router  │    │ Agent Pool       │  │
│  │ Watcher      │───▶│ (claude-flow)│───▶│ Manager          │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                                        │              │
│         │ WebSocket                              │ spawn        │
└─────────┼────────────────────────────────────────┼──────────────┘
          │                                        │
┌─────────▼─────────┐                    ┌────────▼────────┐
│    Dashboard      │◀───HTTP hooks──────│  Claude Code    │
│    Server         │                    │  Agents         │
└───────────────────┘                    └─────────────────┘
```

### Key Design Choices

1. **Standalone CLI process** (`bun run orchestrator`)
   - Separation of concerns: dashboard = coordination UI, orchestrator = agent lifecycle
   - Can run independently, restart without affecting dashboard
   - Easy to test and debug

2. **Hybrid communication**
   - Orchestrator ↔ Dashboard: WebSocket (bidirectional, real-time)
   - Agents → Dashboard: HTTP hooks (simple, stateless)

3. **Claude-flow task routing** for agent assignment
   - Uses `npx @claude-flow/cli hooks pre-task` to get routing recommendations
   - Leverages existing 3-tier model routing (WASM/Haiku/Sonnet/Opus)
   - Returns both agent type and model tier

4. **Fixed pool size** for concurrency control
   - Simple `MAX_AGENTS=4` configuration
   - Claims stay in backlog until capacity available
   - No complex scheduling algorithms in v1

5. **Simple retry** for failure handling
   - Failed claims retry up to N times (default: 2)
   - Exponential backoff (5s, 10s, 20s)
   - After max retries, claim marked as "blocked" for human review

### Alternatives Considered

1. **Dashboard-side integration** - Orchestrator runs inside dashboard server
   - Rejected: tighter coupling, single point of failure, harder to scale

2. **Label-based routing** - Map GitHub labels to agent types
   - Rejected: less flexible, doesn't leverage claude-flow's learned patterns

3. **LLM classification** - Send each issue to Haiku for classification
   - Rejected: adds latency and cost when claude-flow routing already exists

4. **Cost-budget based scaling** - Dynamic agent count based on API spend
   - Deferred: adds complexity, can be added later as enhancement

## Consequences

### Positive

- Leverages existing claude-flow infrastructure (~80% reuse)
- Minimal new code (~200-300 lines of glue)
- Clean separation of concerns
- Easy to disable orchestrator without affecting dashboard
- Smart routing without additional LLM calls
- Simple retry logic handles transient failures

### Negative

- Requires running two processes (dashboard + orchestrator)
- WebSocket connection adds complexity vs pure polling
- No automatic cost controls in v1 (must be added later)
- Fixed pool size may under/over-utilize resources

### Risks

| Risk | Mitigation |
|------|------------|
| Orchestrator crashes, orphans agents | Graceful shutdown waits for agents; dashboard shows orphaned claims |
| Dashboard unreachable | Orchestrator reconnects with exponential backoff |
| Claude-flow CLI changes | Pin CLI version in package.json |
| Rate limiting on agent spawns | Respect pool size, add backoff on spawn failures |

## Implementation

See [GOAP Plan - Milestone 8](../plans/2026-01-19-claims-dashboard-goap-plan.md#11-milestone-8-agent-orchestrator) for detailed implementation actions.

### File Structure

```
dashboard/orchestrator/
├── index.ts              # CLI entry point
├── config.ts             # Configuration from env
├── orchestrator.ts       # Main Orchestrator class
├── dashboard-client.ts   # WebSocket + HTTP client
├── agent-spawner.ts      # Claude-flow CLI wrapper
├── task-router.ts        # Task routing via hooks
└── types.ts              # Type definitions
```

### Configuration

```bash
ORCHESTRATOR_DASHBOARD_URL=http://localhost:3000
ORCHESTRATOR_MAX_AGENTS=4
ORCHESTRATOR_MAX_RETRIES=2
ORCHESTRATOR_RETRY_DELAY_MS=5000
```

## Related

- [ADR-001: Dashboard Architecture](./ADR-001-dashboard-architecture.md)
- [ADR-003: Real-time Events](./ADR-003-realtime-events.md)
- [Domain Model](../ddd/domain-model.md)
