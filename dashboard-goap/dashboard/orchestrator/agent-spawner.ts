// dashboard/orchestrator/agent-spawner.ts
// Agent spawner module for spawning Claude Code agents via claude-flow CLI

import { spawn, spawnSync } from "bun";
import type { Subprocess } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import type { AgentType } from "../server/domain/types";
import type {
  SpawnOptions,
  SpawnResult,
  AgentHookPayload,
  ModelTier,
  Logger,
} from "./types";
import { consoleLogger } from "./types";

// Type for Bun subprocess with piped stdout/stderr
type SpawnedProcess = Subprocess<"ignore", "pipe", "pipe">;

// ============================================================================
// Types
// ============================================================================

interface ActiveAgent {
  pid: number;
  options: SpawnOptions;
  process: SpawnedProcess;
  startedAt: Date;
  worktreePath?: string;
}

// Agent lifecycle event types
export type AgentLifecycleEvent =
  | { type: "started"; agentId: string; claimId: string; issueId: string }
  | { type: "progress"; agentId: string; claimId: string; issueId: string; progress: number }
  | { type: "completed"; agentId: string; claimId: string; issueId: string; result?: { stdout: string } }
  | { type: "failed"; agentId: string; claimId: string; issueId: string; error: string };

export type AgentLifecycleCallback = (event: AgentLifecycleEvent) => void;

