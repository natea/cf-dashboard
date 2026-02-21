// dashboard/orchestrator/task-router.ts
// Task routing via claude-flow CLI hooks

import { spawn } from "child_process";
import type { AgentType } from "../server/domain/types";
import type {
  Logger,
  ModelTier,
  RoutingResult,
  TaskContext,
} from "./types";

/**
 * Default routing result when claude-flow is unavailable
 * or when heuristics can't determine a better match
 */
const DEFAULT_ROUTING: RoutingResult = {
  agentType: "coder",
  modelTier: "sonnet",
  useAgentBooster: false,
  confidence: 0.5,
  reasoning: "Default routing (claude-flow unavailable or no match)",
};

/**
 * Label-to-agent-type mapping for fallback heuristics
 * Note: "debugger" is not a valid Claude Code agent type, use "coder" for bug fixes
 */
const LABEL_AGENT_MAP: Record<string, AgentType> = {
  bug: "coder",
  bugfix: "coder",
  fix: "coder",
  debug: "coder",
  feature: "coder",
  enhancement: "coder",
  test: "tester",
  testing: "tester",
  "needs-tests": "tester",
  "test-architect": "test-architect",
  review: "reviewer",
  "code-review": "reviewer",
  research: "researcher",
  investigation: "researcher",
  analysis: "analyst",
  architecture: "architect",
  design: "architect",
  refactor: "architect",
  documentation: "researcher",
  docs: "researcher",
  security: "security-architect",
  "security-audit": "security-auditor",
  performance: "performance-engineer",
  optimization: "optimizer",
};

/**
 * Title keyword patterns for fallback heuristics
 * Note: "debugger" is not a valid Claude Code agent type, use "coder" for bug fixes
 */
const TITLE_PATTERNS: Array<{ pattern: RegExp; agentType: AgentType }> = [
  { pattern: /\b(security|vuln|cve)\b/i, agentType: "security-architect" },
  { pattern: /\b(performance|perf|slow|optimize)\b/i, agentType: "performance-engineer" },
  { pattern: /\b(bug|fix|crash|error|broken)\b/i, agentType: "coder" },
  { pattern: /\b(test|spec|coverage)\b/i, agentType: "tester" },
  { pattern: /\b(review|audit)\b/i, agentType: "reviewer" },
  { pattern: /\b(research|investigate|analyze)\b/i, agentType: "researcher" },
  { pattern: /\b(architect|design|refactor|restructure)\b/i, agentType: "architect" },
  { pattern: /\b(implement|add|create|build|feature)\b/i, agentType: "coder" },
];

/**
 * Complexity indicators for model tier selection.
 *
 * NOTE: "low" complexity still uses sonnet as the minimum tier.
 * Haiku is too weak for claude CLI agent tasks that require tool use
 * (file reading, editing, git). Only opus is an upgrade from the default.
 */
const COMPLEXITY_INDICATORS = {
  high: [
    /security/i,
    /performance/i,
    /architect/i,
    /critical/i,
    /breaking/i,
    /migration/i,
  ],
};

/**
 * Parse the JSON output from claude-flow CLI
 */
interface ClaudeFlowRouting {
  agentType?: string;
  modelTier?: string;
  model?: string;
  useAgentBooster?: boolean;
  confidence?: number;
  reasoning?: string;
}

/**
 * TaskRouter wraps the claude-flow CLI to get task routing recommendations
 */
export class TaskRouter {
  private logger: Logger;
  private claudeFlowAvailable: boolean | null = null;

  constructor(logger?: Logger) {
    this.logger = logger ?? {
      debug: (msg, ...args) => console.debug(`[task-router] ${msg}`, ...args),
      info: (msg, ...args) => console.log(`[task-router] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[task-router] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[task-router] ${msg}`, ...args),
    };
  }

  /**
   * Route a task to determine the optimal agent type and model tier
   */
  async route(context: TaskContext): Promise<RoutingResult> {
    this.logger.debug(`Routing task: ${context.issueId} - ${context.title}`);

    // Try claude-flow CLI first (skip if previously determined unavailable)
    if (this.claudeFlowAvailable !== false) try {
      const cliResult = await this.routeViaCLI(context);
      if (cliResult) {
        this.logger.info(
          `CLI routing for ${context.issueId}: ${cliResult.agentType}/${cliResult.modelTier} (confidence: ${cliResult.confidence})`
        );
        return cliResult;
      }
    } catch (error) {
      this.logger.warn(
        `CLI routing failed for ${context.issueId}, falling back to heuristics`,
        error
      );
    }

    // Fallback to heuristics
    const heuristicResult = this.routeViaHeuristics(context);
    this.logger.info(
      `Heuristic routing for ${context.issueId}: ${heuristicResult.agentType}/${heuristicResult.modelTier}`
    );
    return heuristicResult;
  }

