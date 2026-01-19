// dashboard/src/App.tsx
import { useEffect } from "react";
import { Board } from "./components/Board/Board";
import { useClaimsStore } from "./stores/claims";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { setClaims, setLoading, setError } = useClaimsStore();

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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Claims Dashboard</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Board />
      </main>
    </div>
  );
}
