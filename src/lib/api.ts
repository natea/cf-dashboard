import type { Claim, ClaimStatus, LoginCredentials, User } from "./types";

const API_BASE = "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("auth_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || response.statusText);
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }

  return {} as T;
}

// Auth API
export const authApi = {
  async login(credentials: LoginCredentials): Promise<User> {
    const result = await request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    localStorage.setItem("auth_token", result.token);
    return result;
  },

  async logout(): Promise<void> {
    localStorage.removeItem("auth_token");
  },

  async verify(): Promise<User | null> {
    try {
      return await request<User>("/auth/verify");
    } catch {
      localStorage.removeItem("auth_token");
      return null;
    }
  },
};

// Claims API
export const claimsApi = {
  async list(): Promise<Claim[]> {
    return request<Claim[]>("/claims");
  },

  async get(id: string): Promise<Claim> {
    return request<Claim>(`/claims/${id}`);
  },

  async create(data: Partial<Claim>): Promise<Claim> {
    return request<Claim>("/claims", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<Claim>): Promise<Claim> {
    return request<Claim>(`/claims/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<void> {
    return request<void>(`/claims/${id}`, {
      method: "DELETE",
    });
  },

  async updateStatus(id: string, status: ClaimStatus): Promise<Claim> {
    return request<Claim>(`/claims/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  },

  async claim(
    id: string,
    claimant: { type: "human" | "agent"; id: string; name: string }
  ): Promise<Claim> {
    return request<Claim>(`/claims/${id}/claim`, {
      method: "POST",
      body: JSON.stringify(claimant),
    });
  },

  async release(id: string): Promise<Claim> {
    return request<Claim>(`/claims/${id}/release`, {
      method: "POST",
    });
  },

  async requestReview(id: string, notes?: string): Promise<Claim> {
    return request<Claim>(`/claims/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  async requestRevision(id: string, notes: string): Promise<Claim> {
    return request<Claim>(`/claims/${id}/revision`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  async complete(id: string): Promise<Claim> {
    return request<Claim>(`/claims/${id}/complete`, {
      method: "POST",
    });
  },
};

export { ApiError };
