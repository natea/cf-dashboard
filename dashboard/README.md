# Claims Dashboard

Real-time Kanban board for tracking Claude Flow claims with WebSocket updates, drag-drop, and GitHub integration.

## Features

- **5-Column Kanban Board**: Backlog → Agent Working → Human Review → Agent Revision → Done
- **Real-time Updates**: WebSocket-powered live sync across all clients
- **Drag-and-Drop**: Move claims between columns to update status
- **GitHub Integration**: Auto-sync issues from GitHub repositories
- **Authentication**: Simple shared-secret auth for team access
- **Docker Support**: Production-ready with Docker Compose and Postgres

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- Node.js 18+ (for some dependencies)

### Installation

```bash
cd dashboard
bun install
```

### Development Mode

**Terminal 1 - Backend API (port 3000):**
```bash
bun run dev
```

**Terminal 2 - Frontend (port 5173):**
```bash
bun run dev:client
```

Open http://localhost:5173

## Configuration

All configuration is via environment variables. Create a `.env` file or export them directly.

### Authentication

```bash
# Optional: Set to enable authentication
export DASHBOARD_SECRET=your-team-secret
```

When set, users must enter this secret to access the dashboard. Without it, auth is disabled (useful for local development).

### GitHub Sync

Automatically import issues from a GitHub repository:

```bash
# Required for GitHub sync
export GITHUB_OWNER=your-username-or-org
export GITHUB_REPO=your-repo-name

# Optional: Required for private repos
export GITHUB_TOKEN=ghp_your_personal_access_token

# Optional: Only sync issues with these labels (comma-separated)
export GITHUB_LABELS=bug,enhancement,claim

# Optional: Poll interval in seconds (default: 60)
export GITHUB_POLL_INTERVAL=30
```

#### Example: Sync from a public repo

```bash
GITHUB_OWNER=ruvnet GITHUB_REPO=claude-flow bun run dev
```

#### Example: Sync from a private repo

```bash
GITHUB_OWNER=myorg GITHUB_REPO=private-repo GITHUB_TOKEN=ghp_xxx bun run dev
```

### Full Example `.env` File

```bash
# dashboard/.env

# Authentication (optional - omit for no auth)
DASHBOARD_SECRET=my-team-secret-123

# GitHub sync (optional)
GITHUB_OWNER=ruvnet
GITHUB_REPO=claude-flow
GITHUB_TOKEN=ghp_your_token_here
GITHUB_LABELS=claim,task
GITHUB_POLL_INTERVAL=30

# Server port (optional, default: 3000)
PORT=3000
```

## Production Deployment

### Using Docker Compose

```bash
# Build and start with Postgres
docker compose up --build

# Or run in background
docker compose up -d --build
```

This starts:
- **dashboard**: The application on port 3000
- **postgres**: PostgreSQL database on port 5432

### Environment Variables for Production

```bash
# Required
DASHBOARD_SECRET=strong-secret-here
DATABASE_URL=postgres://user:pass@localhost:5432/claims

# GitHub sync (optional)
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo
GITHUB_TOKEN=ghp_xxx
```

### Building for Production

```bash
# Build frontend and backend
bun run build

# Start production server
bun run start
```

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/api/claims` | List all claims |
| GET | `/api/claims/:issueId` | Get single claim |
| POST | `/api/claims` | Create new claim |
| PATCH | `/api/claims/:issueId` | Update claim |
| DELETE | `/api/claims/:issueId` | Delete claim |

### WebSocket

Connect to `/ws` for real-time updates.

```javascript
// With auth
const ws = new WebSocket('ws://localhost:3000/ws?token=your-secret');

// Subscribe to board updates
ws.send(JSON.stringify({ action: 'subscribe', rooms: ['board'] }));

// Listen for events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'claim.created' | 'claim.updated' | 'claim.deleted'
  // data.claim: the claim object
};
```

### Creating a Claim

```bash
curl -X POST http://localhost:3000/api/claims \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{
    "issueId": "TASK-001",
    "title": "Implement feature X",
    "description": "Details here",
    "source": "manual"
  }'
```

### Updating Claim Status

```bash
curl -X PATCH http://localhost:3000/api/claims/TASK-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{
    "status": "active",
    "progress": 50
  }'
```

## Claim Statuses

| Status | Column | Description |
|--------|--------|-------------|
| `backlog` | Backlog | Not started, no assignee |
| `active` | Agent Working | Being worked on by an agent |
| `review-requested` | Human Review | Needs human review |
| `active` (post-review) | Agent Revision | Agent revising after feedback |
| `completed` | Done | Finished |

## Architecture

```
dashboard/
├── server/           # Bun + Hono backend
│   ├── domain/       # Domain types
│   ├── storage/      # Storage adapters (memory, postgres)
│   ├── routes/       # REST API routes
│   ├── ws/           # WebSocket hub
│   ├── middleware/   # Auth middleware
│   ├── github/       # GitHub sync
│   └── index.ts      # Server entry point
├── src/              # React frontend
│   ├── components/   # UI components
│   ├── stores/       # Zustand stores
│   ├── hooks/        # React hooks
│   └── lib/          # Utilities
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Tech Stack

- **Backend**: Bun, Hono, postgres.js
- **Frontend**: React 18, Vite, Zustand, @hello-pangea/dnd, Tailwind CSS
- **Database**: PostgreSQL (production), In-memory (development)
- **Real-time**: WebSocket with room-based subscriptions

## Development

### Running Tests

```bash
bun test
```

### Test Coverage

```bash
bun test --coverage
```

## Troubleshooting

### WebSocket connection fails

Make sure both servers are running:
- Backend on port 3000: `bun run dev`
- Frontend on port 5173: `bun run dev:client`

The Vite dev server proxies WebSocket connections to the backend.

### 401 Unauthorized errors

If `DASHBOARD_SECRET` is set, you need to enter it in the login prompt. To disable auth for development:

```bash
unset DASHBOARD_SECRET
bun run dev
```

### GitHub sync not working

1. Check the server logs for "GitHub sync enabled" or error messages
2. Verify `GITHUB_OWNER` and `GITHUB_REPO` are set correctly
3. For private repos, ensure `GITHUB_TOKEN` has `repo` scope
4. Check GitHub API rate limits (60/hour unauthenticated, 5000/hour with token)

### Port already in use

```bash
# Kill existing processes
pkill -f "bun run"
pkill -f vite

# Or use different ports
PORT=3001 bun run dev
```

## License

MIT
