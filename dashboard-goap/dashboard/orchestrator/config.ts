// dashboard/orchestrator/config.ts
// Configuration loading from environment variables

import { DEFAULT_CONFIG, type OrchestratorConfig } from "./types";

/**
 * Load orchestrator configuration from environment variables
 */
export function loadConfig(): OrchestratorConfig {
  return {
    dashboardUrl:
      process.env.ORCHESTRATOR_DASHBOARD_URL ?? DEFAULT_CONFIG.dashboardUrl,
    apiKey: process.env.ORCHESTRATOR_API_KEY,
    maxAgents: parseInt(
      process.env.ORCHESTRATOR_MAX_AGENTS ?? String(DEFAULT_CONFIG.maxAgents),
      10
    ),
    maxRetries: parseInt(
      process.env.ORCHESTRATOR_MAX_RETRIES ?? String(DEFAULT_CONFIG.maxRetries),
      10
    ),
    retryDelayMs: parseInt(
      process.env.ORCHESTRATOR_RETRY_DELAY_MS ??
        String(DEFAULT_CONFIG.retryDelayMs),
      10
    ),
    pollIntervalMs: parseInt(
      process.env.ORCHESTRATOR_POLL_INTERVAL_MS ??
        String(DEFAULT_CONFIG.pollIntervalMs),
      10
    ),
    gracefulShutdownMs: parseInt(
      process.env.ORCHESTRATOR_GRACEFUL_SHUTDOWN_MS ??
        String(DEFAULT_CONFIG.gracefulShutdownMs),
      10
    ),
    workingDir: process.env.ORCHESTRATOR_WORKING_DIR ?? process.cwd(),
    useWorktrees:
      process.env.ORCHESTRATOR_USE_WORKTREES !== "false" &&
      DEFAULT_CONFIG.useWorktrees,
    cleanupWorktrees:
      process.env.ORCHESTRATOR_CLEANUP_WORKTREES === "true" ||
      DEFAULT_CONFIG.cleanupWorktrees,
  };
}

/**
 * Validate configuration values
 */
export function validateConfig(config: OrchestratorConfig): string[] {
  const errors: string[] = [];

  if (!config.dashboardUrl) {
    errors.push("dashboardUrl is required");
  } else {
    try {
      new URL(config.dashboardUrl);
    } catch {
      errors.push(`Invalid dashboardUrl: ${config.dashboardUrl}`);
    }
  }

  if (config.maxAgents < 1 || config.maxAgents > 20) {
    errors.push(`maxAgents must be between 1 and 20, got ${config.maxAgents}`);
  }

  if (config.maxRetries < 0 || config.maxRetries > 10) {
    errors.push(
      `maxRetries must be between 0 and 10, got ${config.maxRetries}`
    );
  }

  if (config.retryDelayMs < 1000 || config.retryDelayMs > 60000) {
    errors.push(
      `retryDelayMs must be between 1000 and 60000, got ${config.retryDelayMs}`
    );
  }

  if (config.pollIntervalMs < 1000 || config.pollIntervalMs > 60000) {
    errors.push(
      `pollIntervalMs must be between 1000 and 60000, got ${config.pollIntervalMs}`
    );
  }

  return errors;
}

/**
 * Print configuration (masking sensitive values)
 */
export function printConfig(config: OrchestratorConfig): void {
  console.log("[orchestrator] Configuration:");
  console.log(`  Dashboard URL: ${config.dashboardUrl}`);
  console.log(`  API Key: ${config.apiKey ? "***" : "(not set)"}`);
  console.log(`  Max Agents: ${config.maxAgents}`);
  console.log(`  Max Retries: ${config.maxRetries}`);
  console.log(`  Retry Delay: ${config.retryDelayMs}ms`);
  console.log(`  Poll Interval: ${config.pollIntervalMs}ms`);
  console.log(`  Graceful Shutdown: ${config.gracefulShutdownMs}ms`);
  console.log(`  Working Dir: ${config.workingDir}`);
  console.log(`  Use Worktrees: ${config.useWorktrees}`);
  console.log(`  Cleanup Worktrees: ${config.cleanupWorktrees}`);
}
