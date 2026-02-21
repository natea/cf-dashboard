// dashboard/server/github/sync.ts
import type { ClaimsStorage } from "../storage/interface";
import type {
  GitHubConfig,
  GitHubIssue,
  GitHubClaimMetadata,
  SyncResult,
  SyncStatus,
} from "./types";
import type { Claim, ClaimSource } from "../domain/types";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * GitHub issue synchronization service
 * Polls GitHub API and upserts issues to claims storage
 */
export class GitHubSyncService {
  private storage: ClaimsStorage;
  private config: GitHubConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastSync: SyncResult | null = null;

  constructor(storage: ClaimsStorage, config: GitHubConfig) {
    this.storage = storage;
    this.config = {
      ...config,
      pollInterval: config.pollInterval ?? 60,
      perPage: config.perPage ?? 100,
      includesClosed: config.includesClosed ?? false,
    };
  }

  /**
   * Start the sync service with polling
   */
  start(): void {
    if (this.intervalId) {
      console.log("[GitHubSync] Already running");
      return;
    }

    console.log(
      `[GitHubSync] Starting sync for ${this.config.owner}/${this.config.repo} every ${this.config.pollInterval}s`
    );

    // Run immediately on start
    this.sync();

    // Set up polling interval
    this.intervalId = setInterval(() => {
      this.sync();
    }, this.config.pollInterval * 1000);
  }

