// shared/filters.ts
// Unified filter and subscription types.

import type { ClaimStatus } from "./types";

// ============================================================================
// ClaimFilter — most flexible version (superset of all 3 locations)
// ============================================================================

export interface ClaimFilter {
  status?: ClaimStatus | ClaimStatus[];
  source?: string;
  claimantType?: "human" | "agent";
  claimant?: string;
}

// ============================================================================
// Unsubscribe callback
// ============================================================================

export type Unsubscribe = () => void;
