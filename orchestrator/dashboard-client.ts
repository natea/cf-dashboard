// dashboard/orchestrator/dashboard-client.ts
// Dashboard client for communication with the Claims Dashboard server

import type { Claim, ClaimStatus, AgentClaimant } from "../server/domain/types";
import type {
  DashboardConfig,
  ClaimFilter,
  WsMessage,
  Logger,
  Unsubscribe,
} from "./types";
import { consoleLogger } from "./types";

// Default configuration values
const DEFAULT_WS_PATH = "/ws";
const DEFAULT_RECONNECT_INTERVAL = 1000; // 1 second
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

/**
 * Dashboard client for communicating with the Claims Dashboard server.
 * Handles both WebSocket (real-time events) and HTTP (REST API) communication.
 */
export class DashboardClient {
  private readonly config: Required<DashboardConfig>;
  private readonly logger: Logger;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private subscribers: Set<(msg: WsMessage) => void> = new Set();
  private intentionalClose = false;

  constructor(config: DashboardConfig, logger: Logger = consoleLogger) {
    this.config = {
      url: config.url,
      wsPath: config.wsPath ?? DEFAULT_WS_PATH,
      apiKey: config.apiKey ?? "",
      reconnectInterval: config.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
      maxReconnectAttempts:
        config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    };
    this.logger = logger;
  }

