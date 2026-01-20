import { Avatar } from "../shared/Avatar";
import { getAgentColor } from "../../stores/activity";

interface AgentInfo {
  agentId: string;
  agentType: string;
  status: "idle" | "working" | "paused";
  currentClaimId?: string;
  lastSeen: string;
}

interface AgentStatusProps {
  agent: AgentInfo;
}

export function AgentStatus({ agent }: AgentStatusProps) {
  const statusColors = {
    idle: "bg-gray-400",
    working: "bg-green-500",
    paused: "bg-yellow-500",
  };

  const statusLabels = {
    idle: "Idle",
    working: "Working",
    paused: "Paused",
  };

  const agentColor = getAgentColor(agent.agentType);

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      {/* Avatar */}
      <div className="relative">
        <Avatar type="agent" name={agent.agentType} size="md" />
        {/* Status indicator */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-700 ${statusColors[agent.status]}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
            {agent.agentType}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${agentColor} text-white`}
          >
            {statusLabels[agent.status]}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
            {agent.agentId.slice(0, 12)}
          </span>
        </div>

        {agent.currentClaimId && (
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Working on:{" "}
            <span className="font-mono">
              {agent.currentClaimId.slice(0, 8)}
            </span>
          </div>
        )}
      </div>

      {/* Last seen */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        {formatLastSeen(agent.lastSeen)}
      </div>
    </div>
  );
}

function formatLastSeen(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return `${diffSecs}s`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
