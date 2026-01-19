// dashboard/src/lib/auth.ts

const AUTH_TOKEN_KEY = "dashboard_token";

/**
 * Get the stored auth token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Set the auth token
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * Clear the auth token
 */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Get Authorization header value
 */
export function getAuthHeader(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Get WebSocket URL with token
 */
export function getWebSocketUrl(): string {
  const token = getAuthToken();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const baseUrl = `${protocol}//${window.location.host}/ws`;

  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  return baseUrl;
}
