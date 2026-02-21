#!/usr/bin/env bun
// dashboard/orchestrator/index.ts
// CLI entry point for the Agent Orchestrator

import { Orchestrator } from "./orchestrator";
import { loadConfig, validateConfig, printConfig } from "./config";
import { consoleLogger } from "./types";

const VERSION = "0.1.0";

function printUsage(): void {
  console.log(`
Agent Orchestrator v${VERSION}

Usage:
  bun run orchestrator [options]

Options:
  --help       Show this help message
  --version    Show version number
  --dry-run    Print configuration and exit without starting

Environment Variables:
  ORCHESTRATOR_DASHBOARD_URL      Dashboard URL (default: http://localhost:3000)
  ORCHESTRATOR_API_KEY            API key for dashboard authentication
  ORCHESTRATOR_MAX_AGENTS         Maximum concurrent agents (default: 4)
  ORCHESTRATOR_MAX_RETRIES        Maximum retry attempts (default: 2)
  ORCHESTRATOR_RETRY_DELAY_MS     Delay between retries in ms (default: 5000)
  ORCHESTRATOR_POLL_INTERVAL_MS   Polling interval in ms (default: 5000)
  ORCHESTRATOR_GRACEFUL_SHUTDOWN_MS  Graceful shutdown timeout (default: 30000)
  ORCHESTRATOR_WORKING_DIR        Working directory for agents
  ORCHESTRATOR_USE_WORKTREES      Use git worktrees for isolation (default: true)
  ORCHESTRATOR_CLEANUP_WORKTREES  Remove worktrees after completion (default: false)
  ORCHESTRATOR_USE_CLAUDE_FLOW    Use claude-flow CLI for spawning (default: false)

Examples:
  # Basic usage
  bun run orchestrator

  # With environment variables
  ORCHESTRATOR_MAX_AGENTS=8 bun run orchestrator

  # Dry run to check configuration
  bun run orchestrator -- --dry-run
`);
}

function printVersion(): void {
  console.log(`Agent Orchestrator v${VERSION}`);
}

function parseArgs(args: string[]): { help: boolean; version: boolean; dryRun: boolean } {
  return {
    help: args.includes("--help") || args.includes("-h"),
    version: args.includes("--version") || args.includes("-v"),
    dryRun: args.includes("--dry-run"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  // Load and validate configuration
  const config = loadConfig();
  const validationErrors = validateConfig(config);

  if (validationErrors.length > 0) {
    consoleLogger.error("Configuration validation failed:");
    for (const error of validationErrors) {
      consoleLogger.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Print configuration
  printConfig(config);

  // Dry run mode - exit after printing config
  if (args.dryRun) {
    consoleLogger.info("Dry run mode - exiting without starting orchestrator");
    process.exit(0);
  }

  // Create orchestrator instance
  const orchestrator = new Orchestrator(config);

  // Track shutdown state
  let isShuttingDown = false;

  // Signal handler for graceful shutdown
  const handleShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      consoleLogger.warn("Shutdown already in progress, please wait...");
      return;
    }

    isShuttingDown = true;
    consoleLogger.info(`Received ${signal}, initiating graceful shutdown...`);

    try {
      await orchestrator.stop();
      consoleLogger.info("Orchestrator stopped successfully");
      process.exit(0);
    } catch (error) {
      consoleLogger.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  // Handle unhandled rejections
  process.on("unhandledRejection", (reason, promise) => {
    consoleLogger.error("Unhandled rejection at:", promise, "reason:", reason);
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    consoleLogger.error("Uncaught exception:", error);
    process.exit(1);
  });

  // Start the orchestrator
  try {
    consoleLogger.info("Starting orchestrator...");
    await orchestrator.start();
    consoleLogger.info("Orchestrator started successfully");
  } catch (error) {
    consoleLogger.error("Failed to start orchestrator:", error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  consoleLogger.error("Fatal error:", error);
  process.exit(1);
});
