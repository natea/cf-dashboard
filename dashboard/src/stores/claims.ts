// dashboard/src/stores/claims.ts
import { create } from "zustand";
import type { Claim, ColumnId } from "../lib/types";

interface ClaimsState {
  claims: Map<string, Claim>;
  loading: boolean;
  error: string | null;

  // Actions
  setClaims: (claims: Claim[]) => void;
  addClaim: (claim: Claim) => void;
  updateClaim: (claim: Claim) => void;
  removeClaim: (issueId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Selectors
  getByColumn: (column: ColumnId) => Claim[];
  getByIssueId: (issueId: string) => Claim | undefined;
}

function mapStatusToColumn(claim: Claim): ColumnId {
  if (claim.status === "completed") return "done";

  if (claim.status === "review-requested") return "human_review";
  if (claim.claimant?.type === "human" && claim.status === "active") {
    return "human_review";
  }

  if (claim.status === "backlog" && !claim.claimant) return "backlog";

  if (claim.claimant?.type === "agent") {
    // Check metadata.postReview for revision column
    const metadata = (claim as any).metadata;
    if (metadata?.postReview) return "revision";
    return "agent_working";
  }

  return "agent_working";
}

export const useClaimsStore = create<ClaimsState>((set, get) => ({
  claims: new Map(),
  loading: true,
  error: null,

  setClaims: (claims) =>
    set({
      claims: new Map(claims.map((c) => [c.issueId, c])),
      loading: false,
    }),

  addClaim: (claim) =>
    set((state) => {
      const next = new Map(state.claims);
      next.set(claim.issueId, claim);
      return { claims: next };
    }),

  updateClaim: (claim) =>
    set((state) => {
      const next = new Map(state.claims);
      next.set(claim.issueId, claim);
      return { claims: next };
    }),

  removeClaim: (issueId) =>
    set((state) => {
      const next = new Map(state.claims);
      next.delete(issueId);
      return { claims: next };
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getByColumn: (column) => {
    const claims = Array.from(get().claims.values());
    return claims.filter((c) => mapStatusToColumn(c) === column);
  },

  getByIssueId: (issueId) => get().claims.get(issueId),
}));
