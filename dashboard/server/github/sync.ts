// dashboard/server/github/sync.ts
import type { ClaimsStorage } from "../storage/interface";

export interface GitHubConfig {
  owner: string;
  repo: string;
  token?: string;
  labels?: string[];
  pollInterval: number; // seconds
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  state: string;
}

export class GitHubSync {
  private config: GitHubConfig;
  private storage: ClaimsStorage;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: GitHubConfig, storage: ClaimsStorage) {
    this.config = config;
    this.storage = storage;
  }

  async syncOnce(): Promise<number> {
    const issues = await this.fetchIssues();
    let synced = 0;

    for (const issue of issues) {
      const issueId = `gh-${issue.number}`;
      const existing = await this.storage.getClaim(issueId);

      if (!existing) {
        // Create new claim from GitHub issue
        await this.storage.createClaim({
          issueId,
          source: "github",
          sourceRef: issue.html_url,
          title: issue.title,
          description: issue.body || undefined,
          status: "backlog",
          progress: 0,
          metadata: {
            githubId: issue.id,
            githubNumber: issue.number,
            labels: issue.labels.map((l) => l.name),
            author: issue.user?.login,
          },
        });
        synced++;
        console.log(`Synced GitHub issue #${issue.number}: ${issue.title}`);
      }
    }

    return synced;
  }

  private async fetchIssues(): Promise<GitHubIssue[]> {
    const { owner, repo, token, labels } = this.config;

    const params = new URLSearchParams({
      state: "open",
      per_page: "100",
    });

    if (labels && labels.length > 0) {
      params.set("labels", labels.join(","));
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/issues?${params}`;

    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "claims-dashboard",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const issues = await response.json();

    // Filter out pull requests (they have a pull_request key)
    return issues.filter((issue: any) => !issue.pull_request);
  }

  start(): void {
    if (this.intervalId) {
      console.log("GitHub sync already running");
      return;
    }

    console.log(`Starting GitHub sync (every ${this.config.pollInterval}s)`);

    // Sync immediately on start
    this.syncOnce().catch((err) => console.error("GitHub sync error:", err));

    // Then poll at interval
    this.intervalId = setInterval(() => {
      this.syncOnce().catch((err) => console.error("GitHub sync error:", err));
    }, this.config.pollInterval * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("GitHub sync stopped");
    }
  }
}
