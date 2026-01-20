import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./hooks/useWebSocket";
import { LoginForm } from "./components/Auth/LoginForm";
import { Board } from "./components/Board/Board";
import { ActivityPanel } from "./components/Activity/ActivityPanel";
import { Header } from "./components/shared/Header";

function Dashboard() {
  const { connected } = useWebSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <Header
        connected={connected}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Main board area */}
        <main className="flex-1 overflow-x-auto p-2 sm:p-4">
          <Board />
        </main>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Activity sidebar - collapsible on mobile */}
        <aside
          className={`
            fixed inset-y-0 right-0 z-30 w-80 max-w-[85vw]
            transform transition-transform duration-300 ease-in-out
            lg:relative lg:translate-x-0 lg:z-auto
            ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
            border-l border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-800 overflow-y-auto
          `}
        >
          <ActivityPanel />
        </aside>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center space-y-4">
        <svg
          className="animate-spin h-12 w-12 text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "var(--toast-bg, #fff)",
            color: "var(--toast-color, #374151)",
          },
        }}
      />
      {isAuthenticated ? <Dashboard /> : <LoginForm />}
    </>
  );
}
