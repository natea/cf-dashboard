import { create } from "zustand";
import type { AgentActivity } from "../lib/types";

interface AgentInfo {
  agentId: string;
  agentType: string;
  status: "idle" | "working" | "paused";
  currentClaimId?: string;
  lastSeen: string;
}

interface ActivityState {
  logs: AgentActivity[];
  agents: Map<string, AgentInfo>;
  maxLogs: number;

  // Actions
  addLog: (activity: AgentActivity) => void;
  clearLogs: () => void;
  updateAgent: (agent: AgentInfo) => void;
  removeAgent: (agentId: string) => void;

  // Selectors
  getRecentLogs: (limit?: number) => AgentActivity[];
  getLogsForClaim: (claimId: string) => AgentActivity[];
  getActiveAgents: () => AgentInfo[];
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  logs: [],
  agents: new Map(),
  maxLogs: 200, // Keep last 200 logs

  addLog: (activity) =>
    set((state) => {
      const logs = [activity, ...state.logs].slice(0, state.maxLogs);

      // Update agent info based on activity
      const agents = new Map(state.agents);
      const agentInfo: AgentInfo = {
        agentId: activity.agentId,
        agentType: activity.agentType,
        status: "working",
        currentClaimId: activity.claimId,
        lastSeen: activity.timestamp,
      };
      agents.set(activity.agentId, agentInfo);

      return { logs, agents };
    }),

  clearLogs: () => set({ logs: [] }),

  updateAgent: (agent) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.set(agent.agentId, agent);
      return { agents };
    }),

  removeAgent: (agentId) =>
    set((state) => {
      const agents = new Map(state.agents);
      agents.delete(agentId);
      return { agents };
    }),

  getRecentLogs: (limit = 50) => {
    return get().logs.slice(0, limit);
  },

  getLogsForClaim: (claimId) => {
    return get().logs.filter((log) => log.claimId === claimId);
  },

  getActiveAgents: () => {
    const agents = Array.from(get().agents.values());
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    return agents.filter(
      (agent) => new Date(agent.lastSeen).getTime() > fiveMinutesAgo
    );
  },
}));

// Agent type display helpers
export const agentTypeColors: Record<string, string> = {
  coder: "bg-blue-500",
  researcher: "bg-purple-500",
  tester: "bg-green-500",
  reviewer: "bg-yellow-500",
  architect: "bg-red-500",
  debugger: "bg-orange-500",
  default: "bg-gray-500",
};

export const agentTypeIcons: Record<string, string> = {
  coder: "code",
  researcher: "search",
  tester: "check-circle",
  reviewer: "eye",
  architect: "building",
  debugger: "bug",
  default: "bot",
};

export function getAgentColor(agentType: string): string {
  return agentTypeColors[agentType] || agentTypeColors.default;
}

export function getAgentIcon(agentType: string): string {
  return agentTypeIcons[agentType] || agentTypeIcons.default;
}
