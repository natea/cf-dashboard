// dashboard/src/App.tsx
import { useEffect, useState } from "react";
import { Board } from "./components/Board/Board";
import { CreateClaimForm } from "./components/CreateClaimForm";
import { ActivitySidebar } from "./components/ActivitySidebar";
import { useClaimsStore } from "./stores/claims";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { setClaims, setLoading, setError } = useClaimsStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  // Connect to WebSocket for real-time updates
  useWebSocket();

  useEffect(() => {
    // Fetch initial claims
    fetch("/api/claims")
      .then((res) => res.json())
      .then((data) => setClaims(data.claims))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [setClaims, setError, setLoading]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Claims Dashboard</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowActivity(!showActivity)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
              title="Activity Feed"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Claim
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Board />
      </main>

      {showCreateForm && (
        <CreateClaimForm onClose={() => setShowCreateForm(false)} />
      )}

      <ActivitySidebar isOpen={showActivity} onClose={() => setShowActivity(false)} />
    </div>
  );
}