  /**
   * Route via claude-flow CLI hooks
   */
  private async routeViaCLI(
    context: TaskContext
  ): Promise<RoutingResult | null> {
    // Build the description for claude-flow
    const description = this.buildDescription(context);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn("CLI routing timed out");
        resolve(null);
      }, 10000); // 10 second timeout

      try {
        const proc = spawn(
          "claude-flow",
          [
            "hooks",
            "pre-task",
            "--description",
            description,
            "--json",
          ],
          {
            timeout: 10000,
            env: { ...process.env },
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        let stdout = "";
        let stderr = "";

        proc.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("error", (error) => {
          clearTimeout(timeout);
          this.logger.debug(`CLI spawn error: ${error.message}`);
          this.claudeFlowAvailable = false;
          resolve(null);
        });

        proc.on("close", (code) => {
          clearTimeout(timeout);

          if (code !== 0) {
            this.logger.debug(`CLI exited with code ${code}: ${stderr.trim().slice(0, 200)}`);
            // Cache as unavailable on any failure — avoids retrying broken CLI every poll
            this.claudeFlowAvailable = false;
            resolve(null);
            return;
          }

          this.claudeFlowAvailable = true;

          try {
            const result = this.parseCLIOutput(stdout);
            resolve(result);
          } catch (parseError) {
            this.logger.debug(`Failed to parse CLI output: ${stdout}`);
            resolve(null);
          }
        });
      } catch (spawnError) {
        clearTimeout(timeout);
        this.logger.debug(`Failed to spawn CLI: ${spawnError}`);
        resolve(null);
      }
    });
  }

  /**
   * Build description string for claude-flow
   */
  private buildDescription(context: TaskContext): string {
    const parts: string[] = [context.title];

    if (context.description) {
      // Truncate long descriptions
      const desc =
        context.description.length > 500
          ? context.description.substring(0, 500) + "..."
          : context.description;
      parts.push(desc);
    }

    if (context.labels && context.labels.length > 0) {
      parts.push(`Labels: ${context.labels.join(", ")}`);
    }

    return parts.join("\n");
  }

  /**
   * Parse the JSON output from claude-flow CLI
   */
  private parseCLIOutput(output: string): RoutingResult | null {
    // Look for JSON in the output (may have other log messages)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Try to parse recommendations from text output
      return this.parseTextOutput(output);
    }

    const parsed: ClaudeFlowRouting = JSON.parse(jsonMatch[0]);

    // Map the CLI output to our RoutingResult
    const agentType = this.normalizeAgentType(
      parsed.agentType ?? parsed.model ?? "coder"
    );
    const modelTier = this.normalizeModelTier(
      parsed.modelTier ?? parsed.model ?? "sonnet"
    );

    return {
      agentType,
      modelTier,
      useAgentBooster: parsed.useAgentBooster ?? false,
      confidence: parsed.confidence ?? 0.7,
      reasoning: parsed.reasoning ?? "Routed via claude-flow CLI",
    };
  }

  /**
   * Parse text-based recommendations from CLI output
   */
  private parseTextOutput(output: string): RoutingResult | null {
    let agentType: AgentType = "coder";
    let modelTier: ModelTier = "sonnet";
    let useAgentBooster = false;
    let confidence = 0.6;
    let reasoning = "Parsed from CLI text output";

    // Check for agent booster recommendation
    if (output.includes("[AGENT_BOOSTER_AVAILABLE]")) {
      useAgentBooster = true;
      modelTier = "wasm";
      confidence = 0.9;
      reasoning = "Agent booster available for this task";
    }

    // Check for model recommendation
    const modelMatch = output.match(
      /\[TASK_MODEL_RECOMMENDATION\]\s*Use model="(\w+)"/i
    );
    if (modelMatch) {
      modelTier = this.normalizeModelTier(modelMatch[1]);
      confidence = 0.8;
    }

    // Check for agent type recommendation
    const agentMatch = output.match(
      /agent[_-]?type[:\s]+["']?(\w+)["']?/i
    );
    if (agentMatch) {
      agentType = this.normalizeAgentType(agentMatch[1]);
    }

    // Check for routing recommendation
    const routeMatch = output.match(
      /route[:\s]+["']?(\w+)["']?/i
    );
    if (routeMatch) {
      agentType = this.normalizeAgentType(routeMatch[1]);
    }

    return {
      agentType,
      modelTier,
      useAgentBooster,
      confidence,
      reasoning,
    };
  }

  /**
   * Normalize agent type string to AgentType enum
   */
  private normalizeAgentType(type: string): AgentType {
    const normalized = type.toLowerCase().trim();

    const mapping: Record<string, AgentType> = {
      coder: "coder",
      developer: "coder",
      programmer: "coder",
      researcher: "researcher",
      research: "researcher",
      investigator: "researcher",
      tester: "tester",
      test: "tester",
      qa: "tester",
      reviewer: "reviewer",
      review: "reviewer",
      auditor: "reviewer",
      architect: "architect",
      architecture: "architect",
      designer: "architect",
      debugger: "coder",
      debug: "coder",
      fixer: "coder",
    };

    return mapping[normalized] ?? "coder";
  }

  /**
   * Normalize model tier string to ModelTier enum
   */
  private normalizeModelTier(tier: string): ModelTier {
    const normalized = tier.toLowerCase().trim();

    const mapping: Record<string, ModelTier> = {
      wasm: "wasm",
      local: "wasm",
      haiku: "haiku",
      fast: "haiku",
      sonnet: "sonnet",
      default: "sonnet",
      opus: "opus",
      premium: "opus",
      complex: "opus",
    };

    return mapping[normalized] ?? "sonnet";
  }

  /**
   * Route using label and title heuristics
   */
  private routeViaHeuristics(context: TaskContext): RoutingResult {
    let agentType: AgentType = "coder";
    let modelTier: ModelTier = "sonnet";
    let confidence = 0.5;
    const reasons: string[] = [];

    // Check labels first (higher confidence)
    if (context.labels && context.labels.length > 0) {
      for (const label of context.labels) {
        const normalizedLabel = label.toLowerCase().replace(/[^a-z]/g, "");
        if (LABEL_AGENT_MAP[normalizedLabel]) {
          agentType = LABEL_AGENT_MAP[normalizedLabel];
          confidence = 0.7;
          reasons.push(`Matched label: ${label}`);
          break;
        }
      }
    }

    // Check title patterns if no label match
    if (reasons.length === 0) {
      for (const { pattern, agentType: matchedType } of TITLE_PATTERNS) {
        if (pattern.test(context.title)) {
          agentType = matchedType;
          confidence = 0.6;
          reasons.push(`Matched title pattern: ${pattern}`);
          break;
        }
      }
    }

    // Determine model tier based on complexity
    const fullText = `${context.title} ${context.description ?? ""} ${
      (context.labels ?? []).join(" ")
    }`;

    // Check for high complexity indicators → upgrade to opus
    for (const pattern of COMPLEXITY_INDICATORS.high) {
      if (pattern.test(fullText)) {
        modelTier = "opus";
        reasons.push(`High complexity indicator: ${pattern}`);
        break;
      }
    }

    // Default is sonnet — haiku is too weak for claude CLI agent tasks

    // Default reasoning if no matches
    if (reasons.length === 0) {
      reasons.push("No specific patterns matched, using defaults");
    }

    return {
      agentType,
      modelTier,
      useAgentBooster: false, // Heuristics don't support agent booster detection
      confidence,
      reasoning: reasons.join("; "),
    };
  }

  /**
   * Check if claude-flow CLI is available
   * Caches the result after first check
   */
  async isClaudeFlowAvailable(): Promise<boolean> {
    if (this.claudeFlowAvailable !== null) {
      return this.claudeFlowAvailable;
    }

    return new Promise((resolve) => {
      const proc = spawn("claude-flow", ["--version"], {
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.on("error", () => {
        this.claudeFlowAvailable = false;
        resolve(false);
      });

      proc.on("close", (code) => {
        this.claudeFlowAvailable = code === 0;
        resolve(this.claudeFlowAvailable);
      });
    });
  }

  /**
   * Reset the cached availability status
   */
  resetAvailabilityCache(): void {
    this.claudeFlowAvailable = null;
  }
}