  /**
   * Stop the sync service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[GitHubSync] Stopped");
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    const nextSyncAt = this.intervalId
      ? new Date(
          Date.now() +
            (this.lastSync
              ? this.config.pollInterval * 1000 -
                (Date.now() - this.lastSync.timestamp.getTime())
              : this.config.pollInterval * 1000)
        )
      : null;

    return {
      isRunning: this.isRunning,
      lastSync: this.lastSync,
      nextSyncAt,
      config: {
        owner: this.config.owner,
        repo: this.config.repo,
        labels: this.config.labels,
        pollInterval: this.config.pollInterval,
        includesClosed: this.config.includesClosed,
        perPage: this.config.perPage,
        hasToken: !!this.config.token,
      },
    };
  }

  /**
   * Perform a single sync operation
   */
  async sync(): Promise<SyncResult> {
    if (this.isRunning) {
      console.log("[GitHubSync] Sync already in progress, skipping");
      return {
        success: false,
        timestamp: new Date(),
        issuesFound: 0,
        issuesCreated: 0,
        issuesUpdated: 0,
        errors: ["Sync already in progress"],
      };
    }

    this.isRunning = true;
    const result: SyncResult = {
      success: true,
      timestamp: new Date(),
      issuesFound: 0,
      issuesCreated: 0,
      issuesUpdated: 0,
      errors: [],
    };

    try {
      console.log(
        `[GitHubSync] Fetching issues from ${this.config.owner}/${this.config.repo}`
      );

      const issues = await this.fetchIssues();
      result.issuesFound = issues.length;

      console.log(`[GitHubSync] Found ${issues.length} issues`);

      for (const issue of issues) {
        try {
          const upsertResult = await this.upsertIssue(issue);
          if (upsertResult === "created") {
            result.issuesCreated++;
          } else if (upsertResult === "updated") {
            result.issuesUpdated++;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[GitHubSync] Error syncing issue #${issue.number}:`, message);
          result.errors.push(`Issue #${issue.number}: ${message}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }
    } catch (error) {
      result.success = false;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(message);
      console.error("[GitHubSync] Sync failed:", message);
    } finally {
      this.isRunning = false;
      this.lastSync = result;
    }

    console.log(
      `[GitHubSync] Sync complete: ${result.issuesCreated} created, ${result.issuesUpdated} updated, ${result.errors.length} errors`
    );

    return result;
  }

  /**
   * Fetch issues from GitHub API
   */
  private async fetchIssues(): Promise<GitHubIssue[]> {
    const params = new URLSearchParams({
      state: this.config.includesClosed ? "all" : "open",
      per_page: String(this.config.perPage ?? 100),
      sort: "updated",
      direction: "desc",
    });

    if (this.config.labels && this.config.labels.length > 0) {
      params.set("labels", this.config.labels.join(","));
    }

    const url = `${GITHUB_API_BASE}/repos/${this.config.owner}/${this.config.repo}/issues?${params}`;

    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "claims-dashboard",
    };

    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }

    const response = await fetch(url, { headers });

    // Track rate limits
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");

    if (rateLimitRemaining) {
      const remaining = parseInt(rateLimitRemaining, 10);
      if (remaining < 10) {
        console.warn(
          `[GitHubSync] Rate limit low: ${remaining} requests remaining`
        );
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("GitHub authentication failed - check your token");
      }
      if (response.status === 403 && rateLimitRemaining === "0") {
        const resetTime = rateLimitReset
          ? new Date(parseInt(rateLimitReset, 10) * 1000)
          : null;
        throw new Error(
          `GitHub rate limit exceeded. Resets at ${resetTime?.toISOString() ?? "unknown"}`
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Repository not found: ${this.config.owner}/${this.config.repo}`
        );
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Filter out pull requests (GitHub API returns both issues and PRs)
    return data.filter((item: GitHubIssue & { pull_request?: unknown }) => !item.pull_request);
  }

  /**
   * Upsert a GitHub issue to claims storage
   */
  private async upsertIssue(
    issue: GitHubIssue
  ): Promise<"created" | "updated" | "unchanged"> {
    const issueId = `gh-${issue.number}`;
    const existing = await this.storage.getClaim(issueId);

    const metadata: GitHubClaimMetadata = {
      githubId: issue.id,
      githubNumber: issue.number,
      labels: issue.labels.map((l) => l.name),
      author: issue.user?.login ?? null,
      assignees: issue.assignees.map((a) => a.login),
      closedAt: issue.closed_at,
    };

    const claimData: Omit<Claim, "id" | "createdAt" | "updatedAt"> = {
      issueId,
      source: "github" as ClaimSource,
      sourceRef: issue.html_url,
      title: issue.title,
      description: issue.body ?? undefined,
      status: existing?.status ?? "backlog",
      claimant: existing?.claimant,
      progress: existing?.progress ?? 0,
      context: existing?.context,
      metadata,
    };

    if (!existing) {
      await this.storage.createClaim(claimData);
      return "created";
    }

    // Only update if GitHub data changed (title, description, labels)
    const existingMeta = existing.metadata as GitHubClaimMetadata | undefined;
    const hasChanges =
      existing.title !== issue.title ||
      existing.description !== (issue.body ?? undefined) ||
      JSON.stringify(existingMeta?.labels) !== JSON.stringify(metadata.labels);

    if (hasChanges) {
      await this.storage.updateClaim(issueId, {
        title: issue.title,
        description: issue.body ?? undefined,
        metadata,
      });
      return "updated";
    }

    return "unchanged";
  }

  /**
   * Force an immediate sync (useful for webhooks or manual trigger)
   */
  async forceSync(): Promise<SyncResult> {
    return this.sync();
  }

  /**
   * Update configuration (e.g., change labels filter)
   */
  updateConfig(updates: Partial<GitHubConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log("[GitHubSync] Config updated");
  }
}

/**
 * Create GitHub sync service from environment variables
 */
export function createGitHubSyncFromEnv(
  storage: ClaimsStorage
): GitHubSyncService | null {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  console.log(`[GitHubSync] Config: owner=${owner}, repo=${repo}, hasToken=${!!token}`);

  if (!owner || !repo) {
    console.log(
      "[GitHubSync] GITHUB_OWNER and GITHUB_REPO not set, sync disabled"
    );
    return null;
  }

  const config: GitHubConfig = {
    owner,
    repo,
    token,
    labels: process.env.GITHUB_LABELS?.split(",").map((l) => l.trim()),
    pollInterval: parseInt(process.env.GITHUB_POLL_INTERVAL ?? "60", 10),
    includesClosed: process.env.GITHUB_INCLUDE_CLOSED === "true",
    perPage: parseInt(process.env.GITHUB_PER_PAGE ?? "100", 10),
  };

  return new GitHubSyncService(storage, config);
}
