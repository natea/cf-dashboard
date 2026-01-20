# Claims Dashboard Implementation Plan (Superpowers Method)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Planning Method:** `superpowers:writing-plans` - TDD-focused, bite-sized tasks, frequent commits

**Goal:** Build a real-time Kanban dashboard for Claude Flow claims with WebSocket updates, drag-drop, and GitHub integration.

**Architecture:** Bun server with Hono for REST/WebSocket, React frontend with Zustand state management, Postgres for persistence with NOTIFY for real-time events. Storage adapter pattern supports both SQLite (dev) and RuVector/Postgres (prod).

**Tech Stack:** Bun, Hono, React 18, Vite, Zustand, @hello-pangea/dnd, postgres.js, Tailwind CSS, Docker Compose

---

## Phase 1: Project Foundation

### Task 1: Initialize Project Structure

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/bunfig.toml`
- Create: `dashboard/tsconfig.json`
- Create: `dashboard/.gitignore`

**Step 1: Create dashboard directory and initialize**

```bash
mkdir -p dashboard
cd dashboard
```

**Step 2: Create package.json**

```json
{
  "name": "claims-dashboard",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch server/index.ts",
    "dev:client": "vite",
    "build": "vite build && bun build server/index.ts --outdir=dist/server",
    "start": "bun run dist/server/index.js",
    "test": "bun test",
    "db:migrate": "bun run server/db/migrate.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "postgres": "^3.4.0",
    "zod": "^3.22.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.3.0"
  }
}
```

**Step 3: Create bunfig.toml**

```toml
[install]
peer = false

