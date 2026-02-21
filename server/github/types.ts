// dashboard/server/github/types.ts

/**
 * Configuration for GitHub issue synchronization
 */
export interface GitHubConfig {
  /** Repository owner (e.g., "ruvnet") */
  owner: string;
  /** Repository name (e.g., "claude-flow") */
  repo: string;
  /** GitHub API token (optional for public repos, required for private) */
  token?: string;
  /** Filter issues by these labels (e.g., ["ready", "approved"]) */
  labels?: string[];
  /** Sync interval in seconds (default: 60) */
  pollInterval: number;
  /** Include closed issues in sync (default: false) */
  includesClosed?: boolean;
  /** Maximum issues to fetch per poll (default: 100) */
  perPage?: number;
}

/**
 * GitHub issue label
 */
export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

/**
 * GitHub user (author, assignee)
 */
export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

/**
 * GitHub issue from API response
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  user: GitHubUser | null;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/**
 * GitHub API response for list issues
 */
export interface GitHubIssuesResponse {
  data: GitHubIssue[];
  headers: {
    "x-ratelimit-remaining"?: string;
    "x-ratelimit-reset"?: string;
  };
}

/**
 * Metadata stored with GitHub-sourced claims
 */
export interface GitHubClaimMetadata {
  githubId: number;
  githubNumber: number;
  labels: string[];
  author: string | null;
  assignees: string[];
  closedAt: string | null;
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

/**
 * Sync result statistics
 */
export interface SyncResult {
  success: boolean;
  timestamp: Date;
  issuesFound: number;
  issuesCreated: number;
  issuesUpdated: number;
  errors: string[];
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

/**
 * Sync status for monitoring
 */
export interface SyncStatus {
  isRunning: boolean;
  lastSync: SyncResult | null;
  nextSyncAt: Date | null;
  config: Omit<GitHubConfig, "token"> & { hasToken: boolean };
}
