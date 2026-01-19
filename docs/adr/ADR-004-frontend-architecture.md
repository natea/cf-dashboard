# ADR-004: React Frontend Architecture

## Status
Proposed

## Date
2026-01-19

## Context
Need a responsive Kanban board with real-time updates, drag-drop, and agent activity visibility.

## Decision

### Technology Choices
- **React 18** with TypeScript
- **Vite** for build tooling
- **Zustand** for state management
- **@hello-pangea/dnd** for drag-drop
- **Tailwind CSS** for styling

### Component Hierarchy

```
src/
├── main.tsx                 # Entry point
├── App.tsx                  # Auth gate + WebSocket provider
│
├── stores/
│   ├── claims.ts            # Zustand store for claims state
│   ├── activity.ts          # Agent activity/logs store
│   └── auth.ts              # Simple auth state
│
├── hooks/
│   ├── useWebSocket.ts      # WebSocket connection + reconnect
│   ├── useClaims.ts         # Claims CRUD operations
│   └── useAuth.ts           # Auth helpers
│
├── components/
│   ├── Board/
│   │   ├── Board.tsx        # 5-column Kanban layout
│   │   ├── Column.tsx       # Single column (droppable)
│   │   └── ClaimCard.tsx    # Draggable claim card
│   │
│   ├── Activity/
│   │   ├── ActivityPanel.tsx    # Sidebar with agent logs
│   │   ├── AgentStatus.tsx      # Agent avatar + status
│   │   └── LogStream.tsx        # Scrolling log output
│   │
│   ├── Auth/
│   │   └── LoginForm.tsx    # Simple name + secret form
│   │
│   └── shared/
│       ├── Avatar.tsx       # Human/Agent avatar
│       ├── Progress.tsx     # Progress bar
│       └── Badge.tsx        # Status badges
│
└── lib/
    ├── api.ts               # REST API client
    ├── ws.ts                # WebSocket client
    └── types.ts             # Shared TypeScript types
```

### Zustand Claims Store

```typescript
// stores/claims.ts
interface ClaimsState {
  claims: Map<string, Claim>;
  loading: boolean;

  // Actions
  setClaims: (claims: Claim[]) => void;
  updateClaim: (claim: Claim) => void;
  removeClaim: (issueId: string) => void;

  // Computed (selectors)
  getByColumn: (column: ColumnId) => Claim[];
}

export const useClaimsStore = create<ClaimsState>((set, get) => ({
  claims: new Map(),
  loading: true,

  setClaims: (claims) => set({
    claims: new Map(claims.map(c => [c.issueId, c])),
    loading: false
  }),

  updateClaim: (claim) => set((state) => {
    const next = new Map(state.claims);
    next.set(claim.issueId, claim);
    return { claims: next };
  }),

  removeClaim: (issueId) => set((state) => {
    const next = new Map(state.claims);
    next.delete(issueId);
    return { claims: next };
  }),

  getByColumn: (column) => {
    const claims = Array.from(get().claims.values());
    return claims.filter(c => mapStatusToColumn(c) === column);
  }
}));
```

### Column Mapping Logic

```typescript
type ColumnId = 'backlog' | 'agent_working' | 'human_review' | 'revision' | 'done';

const COLUMNS: { id: ColumnId; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'gray' },
  { id: 'agent_working', label: 'Agent Working', color: 'blue' },
  { id: 'human_review', label: 'Human Review', color: 'yellow' },
  { id: 'revision', label: 'Agent Revision', color: 'orange' },
  { id: 'done', label: 'Done', color: 'green' },
];

function mapStatusToColumn(claim: Claim): ColumnId {
  if (claim.status === 'completed') return 'done';

  if (claim.status === 'review-requested' ||
      (claim.claimant.type === 'human' && claim.status === 'active')) {
    return 'human_review';
  }

  if (claim.claimant.type === 'agent') {
    if (claim.metadata?.postReview) return 'revision';
    return 'agent_working';
  }

  return 'agent_working';
}
```

### Drag-Drop Handler

```typescript
// Board.tsx
import { DragDropContext, DropResult } from '@hello-pangea/dnd';

function onDragEnd(result: DropResult) {
  if (!result.destination) return;

  const { draggableId: issueId, destination } = result;
  const targetColumn = destination.droppableId as ColumnId;

  // Optimistic update
  claimsStore.updateClaim({ ...claim, status: columnToStatus(targetColumn) });

  // API call
  switch (targetColumn) {
    case 'human_review':
      api.requestReview(issueId, currentUser);
      break;
    case 'revision':
      api.requestRevision(issueId, { notes: '...' });
      break;
    case 'done':
      api.completeClaim(issueId);
      break;
  }
}
```

### WebSocket Hook

```typescript
// hooks/useWebSocket.ts
export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ action: 'subscribe', rooms: ['board', 'logs'] }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'event') {
          handleEvent(msg.event);
        } else if (msg.type === 'snapshot') {
          claimsStore.setClaims(msg.claims);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 1000); // Reconnect
      };
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  return { connected };
}
```

## Consequences

### Positive
- Zustand is simple, no boilerplate (vs Redux)
- @hello-pangea/dnd is maintained, accessible
- Column mapping centralizes status logic
- Optimistic updates make UI feel instant

### Negative
- Drag-drop to different columns triggers API calls (could fail)
- Need loading states during transitions
- Must handle WebSocket reconnection carefully