[test]
coverage = true
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["bun-types"]
  },
  "include": ["server/**/*", "src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

**Step 6: Install dependencies**

Run: `cd dashboard && bun install`
Expected: Dependencies installed successfully

**Step 7: Commit**

```bash
git add dashboard/
git commit -m "feat: initialize dashboard project structure"
```

---

### Task 2: Create Domain Types

**Files:**
- Create: `dashboard/server/domain/types.ts`
- Create: `dashboard/server/domain/types.test.ts`

**Step 1: Write the failing test for Claimant parsing**

```typescript
// dashboard/server/domain/types.test.ts
import { describe, expect, test } from "bun:test";
import { parseClaimant, serializeClaimant, type Claimant } from "./types";

describe("Claimant", () => {
  test("parses human claimant string", () => {
    const result = parseClaimant("human:user-1:Nate");
    expect(result).toEqual({
      type: "human",
      userId: "user-1",
      name: "Nate",
    });
  });

  test("parses agent claimant string", () => {
    const result = parseClaimant("agent:coder-1:coder");
    expect(result).toEqual({
      type: "agent",
      agentId: "coder-1",
      agentType: "coder",
    });
  });

  test("serializes human claimant", () => {
    const claimant: Claimant = { type: "human", userId: "user-1", name: "Nate" };
    expect(serializeClaimant(claimant)).toBe("human:user-1:Nate");
  });

  test("serializes agent claimant", () => {
    const claimant: Claimant = { type: "agent", agentId: "coder-1", agentType: "coder" };
    expect(serializeClaimant(claimant)).toBe("agent:coder-1:coder");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd dashboard && bun test server/domain/types.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// dashboard/server/domain/types.ts
export type ClaimStatus =
  | "backlog"
  | "active"
  | "paused"
  | "blocked"
  | "review-requested"
  | "completed";

export type ClaimSource = "github" | "manual" | "mcp";

export type AgentType =
  | "coder"
  | "researcher"
  | "tester"
  | "reviewer"
  | "architect"
  | "debugger";

export interface HumanClaimant {
  type: "human";
  userId: string;
  name: string;
}

export interface AgentClaimant {
  type: "agent";
  agentId: string;
  agentType: AgentType | string;
}

export type Claimant = HumanClaimant | AgentClaimant;

export interface Claim {
  id: string;
  issueId: string;
  source: ClaimSource;
  sourceRef?: string;
  title: string;
  description?: string;
  status: ClaimStatus;
  claimant?: Claimant;
  progress: number;
  context?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function parseClaimant(s: string): Claimant {
  const [type, id, name] = s.split(":");
  if (type === "human") {
    return { type: "human", userId: id, name };
  }
  return { type: "agent", agentId: id, agentType: name };
}

export function serializeClaimant(c: Claimant): string {
  if (c.type === "human") {
    return `human:${c.userId}:${c.name}`;
  }
  return `agent:${c.agentId}:${c.agentType}`;
}
```

**Step 4: Run test to verify it passes**

Run: `cd dashboard && bun test server/domain/types.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add dashboard/server/domain/
git commit -m "feat: add domain types with claimant parsing"
```

---

### Task 3: Create Storage Interface

**Files:**
- Create: `dashboard/server/storage/interface.ts`
- Create: `dashboard/server/storage/memory.ts`
- Create: `dashboard/server/storage/memory.test.ts`

**Step 1: Write the storage interface**

```typescript
// dashboard/server/storage/interface.ts
import type { Claim, ClaimStatus } from "../domain/types";

export interface ClaimFilter {
  status?: ClaimStatus;
  source?: string;
  claimantType?: "human" | "agent";
}

export interface ClaimEvent {
  type: "created" | "updated" | "deleted";
  claim: Claim;
  changes?: Partial<Claim>;
}

export type Unsubscribe = () => void;

export interface ClaimsStorage {
  getClaim(issueId: string): Promise<Claim | null>;
  listClaims(filter?: ClaimFilter): Promise<Claim[]>;
  createClaim(claim: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim>;
  updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null>;
  deleteClaim(issueId: string): Promise<boolean>;
  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe;
}
```

**Step 2: Write failing test for memory storage**

```typescript
// dashboard/server/storage/memory.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { MemoryStorage } from "./memory";
import type { ClaimEvent } from "./interface";

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  test("creates and retrieves a claim", async () => {
    const claim = await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test Issue",
      status: "backlog",
      progress: 0,
    });

    expect(claim.id).toBeDefined();
    expect(claim.issueId).toBe("TEST-001");

    const retrieved = await storage.getClaim("TEST-001");
    expect(retrieved).toEqual(claim);
  });

  test("lists claims with filter", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test 1",
      status: "backlog",
      progress: 0,
    });
    await storage.createClaim({
      issueId: "TEST-002",
      source: "github",
      title: "Test 2",
      status: "active",
      progress: 50,
    });

    const all = await storage.listClaims();
    expect(all).toHaveLength(2);

    const backlog = await storage.listClaims({ status: "backlog" });
    expect(backlog).toHaveLength(1);
    expect(backlog[0].issueId).toBe("TEST-001");
  });

  test("updates a claim", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const updated = await storage.updateClaim("TEST-001", {
      status: "active",
      progress: 25,
    });

    expect(updated?.status).toBe("active");
    expect(updated?.progress).toBe(25);
  });

  test("emits events on changes", async () => {
    const events: ClaimEvent[] = [];
    storage.subscribe((e) => events.push(e));

    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("created");
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd dashboard && bun test server/storage/memory.test.ts`
Expected: FAIL with "Cannot find module"

**Step 4: Write minimal implementation**

```typescript
// dashboard/server/storage/memory.ts
import { nanoid } from "nanoid";
import type { Claim } from "../domain/types";
import type { ClaimsStorage, ClaimFilter, ClaimEvent, Unsubscribe } from "./interface";

export class MemoryStorage implements ClaimsStorage {
  private claims = new Map<string, Claim>();
  private listeners = new Set<(event: ClaimEvent) => void>();

  async getClaim(issueId: string): Promise<Claim | null> {
    return this.claims.get(issueId) ?? null;
  }

  async listClaims(filter?: ClaimFilter): Promise<Claim[]> {
    let claims = Array.from(this.claims.values());

    if (filter?.status) {
      claims = claims.filter((c) => c.status === filter.status);
    }
    if (filter?.source) {
      claims = claims.filter((c) => c.source === filter.source);
    }
    if (filter?.claimantType) {
      claims = claims.filter((c) => c.claimant?.type === filter.claimantType);
    }

    return claims;
  }

  async createClaim(data: Omit<Claim, "id" | "createdAt" | "updatedAt">): Promise<Claim> {
    const now = new Date();
    const claim: Claim = {
      ...data,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    };

    this.claims.set(claim.issueId, claim);
    this.emit({ type: "created", claim });
    return claim;
  }

  async updateClaim(issueId: string, updates: Partial<Claim>): Promise<Claim | null> {
    const existing = this.claims.get(issueId);
    if (!existing) return null;

    const updated: Claim = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.claims.set(issueId, updated);
    this.emit({ type: "updated", claim: updated, changes: updates });
    return updated;
  }

  async deleteClaim(issueId: string): Promise<boolean> {
    const existing = this.claims.get(issueId);
    if (!existing) return false;

    this.claims.delete(issueId);
    this.emit({ type: "deleted", claim: existing });
    return true;
  }

  subscribe(callback: (event: ClaimEvent) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: ClaimEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd dashboard && bun test server/storage/memory.test.ts`
Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add dashboard/server/storage/
git commit -m "feat: add storage interface and memory implementation"
```

---

### Task 4: Create REST API Routes

**Files:**
- Create: `dashboard/server/routes/claims.ts`
- Create: `dashboard/server/routes/claims.test.ts`

**Step 1: Write failing test for claims API**

```typescript
// dashboard/server/routes/claims.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { claimsRoutes } from "./claims";
import { MemoryStorage } from "../storage/memory";

describe("Claims API", () => {
  let app: Hono;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    app = new Hono();
    app.route("/claims", claimsRoutes(storage));
  });

  test("GET /claims returns empty list", async () => {
    const res = await app.request("/claims");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.claims).toEqual([]);
  });

  test("POST /claims creates a claim", async () => {
    const res = await app.request("/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId: "TEST-001",
        title: "Test Issue",
        source: "manual",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.claim.issueId).toBe("TEST-001");
    expect(data.claim.status).toBe("backlog");
  });

  test("PATCH /claims/:issueId updates status", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await app.request("/claims/TEST-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active", progress: 25 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.claim.status).toBe("active");
  });

  test("DELETE /claims/:issueId removes claim", async () => {
    await storage.createClaim({
      issueId: "TEST-001",
      source: "manual",
      title: "Test",
      status: "backlog",
      progress: 0,
    });

    const res = await app.request("/claims/TEST-001", { method: "DELETE" });
    expect(res.status).toBe(200);

    const check = await storage.getClaim("TEST-001");
    expect(check).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd dashboard && bun test server/routes/claims.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// dashboard/server/routes/claims.ts
import { Hono } from "hono";
import { z } from "zod";
import type { ClaimsStorage } from "../storage/interface";

const CreateClaimSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  source: z.enum(["github", "manual", "mcp"]).default("manual"),
  sourceRef: z.string().optional(),
});

