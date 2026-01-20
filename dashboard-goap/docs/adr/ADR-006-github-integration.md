# ADR-006: GitHub Integration (Read-Only Initial)

## Status
Proposed

## Date
2026-01-19

## Context
The dashboard needs to populate the Backlog column with work items. GitHub Issues is a common source of truth for teams. We need to decide the integration depth.

## Decision

### Phase 1: Read-Only Sync (Initial)

Start with minimal GitHub integration:

```typescript
interface GitHubConfig {
  owner: string;        // e.g., "ruvnet"
  repo: string;         // e.g., "claude-flow"
  token?: string;       // Optional: for private repos
  labels?: string[];    // Filter by labels, e.g., ["ready", "approved"]
  pollInterval: number; // Sync interval in seconds (default: 60)
}
```

### Sync Logic

```typescript
// server/github/sync.ts
async function syncGitHubIssues(config: GitHubConfig) {
  const issues = await octokit.issues.listForRepo({
    owner: config.owner,
    repo: config.repo,
    state: 'open',
    labels: config.labels?.join(','),
    per_page: 100,
  });

  for (const issue of issues.data) {
    // Upsert into claims table with source='github'
    await storage.upsertClaim({
      issueId: `gh-${issue.number}`,
      source: 'github',
      sourceRef: issue.html_url,
      title: issue.title,
      description: issue.body,
      metadata: {
        githubId: issue.id,
        githubNumber: issue.number,
        labels: issue.labels.map(l => l.name),
        author: issue.user?.login,
      },
      // Only set status if not already claimed
      status: 'backlog',
    });
  }
}
```

### Data Flow

```
┌────────────────┐         ┌─────────────────┐         ┌──────────────┐
│ GitHub Issues  │ ──poll──│ Dashboard Server │ ──save──│ claims table │
│                │         │ (every 60s)     │         │ source=github│
│ • Open issues  │         │                 │         │              │
│ • With labels  │         │ Transform to    │         │ Backlog col  │
└────────────────┘         │ Claim format    │         └──────────────┘
                           └─────────────────┘
```

### Claim Sources

All three sources write to the same claims table:

| Source | `source` field | `source_ref` | Created via |
|--------|----------------|--------------|-------------|
| GitHub | `github` | Issue URL | Background sync |
| Manual | `manual` | null | Dashboard UI |
| MCP | `mcp` | Task ID | `task_create` MCP tool |

### Manual Creation Endpoint

```typescript
// POST /api/claims
app.post('/claims', async (c) => {
  const { title, description } = await c.req.json();

  const claim = await storage.createClaim({
    issueId: `manual-${nanoid()}`,
    source: 'manual',
    title,
    description,
    status: 'backlog',
  });

  return c.json(claim);
});
```

### MCP Integration

Listen for `task_create` events and create backlog items:

```typescript
// Hook receiver for task creation
app.post('/hooks/event', async (c) => {
  const event = await c.req.json();

  if (event.type === 'task.created') {
    await storage.createClaim({
      issueId: `mcp-${event.taskId}`,
      source: 'mcp',
      sourceRef: event.taskId,
      title: event.description,
      status: 'backlog',
    });
  }
});
```

### Future Phases (Not Implemented Now)

**Phase 2: Labels Sync**
- Write status back to GitHub as labels
- `agent-working`, `human-review`, `done`

**Phase 3: Comments & Assignees**
- Post claim updates as comments
- Sync dashboard claimants to GitHub assignees

**Phase 4: Webhooks**
- Replace polling with GitHub webhooks
- Real-time issue creation/updates

## Consequences

### Positive
- Simple to implement (just REST API calls)
- No webhook infrastructure needed initially
- GitHub remains source of truth for issues
- Dashboard adds the claims/workflow layer

### Negative
- Up to 60s delay for new issues to appear
- No feedback to GitHub (team must check dashboard)
- Manual/MCP items not visible in GitHub