  /**
   * Establish WebSocket connection to the dashboard server.
   * Resolves when connection is established, rejects on failure.
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.logger.debug("WebSocket already connected");
      return;
    }

    this.intentionalClose = false;

    return new Promise((resolve, reject) => {
      const wsUrl = this.buildWsUrl();
      this.logger.info(`Connecting to WebSocket at ${wsUrl}`);

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (error) {
        reject(new Error(`Failed to create WebSocket: ${error}`));
        return;
      }

      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.close();
          reject(new Error("WebSocket connection timeout"));
        }
      }, 10000); // 10 second timeout

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.reconnectAttempts = 0;
        this.logger.info("WebSocket connected");
        resolve();
      };

      this.ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        this.logger.error("WebSocket error", event);
        // Don't reject here - onclose will handle reconnection
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.logger.info(
          `WebSocket closed: code=${event.code}, reason=${event.reason}`
        );

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }

        // Reject if this was the initial connection attempt
        if (this.reconnectAttempts === 0 && !this.intentionalClose) {
          reject(new Error(`WebSocket connection failed: ${event.reason}`));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleWsMessage(event);
      };
    });
  }

  /**
   * Close the WebSocket connection gracefully.
   */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.logger.info("Disconnecting WebSocket");
      this.ws.close(1000, "Client disconnecting");
      this.ws = null;
    }
  }

  /**
   * Check if the WebSocket connection is currently open.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to WebSocket messages.
   * Returns an unsubscribe function.
   */
  subscribe(callback: (msg: WsMessage) => void): Unsubscribe {
    this.subscribers.add(callback);
    this.logger.debug("Subscriber added", { count: this.subscribers.size });

    return () => {
      this.subscribers.delete(callback);
      this.logger.debug("Subscriber removed", { count: this.subscribers.size });
    };
  }

  /**
   * Fetch claims from the dashboard server with optional filtering.
   */
  async fetchClaims(filter?: ClaimFilter): Promise<Claim[]> {
    const params = new URLSearchParams();

    if (filter?.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      statuses.forEach((s) => params.append("status", s));
    }
    if (filter?.claimant) {
      params.set("claimant", filter.claimant);
    }
    if (filter?.source) {
      params.set("source", filter.source);
    }

    const queryString = params.toString();
    const url = `${this.config.url}/api/claims${queryString ? `?${queryString}` : ""}`;

    this.logger.debug(`Fetching claims: ${url}`);

    const response = await this.httpRequest<{ claims: Claim[] }>(url, {
      method: "GET",
    });

    return this.parseDates(response.claims);
  }

  /**
   * Fetch a single claim by ID.
   * Returns null if not found.
   */
  async fetchClaim(id: string): Promise<Claim | null> {
    const url = `${this.config.url}/api/claims/${encodeURIComponent(id)}`;

    this.logger.debug(`Fetching claim: ${url}`);

    try {
      // API returns claim directly, not wrapped in { claim: ... }
      const response = await this.httpRequest<Claim>(url, {
        method: "GET",
      });
      return this.parseClaimDates(response);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Claim an issue by ID with an agent claimant.
   */
  async claimIssue(issueId: string, claimant: AgentClaimant): Promise<Claim> {
    const url = `${this.config.url}/api/claims/${encodeURIComponent(issueId)}/claim`;

    this.logger.debug(`Claiming issue: ${issueId} for agent ${claimant.agentId} (${claimant.agentType})`);

    // API returns claim directly, not wrapped in { claim: ... }
    const response = await this.httpRequest<Claim>(url, {
      method: "POST",
      body: JSON.stringify({ claimant }),
    });

    return this.parseClaimDates(response);
  }

  /**
   * Update the status and optionally progress of a claim.
   */
  async updateClaimStatus(
    id: string,
    status: ClaimStatus,
    progress?: number
  ): Promise<Claim> {
    const url = `${this.config.url}/api/claims/${encodeURIComponent(id)}`;

    this.logger.debug(`Updating claim ${id}: status=${status}, progress=${progress}`);

    const body: Record<string, unknown> = { status };
    if (progress !== undefined) {
      body.progress = progress;
    }

    // API returns claim directly, not wrapped in { claim: ... }
    const response = await this.httpRequest<Claim>(url, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return this.parseClaimDates(response);
  }

  /**
   * Release a claim, making it available for others.
   */
  async releaseClaim(id: string): Promise<void> {
    const url = `${this.config.url}/api/claims/${encodeURIComponent(id)}/release`;

    this.logger.debug(`Releasing claim: ${id}`);

    await this.httpRequest<void>(url, {
      method: "POST",
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildWsUrl(): string {
    const baseUrl = new URL(this.config.url);
    const protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = new URL(this.config.wsPath, `${protocol}//${baseUrl.host}`);

    if (this.config.apiKey) {
      wsUrl.searchParams.set("apiKey", this.config.apiKey);
    }

    return wsUrl.toString();
  }

  private handleWsMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as WsMessage;

      // Suppress noisy pong/heartbeat messages from debug log
      if (message.type !== "pong" && message.type !== "orchestrator:heartbeat") {
        this.logger.debug(`WebSocket message received: ${message.type}`);
      }

      // Notify all subscribers
      for (const callback of this.subscribers) {
        try {
          callback(message);
        } catch (error) {
          this.logger.error("Subscriber callback error", error);
        }
      }
    } catch (error) {
      this.logger.error("Failed to parse WebSocket message", error, event.data);
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error(
        `Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`
      );
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
    const delay = Math.min(baseDelay + jitter, MAX_RECONNECT_DELAY);

    this.reconnectAttempts++;
    this.logger.info(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${Math.round(delay)}ms`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch (error) {
        this.logger.error("Reconnect failed", error);
        // scheduleReconnect will be called again from onclose handler
      }
    }, delay);
  }

  private async httpRequest<T>(
    url: string,
    options: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.config.apiKey) {
      headers["X-Auth-Token"] = this.config.apiKey;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    // Handle empty responses (like 204 No Content)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private parseDates(claims: Claim[]): Claim[] {
    return claims.map((claim) => this.parseClaimDates(claim));
  }

  private parseClaimDates(claim: Claim): Claim {
    return {
      ...claim,
      createdAt: new Date(claim.createdAt),
      updatedAt: new Date(claim.updatedAt),
    };
  }
}

/**
 * Custom error class for HTTP request failures.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}