const UpdateClaimSchema = z.object({
  status: z.enum(["backlog", "active", "paused", "blocked", "review-requested", "completed"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  context: z.string().optional(),
  claimant: z.string().optional(),
});

export function claimsRoutes(storage: ClaimsStorage): Hono {
  const app = new Hono();

  // List claims
  app.get("/", async (c) => {
    const status = c.req.query("status");
    const source = c.req.query("source");

    const claims = await storage.listClaims({
      status: status as any,
      source: source as any,
    });

    return c.json({ claims });
  });

  // Get single claim
  app.get("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const claim = await storage.getClaim(issueId);

    if (!claim) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({ claim });
  });

  // Create claim
  app.post("/", async (c) => {
    const body = await c.req.json();
    const parsed = CreateClaimSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }

    const claim = await storage.createClaim({
      ...parsed.data,
      status: "backlog",
      progress: 0,
    });

    return c.json({ claim }, 201);
  });

  // Update claim
  app.patch("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const body = await c.req.json();
    const parsed = UpdateClaimSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }

    const claim = await storage.updateClaim(issueId, parsed.data);

    if (!claim) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({ claim });
  });

  // Delete claim
  app.delete("/:issueId", async (c) => {
    const issueId = c.req.param("issueId");
    const deleted = await storage.deleteClaim(issueId);

    if (!deleted) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({ success: true });
  });

  return app;
}
```

**Step 4: Run test to verify it passes**

Run: `cd dashboard && bun test server/routes/claims.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add dashboard/server/routes/
git commit -m "feat: add claims REST API routes"
```

---

### Task 5: Create Server Entry Point

**Files:**
- Create: `dashboard/server/index.ts`

**Step 1: Create server entry point**

```typescript
// dashboard/server/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { claimsRoutes } from "./routes/claims";
import { MemoryStorage } from "./storage/memory";

