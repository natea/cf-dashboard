import { useState } from "react";
import { useActivityStore } from "../../stores/activity";
import { AgentStatus } from "./AgentStatus";
import { LogStream } from "./LogStream";

type TabId = "agents" | "logs";

export function ActivityPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("agents");
  const getActiveAgents = useActivityStore((state) => state.getActiveAgents);
  const getRecentLogs = useActivityStore((state) => state.getRecentLogs);

  const activeAgents = getActiveAgents();
  const recentLogs = getRecentLogs(50);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Activity
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("agents")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "agents"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Agents ({activeAgents.length})
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "logs"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Logs
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === "agents" ? (
          <div className="p-4">
            {activeAgents.length === 0 ? (
              <EmptyState
                icon={
                  <svg
                    className="w-12 h-12 text-gray-300 dark:text-gray-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                }
                title="No active agents"
                description="Agents will appear here when they start working on claims"
              />
            ) : (
              <div className="space-y-3">
                {activeAgents.map((agent) => (
                  <AgentStatus key={agent.agentId} agent={agent} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <LogStream logs={recentLogs} />
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon}
      <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}
