import { create } from "zustand";
import type { Claim, ColumnId } from "../lib/types";
import { mapStatusToColumn } from "../lib/types";

interface ClaimsState {
  claims: Map<string, Claim>;
  loading: boolean;
  error: string | null;

  // Actions
  setClaims: (claims: Claim[]) => void;
  updateClaim: (claim: Claim) => void;
  removeClaim: (issueId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selectors
  getByColumn: (column: ColumnId) => Claim[];
  getById: (id: string) => Claim | undefined;
  getAllClaims: () => Claim[];
}

export const useClaimsStore = create<ClaimsState>((set, get) => ({
  claims: new Map(),
  loading: true,
  error: null,

  setClaims: (claims) =>
    set({
      claims: new Map(claims.map((c) => [c.id, c])),
      loading: false,
      error: null,
    }),

  updateClaim: (claim) =>
    set((state) => {
      const next = new Map(state.claims);
      next.set(claim.id, claim);
      return { claims: next };
    }),

  removeClaim: (id) =>
    set((state) => {
      const next = new Map(state.claims);
      next.delete(id);
      return { claims: next };
    }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),

  getByColumn: (column) => {
    const claims = Array.from(get().claims.values());
    return claims
      .filter((c) => mapStatusToColumn(c) === column)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  },

  getById: (id) => get().claims.get(id),

  getAllClaims: () => Array.from(get().claims.values()),
}));

// Helper hook for optimistic updates with rollback
export function useOptimisticUpdate() {
  const updateClaim = useClaimsStore((state) => state.updateClaim);
  const getById = useClaimsStore((state) => state.getById);

  return async <T>(
    claimId: string,
    optimisticUpdate: Partial<Claim>,
    apiCall: () => Promise<T>
  ): Promise<{ success: boolean; result?: T; error?: Error }> => {
    // Get current state for rollback
    const previousClaim = getById(claimId);
    if (!previousClaim) {
      return { success: false, error: new Error("Claim not found") };
    }

    // Apply optimistic update
    updateClaim({ ...previousClaim, ...optimisticUpdate });

    try {
      const result = await apiCall();
      return { success: true, result };
    } catch (error) {
      // Rollback on failure
      updateClaim(previousClaim);
      return { success: false, error: error as Error };
    }
  };
}