const app = new Hono();
const storage = new MemoryStorage();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// API routes
app.route("/api/claims", claimsRoutes(storage));

// Start server
const port = parseInt(process.env.PORT || "3000");
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
```

**Step 2: Test server starts**

Run: `cd dashboard && bun run dev`
Expected: "Server running on http://localhost:3000"

**Step 3: Test health endpoint**

Run: `curl http://localhost:3000/health`
Expected: `{"status":"ok"}`

**Step 4: Commit**

```bash
git add dashboard/server/index.ts
git commit -m "feat: add server entry point with health check"
```

---

## Phase 2: WebSocket Real-time

### Task 6: Create WebSocket Hub

**Files:**
- Create: `dashboard/server/ws/hub.ts`
- Create: `dashboard/server/ws/hub.test.ts`

**Step 1: Write failing test for WebSocket hub**

```typescript
// dashboard/server/ws/hub.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import { WebSocketHub } from "./hub";

describe("WebSocketHub", () => {
  let hub: WebSocketHub;

  beforeEach(() => {
    hub = new WebSocketHub();
  });

  test("tracks connected clients", () => {
    const mockWs = { send: () => {}, readyState: 1 } as any;
    hub.addClient("client-1", mockWs);

    expect(hub.getClientCount()).toBe(1);

    hub.removeClient("client-1");
    expect(hub.getClientCount()).toBe(0);
  });

  test("broadcasts to all clients", () => {
    const messages: string[] = [];
    const mockWs = {
      send: (msg: string) => messages.push(msg),
      readyState: 1,
    } as any;

    hub.addClient("client-1", mockWs);
    hub.broadcast({ type: "test", data: "hello" });

    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ type: "test", data: "hello" });
  });

  test("manages room subscriptions", () => {
    const messages: string[] = [];
    const mockWs = {
      send: (msg: string) => messages.push(msg),
      readyState: 1,
    } as any;

    hub.addClient("client-1", mockWs);
    hub.joinRoom("client-1", "board");
    hub.broadcastToRoom("board", { type: "update" });

    expect(messages).toHaveLength(1);

    hub.leaveRoom("client-1", "board");
    hub.broadcastToRoom("board", { type: "update2" });

    expect(messages).toHaveLength(1); // No new message
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd dashboard && bun test server/ws/hub.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// dashboard/server/ws/hub.ts
import type { ServerWebSocket } from "bun";

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export class WebSocketHub {
  private clients = new Map<string, ServerWebSocket<unknown>>();
  private rooms = new Map<string, Set<string>>();
  private clientRooms = new Map<string, Set<string>>();

  addClient(clientId: string, ws: ServerWebSocket<unknown>): void {
    this.clients.set(clientId, ws);
    this.clientRooms.set(clientId, new Set());
  }

  removeClient(clientId: string): void {
    // Leave all rooms
    const rooms = this.clientRooms.get(clientId);
    if (rooms) {
      for (const room of rooms) {
        this.leaveRoom(clientId, room);
      }
    }
    this.clients.delete(clientId);
    this.clientRooms.delete(clientId);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  joinRoom(clientId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);
    this.clientRooms.get(clientId)?.add(room);
  }

  leaveRoom(clientId: string, room: string): void {
    this.rooms.get(room)?.delete(clientId);
    this.clientRooms.get(clientId)?.delete(room);
  }

  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.clients.values()) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  broadcastToRoom(room: string, message: WSMessage): void {
    const data = JSON.stringify(message);
    const clientIds = this.rooms.get(room);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  sendTo(clientId: string, message: WSMessage): void {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd dashboard && bun test server/ws/hub.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add dashboard/server/ws/
git commit -m "feat: add WebSocket hub with room support"
```

