// dashboard/src/components/ActivitySidebar.tsx
import { useActivityStore, type ActivityEvent } from "../stores/activity";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getEventIcon(type: ActivityEvent["type"]): string {
  switch (type) {
    case "claim.created":
      return "🆕";
    case "claim.updated":
      return "📝";
    case "claim.deleted":
      return "🗑️";
    case "agent.started":
      return "🤖";
    case "agent.completed":
      return "✅";
    default:
      return "📌";
  }
}

function getEventColor(type: ActivityEvent["type"]): string {
  switch (type) {
    case "claim.created":
      return "bg-green-50 border-green-200";
    case "claim.updated":
      return "bg-blue-50 border-blue-200";
    case "claim.deleted":
      return "bg-red-50 border-red-200";
    case "agent.started":
      return "bg-purple-50 border-purple-200";
    case "agent.completed":
      return "bg-emerald-50 border-emerald-200";
    default:
      return "bg-gray-50 border-gray-200";
  }
}

interface ActivitySidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivitySidebar({ isOpen, onClose }: ActivitySidebarProps) {
  const { events, clearEvents } = useActivityStore();

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold text-gray-900">Activity Feed</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={clearEvents}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {events.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No activity yet
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={`p-3 rounded-lg border ${getEventColor(event.type)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{getEventIcon(event.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{event.message}</p>
                  {event.issueId && (
                    <p className="text-xs text-gray-500 mt-1">
                      {event.issueId}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTime(event.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Showing last {events.length} events
        </p>
      </div>
    </div>
  );
}
