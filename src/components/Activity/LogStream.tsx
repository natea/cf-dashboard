import { useRef, useEffect } from "react";
import type { AgentActivity } from "../../lib/types";
import { getAgentColor } from "../../stores/activity";

interface LogStreamProps {
  logs: AgentActivity[];
}

export function LogStream({ logs }: LogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
          No activity yet
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Agent activity will appear here in real-time
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="divide-y divide-gray-100 dark:divide-gray-700">
      {logs.map((log, index) => (
        <LogEntry key={`${log.timestamp}-${index}`} log={log} />
      ))}
    </div>
  );
}

interface LogEntryProps {
  log: AgentActivity;
}

function LogEntry({ log }: LogEntryProps) {
  const agentColor = getAgentColor(log.agentType);

  const actionIcons: Record<string, string> = {
    claim: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    start: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z",
    complete: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    error: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    update: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  };

  const getActionIcon = (action: string): string => {
    const normalizedAction = action.toLowerCase();
    for (const [key, path] of Object.entries(actionIcons)) {
      if (normalizedAction.includes(key)) {
        return path;
      }
    }
    return actionIcons.update;
  };

  return (
    <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Agent indicator */}
        <div
          className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${agentColor}`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {log.agentType}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTimestamp(log.timestamp)}
            </span>
          </div>

          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
            {log.message}
          </p>

          {log.claimId && (
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={getActionIcon(log.action)}
                />
              </svg>
              <span className="font-mono">{log.claimId.slice(0, 8)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
