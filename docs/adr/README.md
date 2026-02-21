# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Claims Dashboard project.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./ADR-001-dashboard-architecture.md) | Real-time Kanban Dashboard Architecture | Proposed | 2026-01-19 |
| [ADR-002](./ADR-002-claims-persistence.md) | Claims Persistence and Real-time Events | Proposed | 2026-01-19 |
| [ADR-003](./ADR-003-realtime-events.md) | Real-time Event Architecture | Proposed | 2026-01-19 |
| [ADR-004](./ADR-004-frontend-architecture.md) | React Frontend Architecture | Proposed | 2026-01-19 |
| [ADR-005](./ADR-005-deployment.md) | Docker Compose Deployment | Proposed | 2026-01-19 |
| [ADR-006](./ADR-006-github-integration.md) | GitHub Integration (Read-Only) | Proposed | 2026-01-19 |
| [ADR-007](./ADR-007-agent-orchestrator.md) | Agent Orchestrator | Proposed | 2026-01-19 |

## ADR Status Lifecycle

```
Proposed → Accepted → Deprecated
              ↓
          Superseded (by ADR-XXX)
```

## Template

When adding new ADRs, use this template:

```markdown
# ADR-XXX: Title

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-XXX

## Date
YYYY-MM-DD

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
### Positive
- ...

### Negative
- ...
```