interface AgentSpawnerConfig {
  dashboardUrl: string;
  workingDir?: string;
  logger?: Logger;
  useClaudeFlowCli?: boolean;
  claudeFlowPath?: string;
  onAgentLifecycle?: AgentLifecycleCallback;
  /** Use git worktrees to isolate each agent's work (recommended) */
  useWorktrees?: boolean;
  /** Remove worktrees after agent completes (default: false - keep for review) */
  cleanupWorktrees?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a short UUID for agent identification
 */
function shortUUID(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Generate a unique agent ID
 */
function generateAgentId(agentType: AgentType): string {
  return `${agentType}-${shortUUID()}`;
}

/**
 * Map model tier to claude-flow model argument
 */
function modelTierToArg(tier: ModelTier): string {
  switch (tier) {
    case "wasm":
      return "wasm";
    case "haiku":
      return "haiku";
    case "sonnet":
      return "sonnet";
    case "opus":
      return "opus";
    default:
      return "sonnet";
  }
}

/**
 * Build the task prompt for the agent
 * @param options - Spawn options
 * @param inWorktree - Whether agent is running in an isolated worktree
 */
function buildTaskPrompt(options: SpawnOptions, inWorktree: boolean): string {
  const basePrompt = options.context ?? `Work on issue ${options.issueId}`;

  // If in worktree, the branch is already set up - simplify instructions
  if (inWorktree) {
    return `Task for claim ${options.claimId}:
Issue ID: ${options.issueId}

## Git Workflow
You are in an isolated git worktree on branch issue/${options.issueId.replace(/[^a-zA-Z0-9-_]/g, "-")}.
Your changes are isolated from other agents. Just commit your work:
1. Stage your changes: git add <files>
2. Commit with a message referencing the issue: git commit -m "feat: <description> (${options.issueId})"
3. Do NOT switch branches - stay on the current branch

## Task
${basePrompt}

IMPORTANT: Report progress via HTTP hooks to the dashboard.`;
  }

  // Generate a branch name from the issue ID (sanitize for git)
  const branchName = `issue/${options.issueId.replace(/[^a-zA-Z0-9-_]/g, '-')}`;

  // Include claim and issue context in the prompt with git workflow
  return `Task for claim ${options.claimId}:
Issue ID: ${options.issueId}

## Git Workflow (REQUIRED)
Before starting any work:
1. Create and checkout a feature branch: git checkout -b ${branchName}
2. If the branch already exists: git checkout ${branchName}

After completing work:
3. Stage your changes: git add <files>
4. Commit with a message referencing the issue: git commit -m "feat: <description> (${options.issueId})"
5. Do NOT push or create PRs - just commit locally

## Task
${basePrompt}

IMPORTANT: Report progress via HTTP hooks to the dashboard.`;
}

// ============================================================================
// Git Worktree Helpers
// ============================================================================

/**
 * Get the directory where worktrees are stored
 */
function getWorktreesDir(repoDir: string): string {
  return join(repoDir, ".worktrees");
}

/**
 * Generate a safe branch name from issue ID
 */
function sanitizeBranchName(issueId: string): string {
  return `issue/${issueId.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
}

/**
 * Setup a git worktree for an issue
 * Returns the worktree path, or null if setup failed
 */
function setupWorktree(
  repoDir: string,
  issueId: string,
  logger: Logger
): string | null {
  const branchName = sanitizeBranchName(issueId);
  const worktreesDir = getWorktreesDir(repoDir);
  const worktreePath = join(worktreesDir, branchName.replace("/", "-"));

  // Ensure worktrees directory exists
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    logger.info(`Worktree already exists at ${worktreePath}`);
    return worktreePath;
  }

  // Check if branch exists
  const branchCheck = spawnSync({
    cmd: ["git", "rev-parse", "--verify", branchName],
    cwd: repoDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (branchCheck.exitCode === 0) {
    // Branch exists, create worktree from it
    logger.info(`Creating worktree from existing branch ${branchName}`);
    const result = spawnSync({
      cmd: ["git", "worktree", "add", worktreePath, branchName],
      cwd: repoDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode !== 0) {
      logger.error(`Failed to create worktree: ${result.stderr.toString()}`);
      return null;
    }
  } else {
    // Branch doesn't exist, create new branch with worktree
    logger.info(`Creating worktree with new branch ${branchName}`);
    const result = spawnSync({
      cmd: ["git", "worktree", "add", "-b", branchName, worktreePath],
      cwd: repoDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode !== 0) {
      logger.error(`Failed to create worktree: ${result.stderr.toString()}`);
      return null;
    }
  }

  logger.info(`Worktree created at ${worktreePath}`);
  return worktreePath;
}

/**
 * Remove a git worktree (but keep the branch)
 */
function removeWorktree(
  repoDir: string,
  worktreePath: string,
  logger: Logger
): void {
  if (!existsSync(worktreePath)) {
    return;
  }

  logger.info(`Removing worktree at ${worktreePath}`);
  const result = spawnSync({
    cmd: ["git", "worktree", "remove", worktreePath, "--force"],
    cwd: repoDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    logger.warn(`Failed to remove worktree: ${result.stderr.toString()}`);
  }
}

// ============================================================================
// Agent Spawner Class
// ============================================================================

export class AgentSpawner {
  private dashboardUrl: string;
  private workingDir: string;
  private logger: Logger;
  private useClaudeFlowCli: boolean;
  private claudeFlowPath: string;
  private activeAgents: Map<string, ActiveAgent> = new Map();
  private isShuttingDown = false;
  private onAgentLifecycle?: AgentLifecycleCallback;
  private useWorktrees: boolean;
  private cleanupWorktrees: boolean;

  constructor(config: AgentSpawnerConfig) {
    this.dashboardUrl = config.dashboardUrl;
    this.workingDir = config.workingDir ?? process.cwd();
    this.logger = config.logger ?? consoleLogger;
    // Default to using claude CLI directly for actual code execution
    this.useClaudeFlowCli = config.useClaudeFlowCli ?? false;
    this.claudeFlowPath = config.claudeFlowPath ?? "npx @claude-flow/cli@latest";
    this.onAgentLifecycle = config.onAgentLifecycle;
    // Worktree isolation - enabled by default for parallel agents
    this.useWorktrees = config.useWorktrees ?? true;
    // Keep worktrees by default for review
    this.cleanupWorktrees = config.cleanupWorktrees ?? false;
  }

  /**
   * Emit an agent lifecycle event to the callback if registered
   */
  private emitLifecycleEvent(event: AgentLifecycleEvent): void {
    if (this.onAgentLifecycle) {
      try {
        this.onAgentLifecycle(event);
      } catch (error) {
        this.logger.error(
          `Error in lifecycle callback: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Spawn a new agent to work on a claim
   */
  async spawn(options: SpawnOptions): Promise<SpawnResult> {
    if (this.isShuttingDown) {
      return {
        success: false,
        error: "Spawner is shutting down, cannot spawn new agents",
      };
    }

    const agentId = generateAgentId(options.agentType);
    const baseWorkingDir = options.workingDir ?? this.workingDir;
    let workingDir = baseWorkingDir;
    let worktreePath: string | undefined;

    this.logger.info(
      `Spawning agent ${agentId} (type=${options.agentType}, model=${options.modelTier})`
    );

    // Set up git worktree for isolation if enabled
    if (this.useWorktrees) {
      this.logger.info(`Setting up git worktree for issue ${options.issueId}`);
      worktreePath = setupWorktree(baseWorkingDir, options.issueId, this.logger);
      if (worktreePath) {
        workingDir = worktreePath;
        this.logger.info(`Agent will work in isolated worktree: ${worktreePath}`);
      } else {
        this.logger.warn(`Failed to create worktree, falling back to main repo`);
      }
    }

    try {
      // Send "started" hook
      await this.sendHook({
        agentId,
        claimId: options.claimId,
        issueId: options.issueId,
        event: "started",
        progress: 0,
      });

      // Build spawn command (pass worktree status for prompt customization)
      const { command, args } = this.buildSpawnCommand(agentId, options, !!worktreePath);

      this.logger.info(`Spawn command: ${command} ${args.join(" ")}`);
      this.logger.info(`Working directory: ${workingDir}`);
      this.logger.info(`Using worktree: ${worktreePath ? "yes" : "no"}`);
      this.logger.info(`Using claude CLI directly: ${!this.useClaudeFlowCli}`);

      // Spawn the process
      const proc = spawn({
        cmd: [command, ...args],
        cwd: workingDir,
        env: {
          ...process.env,
          AGENT_ID: agentId,
          CLAIM_ID: options.claimId,
          ISSUE_ID: options.issueId,
          DASHBOARD_URL: this.dashboardUrl,
          DASHBOARD_HOOK_URL: `${this.dashboardUrl}/api/hooks/agent`,
        },
        stdout: "pipe",
        stderr: "pipe",
      }) as SpawnedProcess;

      const pid = proc.pid;

      // Store active agent with worktree path
      const activeAgent: ActiveAgent = {
        pid,
        options,
        process: proc,
        startedAt: new Date(),
        worktreePath,
      };
      this.activeAgents.set(agentId, activeAgent);

      // Monitor the process asynchronously
      this.monitorProcess(agentId, proc, options);

      this.logger.info(`Agent ${agentId} spawned with PID ${pid}`);

      return {
        success: true,
        agentId,
        pid,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to spawn agent ${agentId}: ${errorMessage}`);

      // Send failure hook
      await this.sendHook({
        agentId,
        claimId: options.claimId,
        issueId: options.issueId,
        event: "failed",
        error: errorMessage,
      });

      return {
        success: false,
        agentId,
        error: errorMessage,
      };
    }
  }

  /**
   * Terminate a specific agent
   */
  async terminate(agentId: string): Promise<void> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      this.logger.warn(`Agent ${agentId} not found for termination`);
      return;
    }

    this.logger.info(`Terminating agent ${agentId} (PID ${agent.pid})`);

    try {
      // Send SIGTERM first for graceful shutdown
      agent.process.kill("SIGTERM");

      // Wait a bit for graceful shutdown
      const gracePeriod = 5000;
      const timeout = setTimeout(() => {
        if (this.activeAgents.has(agentId)) {
          this.logger.warn(
            `Agent ${agentId} did not terminate gracefully, sending SIGKILL`
          );
          try {
            agent.process.kill("SIGKILL");
          } catch {
            // Process may already be gone
          }
        }
      }, gracePeriod);

      // Wait for process to exit
      try {
        await agent.process.exited;
      } catch {
        // Process exit error is fine
      }

      clearTimeout(timeout);

      // Clean up
      this.activeAgents.delete(agentId);
      this.logger.info(`Agent ${agentId} terminated`);

      // Send termination hook
      await this.sendHook({
        agentId,
        claimId: agent.options.claimId,
        issueId: agent.options.issueId,
        event: "failed",
        error: "Agent terminated by orchestrator",
      });
    } catch (error) {
      this.logger.error(
        `Error terminating agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): Map<string, { pid: number; options: SpawnOptions }> {
    const result = new Map<string, { pid: number; options: SpawnOptions }>();
    const entries = Array.from(this.activeAgents.entries());
    for (const [agentId, agent] of entries) {
      result.set(agentId, { pid: agent.pid, options: agent.options });
    }
    return result;
  }

  /**
   * Terminate all active agents
   */
  async terminateAll(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info(
      `Terminating all agents (${this.activeAgents.size} active)`
    );

    const agentIds = Array.from(this.activeAgents.keys());
    const terminationPromises: Promise<void>[] = [];
    for (const agentId of agentIds) {
      terminationPromises.push(this.terminate(agentId));
    }

    await Promise.all(terminationPromises);
    this.logger.info("All agents terminated");
  }

  /**
   * Build the spawn command and arguments
   */
  private buildSpawnCommand(
    agentId: string,
    options: SpawnOptions,
    inWorktree: boolean = false
  ): { command: string; args: string[] } {
    const taskPrompt = buildTaskPrompt(options, inWorktree);
    const model = modelTierToArg(options.modelTier);

    if (this.useClaudeFlowCli) {
      // Use claude-flow CLI
      return {
        command: "npx",
        args: [
          "@claude-flow/cli@latest",
          "agent",
          "spawn",
          "--type",
          options.agentType,
          "--model",
          model,
          "--name",
          agentId,
          "--task",
          taskPrompt,
          "--hook-url",
          `${this.dashboardUrl}/api/hooks/agent`,
          ...(options.timeout
            ? ["--timeout", String(options.timeout)]
            : []),
        ],
      };
    } else {
      // Use direct claude CLI for actual code execution
      // -p (--print) enables non-interactive mode that can still modify files
      // The prompt is passed as the final positional argument
      return {
        command: "claude",
        args: [
          "-p",
          "--model",
          this.mapModelTierToClaude(options.modelTier),
          "--dangerously-skip-permissions",
          taskPrompt,
        ],
      };
    }
  }

  /**
   * Map model tier to claude CLI model name
   */
  private mapModelTierToClaude(tier: ModelTier): string {
    switch (tier) {
      case "haiku":
        return "claude-haiku-4-20250514";
      case "sonnet":
        return "claude-sonnet-4-5-20241022";
      case "opus":
        return "claude-opus-4-5-20251101";
      case "wasm":
        return "claude-haiku-4-20250514"; // Fallback for wasm
      default:
        return "claude-sonnet-4-5-20241022";
    }
  }

  /**
   * Monitor a spawned process and handle its lifecycle
   */
  private async monitorProcess(
    agentId: string,
    proc: SpawnedProcess,
    options: SpawnOptions
  ): Promise<void> {
    try {
      // Collect stdout
      let stdout = "";
      let stderr = "";

      // Read stdout stream
      const stdoutStream = proc.stdout;
      if (stdoutStream && typeof stdoutStream !== "number") {
        const reader = stdoutStream.getReader();
        const decoder = new TextDecoder();

        const readStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              stdout += chunk;

              // Log progress updates
              if (chunk.includes("progress:")) {
                this.logger.debug(`Agent ${agentId} progress: ${chunk.trim()}`);
              }
            }
          } catch {
            // Stream closed
          }
        };

        readStream();
      }

      // Read stderr stream
      const stderrStream = proc.stderr;
      if (stderrStream && typeof stderrStream !== "number") {
        const reader = stderrStream.getReader();
        const decoder = new TextDecoder();

        const readStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              stderr += chunk;
            }
          } catch {
            // Stream closed
          }
        };

        readStream();
      }

