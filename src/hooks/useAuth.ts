import { useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/auth";
import { authApi } from "../lib/api";
import type { LoginCredentials } from "../lib/types";

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const user = await authApi.verify();
        setUser(user);
      } catch {
        setUser(null);
        localStorage.removeItem("auth_token");
      }
    };

    verifyToken();
  }, [setUser, setLoading]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setLoading(true);
      try {
        const user = await authApi.login(credentials);
        setUser(user);
        return { success: true };
      } catch (error) {
        setUser(null);
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Login failed",
        };
      }
    },
    [setUser, setLoading]
  );

  const handleLogout = useCallback(async () => {
    await authApi.logout();
    logout();
  }, [logout]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout: handleLogout,
  };
}

// Hook for requiring authentication
export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();

  return {
    isAuthenticated,
    isLoading,
    canAccess: isAuthenticated && !isLoading,
  };
}
