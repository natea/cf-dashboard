// dashboard/src/components/AuthGuard.tsx
import { useState, useEffect, type ReactNode } from "react";
import { getAuthToken, setAuthToken, isAuthenticated } from "../lib/auth";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(isAuthenticated());

  // Listen for auth:required events
  useEffect(() => {
    const handleAuthRequired = () => {
      setAuthed(false);
      setError("Session expired. Please enter your token.");
    };

    window.addEventListener("auth:required", handleAuthRequired);
    return () => window.removeEventListener("auth:required", handleAuthRequired);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Token is required");
      return;
    }

    // Store the token
    setAuthToken(token.trim());

    // Verify by hitting the API
    try {
      const res = await fetch("/api/claims", {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });

      if (res.status === 401) {
        setError("Invalid token");
        return;
      }

      if (!res.ok) {
        setError("Failed to verify token");
        return;
      }

      setAuthed(true);
    } catch (err) {
      setError("Connection error");
    }
  };

  if (authed) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Claims Dashboard</h1>
        <p className="text-gray-600 mb-6">Enter your team secret to continue.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
              Team Secret
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your team secret"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600"
          >
            Continue
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-500 text-center">
          Contact your team admin if you don't have the secret.
        </p>
      </div>
    </div>
  );
}
