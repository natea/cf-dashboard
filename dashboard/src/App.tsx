// dashboard/src/App.tsx
import { useEffect, useState } from "react";
import { Board } from "./components/Board/Board";
import { CreateClaimForm } from "./components/CreateClaimForm";
import { useClaimsStore } from "./stores/claims";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { setClaims, setLoading, setError } = useClaimsStore();
  const [showCreateForm, setShowCreateForm] = useState(false);

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
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Board />
      </main>

      {showCreateForm && (
        <CreateClaimForm onClose={() => setShowCreateForm(false)} />
      )}
    </div>
  );
}