---

### Task 7: Integrate WebSocket with Server

**Files:**
- Modify: `dashboard/server/index.ts`

**Step 1: Update server to support WebSocket**

```typescript
// dashboard/server/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { claimsRoutes } from "./routes/claims";
import { MemoryStorage } from "./storage/memory";
import { WebSocketHub } from "./ws/hub";

const app = new Hono();
const storage = new MemoryStorage();
const wsHub = new WebSocketHub();

// Subscribe to storage events and broadcast
storage.subscribe((event) => {
  wsHub.broadcastToRoom("board", {
    type: `claim.${event.type}`,
    claim: event.claim,
    changes: event.changes,
  });
});

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", clients: wsHub.getClientCount() }));

// API routes
app.route("/api/claims", claimsRoutes(storage));

// Start server with WebSocket support
const port = parseInt(process.env.PORT || "3000");
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  websocket: {
    open(ws) {
      const clientId = nanoid();
      ws.data = { clientId };
      wsHub.addClient(clientId, ws);
      console.log(`Client connected: ${clientId}`);
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());
        const clientId = (ws.data as any).clientId;

        switch (data.action) {
          case "subscribe":
            for (const room of data.rooms || []) {
              wsHub.joinRoom(clientId, room);
            }
            break;
          case "unsubscribe":
            for (const room of data.rooms || []) {
              wsHub.leaveRoom(clientId, room);
            }
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
        }
      } catch (e) {
        console.error("Invalid WS message:", e);
      }
    },
    close(ws) {
      const clientId = (ws.data as any)?.clientId;
      if (clientId) {
        wsHub.removeClient(clientId);
        console.log(`Client disconnected: ${clientId}`);
      }
    },
  },
};
```

**Step 2: Test WebSocket connection manually**

Run: `cd dashboard && bun run dev`
Then in another terminal:
```bash
# Install wscat if needed: npm install -g wscat
wscat -c ws://localhost:3000
> {"action":"subscribe","rooms":["board"]}
> {"action":"ping"}
< {"type":"pong"}
```

**Step 3: Commit**

```bash
git add dashboard/server/index.ts
git commit -m "feat: integrate WebSocket with real-time claim events"
```

---

## Phase 3: React Frontend

### Task 8: Initialize React with Vite

**Files:**
- Create: `dashboard/vite.config.ts`
- Create: `dashboard/index.html`
- Create: `dashboard/src/main.tsx`
- Create: `dashboard/src/App.tsx`
- Modify: `dashboard/package.json`

**Step 1: Add React dependencies to package.json**

Add to dependencies:
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "@hello-pangea/dnd": "^16.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

Run: `cd dashboard && bun install`

**Step 2: Create vite.config.ts**

```typescript
// dashboard/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
```

**Step 3: Create index.html**

```html
<!-- dashboard/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claims Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 4: Create main.tsx**

```typescript
// dashboard/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 5: Create App.tsx**

```typescript
// dashboard/src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-gray-900">Claims Dashboard</h1>
      <p className="mt-2 text-gray-600">Real-time Kanban board coming soon...</p>
    </div>
  );
}
```

**Step 6: Create Tailwind config**

