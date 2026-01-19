# Claims Dashboard Domain Model

## Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAIMS DASHBOARD SYSTEM                      │
├─────────────────────┬─────────────────────┬────────────────────┤
│   CLAIMS CONTEXT    │   AGENTS CONTEXT    │  IDENTITY CONTEXT  │
│                     │                     │                    │
│ • Claim (Aggregate) │ • Agent (Entity)    │ • User (Entity)    │
│ • Issue (Entity)    │ • AgentActivity     │ • Session          │
│ • Claimant (VO)     │   (Event)           │ • TeamAccess (VO)  │
│ • ClaimStatus (VO)  │ • WorkerOutput      │                    │
│ • Handoff (Entity)  │   (Event)           │                    │
└─────────────────────┴─────────────────────┴────────────────────┘
```

## Claims Context

### Claim (Aggregate Root)

The central entity representing ownership of work.

```typescript
interface Claim {
  // Identity
  id: ClaimId;              // UUID
  issueId: IssueId;         // External reference (e.g., "ISSUE-123")

  // State
  status: ClaimStatus;
  progress: number;         // 0-100

  // Ownership
  claimant: Claimant;

  // Context
  context?: string;         // Handoff notes, work context
  metadata?: ClaimMetadata;

  // Timestamps
  claimedAt: Date;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;

  // Domain Events (for event sourcing)
  events: ClaimEvent[];
}

type ClaimId = string;
type IssueId = string;
```

### ClaimStatus (Value Object)

Represents the workflow state with defined transitions.

```typescript
type ClaimStatus =
  | 'backlog'           // Not yet claimed
  | 'active'            // Being worked on
  | 'paused'            // Temporarily stopped
  | 'blocked'           // Cannot proceed
  | 'review-requested'  // Needs human review
  | 'completed';        // Work finished

// Valid state transitions
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  'backlog':          ['active'],
  'active':           ['paused', 'blocked', 'review-requested', 'completed'],
  'paused':           ['active', 'blocked'],
  'blocked':          ['active', 'paused'],
  'review-requested': ['active', 'completed'],  // Back to agent or done
  'completed':        [],  // Terminal state
};
```

### Claimant (Value Object)

Identifies who owns a claim - either human or agent.

```typescript
type Claimant = HumanClaimant | AgentClaimant;

interface HumanClaimant {
  type: 'human';
  userId: string;       // e.g., "user-1"
  name: string;         // e.g., "Nate"
}

interface AgentClaimant {
  type: 'agent';
  agentId: string;      // e.g., "coder-1"
  agentType: AgentType; // e.g., "coder"
}

type AgentType =
  | 'coder'
  | 'researcher'
  | 'tester'
  | 'reviewer'
  | 'architect'
  | 'debugger';

// String serialization format
// Human: "human:user-1:Nate"
// Agent: "agent:coder-1:coder"
function serializeClaimant(c: Claimant): string {
  if (c.type === 'human') {
    return `human:${c.userId}:${c.name}`;
  }
  return `agent:${c.agentId}:${c.agentType}`;
}

function parseClaimant(s: string): Claimant {
  const [type, id, name] = s.split(':');
  if (type === 'human') {
    return { type: 'human', userId: id, name };
  }
  return { type: 'agent', agentId: id, agentType: name as AgentType };
}
```

### Handoff (Entity)

Represents a transfer of work between claimants.

```typescript
interface Handoff {
  id: HandoffId;
  claimId: ClaimId;

  from: Claimant;
  to: Claimant;

  status: HandoffStatus;
  reason: string;
  context?: string;     // Notes for the recipient

  requestedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
}

type HandoffStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
```

### Domain Events

Events emitted by the Claims aggregate:

```typescript
type ClaimEvent =
  | { type: 'ClaimCreated'; claim: Claim; timestamp: Date }
  | { type: 'ClaimStatusChanged'; claimId: ClaimId; from: ClaimStatus; to: ClaimStatus; timestamp: Date }
  | { type: 'ClaimProgressUpdated'; claimId: ClaimId; progress: number; timestamp: Date }
  | { type: 'HandoffRequested'; handoff: Handoff; timestamp: Date }
  | { type: 'HandoffAccepted'; handoffId: HandoffId; timestamp: Date }
  | { type: 'HandoffRejected'; handoffId: HandoffId; reason: string; timestamp: Date }
  | { type: 'ClaimReleased'; claimId: ClaimId; reason: string; timestamp: Date }
  | { type: 'ClaimCompleted'; claimId: ClaimId; timestamp: Date };
```

## Agents Context

### Agent (Entity)

Represents an AI agent that can claim work.

```typescript
interface Agent {
  id: AgentId;
  type: AgentType;
  name: string;

  status: AgentStatus;
  health: number;       // 0-1

  // Load tracking
  currentClaims: number;
  maxClaims: number;
  utilization: number;  // currentClaims / maxClaims

  spawnedAt: Date;
  lastActivityAt: Date;
}

type AgentStatus = 'idle' | 'working' | 'blocked' | 'terminated';
```

### AgentActivity (Event)

Activity events emitted by agents during work.

```typescript
interface AgentActivity {
  agentId: AgentId;
  issueId?: IssueId;    // If related to a claim
  timestamp: Date;

  type: ActivityType;
  payload: unknown;
}

type ActivityType =
  | 'task_started'
  | 'task_completed'
  | 'file_edited'
  | 'command_executed'
  | 'error_occurred'
  | 'progress_updated';
```

## Identity Context

### User (Entity)

A human team member who can use the dashboard.

```typescript
interface User {
  id: UserId;
  name: string;

  // Simple auth
  sessionToken?: string;
  lastSeenAt: Date;
}
```

### TeamAccess (Value Object)

Simple shared-secret authentication for the team.

```typescript
interface TeamAccess {
  secretHash: string;   // Hashed shared secret
  teamName: string;
}
```

## Column Mapping (Dashboard View Model)

Maps domain status to UI columns:

```typescript
type ColumnId = 'backlog' | 'agent_working' | 'human_review' | 'revision' | 'done';

function mapClaimToColumn(claim: Claim): ColumnId {
  // Terminal state
  if (claim.status === 'completed') return 'done';

  // Human review states
  if (claim.status === 'review-requested') return 'human_review';
  if (claim.claimant.type === 'human' && claim.status === 'active') {
    return 'human_review';
  }

  // Agent states
  if (claim.claimant.type === 'agent') {
    // Post-review work goes to revision column
    if (claim.metadata?.postReview) return 'revision';
    return 'agent_working';
  }

  // Default
  return 'agent_working';
}

// Column definitions
const COLUMNS: Column[] = [
  { id: 'backlog',       label: 'Backlog',        color: '#6B7280' },
  { id: 'agent_working', label: 'Agent Working',  color: '#3B82F6' },
  { id: 'human_review',  label: 'Human Review',   color: '#F59E0B' },
  { id: 'revision',      label: 'Agent Revision', color: '#F97316' },
  { id: 'done',          label: 'Done',           color: '#10B981' },
];
```

## Repository Interfaces

```typescript
interface ClaimsRepository {
  findById(id: ClaimId): Promise<Claim | null>;
  findByIssueId(issueId: IssueId): Promise<Claim | null>;
  findAll(filter?: ClaimFilter): Promise<Claim[]>;

  save(claim: Claim): Promise<void>;
  delete(id: ClaimId): Promise<void>;

  // Real-time
  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe;
}

interface AgentsRepository {
  findById(id: AgentId): Promise<Agent | null>;
  findByType(type: AgentType): Promise<Agent[]>;
  findAll(): Promise<Agent[]>;

  getLoad(): Promise<AgentLoad[]>;
}
```

## Invariants

1. **Single Owner**: A claim can only have one claimant at a time
2. **Valid Transitions**: Status can only change according to TRANSITIONS map
3. **Progress Range**: Progress must be 0-100
4. **Handoff Acceptance**: Only the target claimant can accept a handoff
5. **Completed is Terminal**: Completed claims cannot change status
