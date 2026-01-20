// dashboard/orchestrator/agent-spawner.ts
// Agent spawner module for spawning Claude Code agents via claude-flow CLI

import { spawn } from "bun";
import type { Subprocess } from "bun";
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
}

interface AgentSpawnerConfig {
  dashboardUrl: string;
  workingDir?: string;
  logger?: Logger;
  useClaudeFlowCli?: boolean;
  claudeFlowPath?: string;
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
 */
function buildTaskPrompt(options: SpawnOptions): string {
  const basePrompt = options.context ?? `Work on issue ${options.issueId}`;

  // Include claim and issue context in the prompt
  return `Task for claim ${options.claimId}:
Issue ID: ${options.issueId}

${basePrompt}

IMPORTANT: Report progress via HTTP hooks to the dashboard.`;
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

  constructor(config: AgentSpawnerConfig) {
    this.dashboardUrl = config.dashboardUrl;
    this.workingDir = config.workingDir ?? process.cwd();
    this.logger = config.logger ?? consoleLogger;
    this.useClaudeFlowCli = config.useClaudeFlowCli ?? true;
    this.claudeFlowPath = config.claudeFlowPath ?? "npx @claude-flow/cli@latest";
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
    const workingDir = options.workingDir ?? this.workingDir;

    this.logger.info(
      `Spawning agent ${agentId} (type=${options.agentType}, model=${options.modelTier})`
    );

    try {
      // Send "started" hook
      await this.sendHook({
        agentId,
        claimId: options.claimId,
        issueId: options.issueId,
        event: "started",
        progress: 0,
      });

      // Build spawn command
      const { command, args } = this.buildSpawnCommand(agentId, options);

      this.logger.debug(`Spawn command: ${command} ${args.join(" ")}`);

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

      // Store active agent
      const activeAgent: ActiveAgent = {
        pid,
        options,
        process: proc,
        startedAt: new Date(),
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
    options: SpawnOptions
  ): { command: string; args: string[] } {
    const taskPrompt = buildTaskPrompt(options);
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
      // Fallback to direct claude CLI
      return {
        command: "claude",
        args: [
          "--model",
          this.mapModelTierToClaude(options.modelTier),
          "--print",
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
        return "claude-3-haiku-20240307";
      case "sonnet":
        return "claude-sonnet-4-20250514";
      case "opus":
        return "claude-opus-4-20250514";
      case "wasm":
        return "claude-3-haiku-20240307"; // Fallback for wasm
      default:
        return "claude-sonnet-4-20250514";
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

      // Clean up from active agents
      this.activeAgents.delete(agentId);

      if (exitCode === 0) {
        this.logger.info(`Agent ${agentId} completed successfully`);

        // Send completion hook
        await this.sendHook({
          agentId,
          claimId: options.claimId,
          issueId: options.issueId,
          event: "completed",
          progress: 100,
          result: { stdout: stdout.trim() },
        });
      } else {
        const errorMsg = stderr.trim() || `Process exited with code ${exitCode}`;
        this.logger.error(`Agent ${agentId} failed: ${errorMsg}`);

        // Send failure hook
        await this.sendHook({
          agentId,
          claimId: options.claimId,
          issueId: options.issueId,
          event: "failed",
          error: errorMsg,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error monitoring agent ${agentId}: ${errorMessage}`);

      // Clean up
      this.activeAgents.delete(agentId);

      // Send failure hook
      await this.sendHook({
        agentId,
        claimId: options.claimId,
        issueId: options.issueId,
        event: "failed",
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