```typescript
// dashboard/tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

```css
/* dashboard/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 7: Test frontend runs**

Run: `cd dashboard && bun run dev:client`
Open: http://localhost:5173
Expected: See "Claims Dashboard" heading

**Step 8: Commit**

```bash
git add dashboard/
git commit -m "feat: initialize React frontend with Vite and Tailwind"
```

---

### Task 9: Create Zustand Claims Store

**Files:**
- Create: `dashboard/src/stores/claims.ts`
- Create: `dashboard/src/lib/types.ts`

**Step 1: Create shared types**

```typescript
// dashboard/src/lib/types.ts
export type ClaimStatus =
  | "backlog"
  | "active"
  | "paused"
  | "blocked"
  | "review-requested"
  | "completed";

export type ClaimSource = "github" | "manual" | "mcp";

export interface Claimant {
  type: "human" | "agent";
  userId?: string;
  name?: string;
  agentId?: string;
  agentType?: string;
}

export interface Claim {
  id: string;
  issueId: string;
  source: ClaimSource;
  sourceRef?: string;
  title: string;
  description?: string;
  status: ClaimStatus;
  claimant?: Claimant;
  progress: number;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

export type ColumnId = "backlog" | "agent_working" | "human_review" | "revision" | "done";

export interface Column {
  id: ColumnId;
  label: string;
  color: string;
}

export const COLUMNS: Column[] = [
  { id: "backlog", label: "Backlog", color: "#6B7280" },
  { id: "agent_working", label: "Agent Working", color: "#3B82F6" },
  { id: "human_review", label: "Human Review", color: "#F59E0B" },
  { id: "revision", label: "Agent Revision", color: "#F97316" },
  { id: "done", label: "Done", color: "#10B981" },
];
```

**Step 2: Create claims store**

```typescript
// dashboard/src/stores/claims.ts
import { create } from "zustand";
import type { Claim, ClaimStatus, ColumnId } from "../lib/types";

interface ClaimsState {
  claims: Map<string, Claim>;
  loading: boolean;
  error: string | null;

  // Actions
  setClaims: (claims: Claim[]) => void;
  addClaim: (claim: Claim) => void;
  updateClaim: (claim: Claim) => void;
  removeClaim: (issueId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selectors
  getByColumn: (column: ColumnId) => Claim[];
  getByIssueId: (issueId: string) => Claim | undefined;
}

function mapStatusToColumn(claim: Claim): ColumnId {
  if (claim.status === "completed") return "done";

  if (claim.status === "review-requested") return "human_review";
  if (claim.claimant?.type === "human" && claim.status === "active") {
    return "human_review";
  }

  if (claim.status === "backlog" && !claim.claimant) return "backlog";

  if (claim.claimant?.type === "agent") {
    // TODO: Check metadata.postReview for revision column
    return "agent_working";
  }

  return "agent_working";
}

export const useClaimsStore = create<ClaimsState>((set, get) => ({
  claims: new Map(),
  loading: true,
  error: null,

  setClaims: (claims) =>
    set({
      claims: new Map(claims.map((c) => [c.issueId, c])),
      loading: false,
    }),

  addClaim: (claim) =>
    set((state) => {
      const next = new Map(state.claims);
      next.set(claim.issueId, claim);
      return { claims: next };
    }),

  updateClaim: (claim) =>
    set((state) => {
      const next = new Map(state.claims);
      next.set(claim.issueId, claim);
      return { claims: next };
    }),

  removeClaim: (issueId) =>
    set((state) => {
      const next = new Map(state.claims);
      next.delete(issueId);
      return { claims: next };
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getByColumn: (column) => {
    const claims = Array.from(get().claims.values());
    return claims.filter((c) => mapStatusToColumn(c) === column);
  },

  getByIssueId: (issueId) => get().claims.get(issueId),
}));
```

**Step 3: Commit**

```bash
git add dashboard/src/
git commit -m "feat: add Zustand claims store with column mapping"
```

---

### Task 10: Create Kanban Board Components

**Files:**
- Create: `dashboard/src/components/Board/Board.tsx`
- Create: `dashboard/src/components/Board/Column.tsx`
- Create: `dashboard/src/components/Board/ClaimCard.tsx`

**Step 1: Create ClaimCard component**

```typescript
// dashboard/src/components/Board/ClaimCard.tsx
import { Draggable } from "@hello-pangea/dnd";
import type { Claim } from "../../lib/types";

interface ClaimCardProps {
  claim: Claim;
  index: number;
}

export function ClaimCard({ claim, index }: ClaimCardProps) {
  return (
    <Draggable draggableId={claim.issueId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`
            bg-white rounded-lg shadow-sm border p-4 mb-3
            ${snapshot.isDragging ? "shadow-lg ring-2 ring-blue-400" : ""}
          `}
        >
          <div className="flex items-start justify-between">
            <h3 className="font-medium text-gray-900 text-sm">{claim.title}</h3>
            <span className="text-xs text-gray-500">{claim.issueId}</span>
          </div>

          {claim.description && (
            <p className="mt-1 text-xs text-gray-600 line-clamp-2">
              {claim.description}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            {/* Progress bar */}
            {claim.progress > 0 && (
              <div className="flex-1 mr-3">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${claim.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Claimant badge */}
            {claim.claimant && (
              <span
                className={`
                  text-xs px-2 py-0.5 rounded-full
                  ${claim.claimant.type === "human"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                  }
                `}
              >
                {claim.claimant.type === "human"
                  ? claim.claimant.name
                  : claim.claimant.agentType}
              </span>
            )}

            {/* Source badge */}
            <span className="text-xs text-gray-400 ml-2">{claim.source}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
```

**Step 2: Create Column component**

```typescript
// dashboard/src/components/Board/Column.tsx
import { Droppable } from "@hello-pangea/dnd";
import type { Claim, Column as ColumnType } from "../../lib/types";
import { ClaimCard } from "./ClaimCard";

interface ColumnProps {
  column: ColumnType;
  claims: Claim[];
}

export function Column({ column, claims }: ColumnProps) {
  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      <div
        className="flex items-center gap-2 mb-4 px-2"
        style={{ borderLeftColor: column.color, borderLeftWidth: 4 }}
      >
        <h2 className="font-semibold text-gray-900">{column.label}</h2>
        <span className="text-sm text-gray-500">({claims.length})</span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`
              min-h-[200px] p-2 rounded-lg transition-colors
              ${snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-50"}
            `}
          >
            {claims.map((claim, index) => (
              <ClaimCard key={claim.issueId} claim={claim} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
```

**Step 3: Create Board component**

```typescript
// dashboard/src/components/Board/Board.tsx
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useClaimsStore } from "../../stores/claims";
import { COLUMNS } from "../../lib/types";
import { Column } from "./Column";

export function Board() {
  const { getByColumn, loading, error } = useClaimsStore();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const targetColumn = destination.droppableId;

    console.log(`Move ${draggableId} to ${targetColumn}`);
    // TODO: API call to update claim status
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        Error: {error}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 overflow-x-auto pb-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            column={column}
            claims={getByColumn(column.id)}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
```

**Step 4: Update App.tsx to use Board**

```typescript
// dashboard/src/App.tsx
import { useEffect } from "react";
import { Board } from "./components/Board/Board";
import { useClaimsStore } from "./stores/claims";

export default function App() {
  const { setClaims, setLoading, setError } = useClaimsStore();

  useEffect(() => {
    // Fetch initial claims
    fetch("/api/claims")
      .then((res) => res.json())
      .then((data) => setClaims(data.claims))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Claims Dashboard</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Board />
      </main>
    </div>
  );
}
```

**Step 5: Test the board renders**

Run both servers:
```bash
# Terminal 1
cd dashboard && bun run dev

# Terminal 2
cd dashboard && bun run dev:client
```

Open: http://localhost:5173
Expected: See 5 empty columns with headers

**Step 6: Commit**

```bash
git add dashboard/src/components/
git commit -m "feat: add Kanban board with drag-drop support"
```

---

## Remaining Tasks (Summary)

The plan continues with:

- **Task 11:** Add WebSocket hook for real-time updates
- **Task 12:** Implement drag-drop status transitions
- **Task 13:** Add Postgres storage adapter
- **Task 14:** Create Docker Compose setup
- **Task 15:** Add GitHub Issues polling
- **Task 16:** Add manual issue creation form
- **Task 17:** Add activity sidebar
- **Task 18:** Add auth with shared secret

Each follows the same TDD pattern: write failing test → implement → verify → commit.

---

**Plan complete and saved to `docs/plans/2026-01-19-claims-dashboard-superpowers-plan.md`**