      // Wait for process to exit
      const exitCode = await proc.exited;

      // Get agent info before cleanup
      const agent = this.activeAgents.get(agentId);
      const agentWorktreePath = agent?.worktreePath;

      // Clean up from active agents
      this.activeAgents.delete(agentId);

      if (exitCode === 0) {
        this.logger.info(`Agent ${agentId} completed successfully`);

        // Clean up worktree if enabled (but keep the branch)
        if (this.cleanupWorktrees && agentWorktreePath) {
          this.logger.info(`Cleaning up worktree for ${agentId}`);
          removeWorktree(this.workingDir, agentWorktreePath, this.logger);
        } else if (agentWorktreePath) {
          this.logger.info(`Worktree preserved at ${agentWorktreePath} for review`);
        }

        // Send completion hook to dashboard
        await this.sendHook({
          agentId,
          claimId: options.claimId,
          issueId: options.issueId,
          event: "completed",
          progress: 100,
          result: { stdout: stdout.trim() },
        });

        // Emit lifecycle event to orchestrator
        this.emitLifecycleEvent({
          type: "completed",
          agentId,
          claimId: options.claimId,
          issueId: options.issueId,
          result: { stdout: stdout.trim() },
        });
      } else {
        const errorMsg = stderr.trim() || `Process exited with code ${exitCode}`;
        this.logger.error(`Agent ${agentId} failed: ${errorMsg}`);

        // Send failure hook to dashboard
        await this.sendHook({
          agentId,
          claimId: options.claimId,
          issueId: options.issueId,
          event: "failed",
          error: errorMsg,
        });

        // Emit lifecycle event to orchestrator
        this.emitLifecycleEvent({
          type: "failed",
          agentId,
          claimId: options.claimId,
          issueId: options.issueId,
          error: errorMsg,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error monitoring agent ${agentId}: ${errorMessage}`);

      // Clean up
      this.activeAgents.delete(agentId);

      // Send failure hook to dashboard
      await this.sendHook({
        agentId,
        claimId: options.claimId,
        issueId: options.issueId,
        event: "failed",
        error: errorMessage,
      });

      // Emit lifecycle event to orchestrator
      this.emitLifecycleEvent({
        type: "failed",
        agentId,
        claimId: options.claimId,
        issueId: options.issueId,
        error: errorMessage,
      });
    }
  }

  /**
   * Send a hook payload to the dashboard
   */
  private async sendHook(payload: AgentHookPayload): Promise<void> {
    const url = `${this.dashboardUrl}/api/hooks/agent`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        this.logger.warn(
          `Hook request failed: ${response.status} ${response.statusText}`
        );
      } else {
        this.logger.debug(`Hook sent: ${payload.event} for agent ${payload.agentId}`);
      }
    } catch (error) {
      // Don't fail the agent operation if hook fails
      this.logger.warn(
        `Failed to send hook to ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an agent spawner instance
 */
export function createAgentSpawner(
  dashboardUrl: string,
  workingDir?: string,
  logger?: Logger
): AgentSpawner {
  return new AgentSpawner({
    dashboardUrl,
    workingDir,
    logger,
  });
}

// ============================================================================
// Exports
// ============================================================================

export type { ActiveAgent, AgentSpawnerConfig };
