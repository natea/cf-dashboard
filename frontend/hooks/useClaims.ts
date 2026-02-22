import { useCallback } from "react";
import { useClaimsStore, useOptimisticUpdate } from "../stores/claims";
import { claimsApi } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import type { Claim, ColumnId, ClaimStatus } from "../lib/types";
import { columnToStatus } from "../lib/types";
import toast from "react-hot-toast";

export function useClaims() {
  const claims = useClaimsStore((state) => state.claims);
  const loading = useClaimsStore((state) => state.loading);
  const error = useClaimsStore((state) => state.error);
  const getByColumn = useClaimsStore((state) => state.getByColumn);
  const getById = useClaimsStore((state) => state.getById);
  const setError = useClaimsStore((state) => state.setError);
  const updateClaim = useClaimsStore((state) => state.updateClaim);
  const optimisticUpdate = useOptimisticUpdate();
  const user = useAuthStore((state) => state.user);

  const loadClaims = useCallback(async () => {
    try {
      const claims = await claimsApi.list();
      useClaimsStore.getState().setClaims(claims);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load claims";
      setError(message);
      toast.error(message);
    }
  }, [setError]);

  const createClaim = useCallback(
    async (data: Partial<Claim>) => {
      try {
        const claim = await claimsApi.create(data);
        updateClaim(claim);
        toast.success("Claim created");
        return claim;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create claim";
        toast.error(message);
        throw err;
      }
    },
    [updateClaim]
  );

  const moveToColumn = useCallback(
    async (claimId: string, targetColumn: ColumnId) => {
      const claim = getById(claimId);
      if (!claim) {
        toast.error("Claim not found");
        return;
      }

      const newStatus = columnToStatus(targetColumn);

      // Optimistic update with rollback
      const result = await optimisticUpdate(
        claimId,
        { status: newStatus, updatedAt: new Date().toISOString() },
        async () => {
          // Handle different column transitions
          switch (targetColumn) {
            case "human_review":
              return claimsApi.requestReview(claimId);
            case "revision":
              return claimsApi.requestRevision(claimId, "Needs revision");
            case "done":
              return claimsApi.complete(claimId);
            default:
              return claimsApi.updateStatus(claimId, newStatus);
          }
        }
      );

      if (!result.success) {
        toast.error(result.error?.message || "Failed to move claim");
      } else if (result.result) {
        // Update with server response
        updateClaim(result.result);
      }
    },
    [getById, optimisticUpdate, updateClaim]
  );

  const claimItem = useCallback(
    async (claimId: string) => {
      if (!user) {
        toast.error("You must be logged in to claim items");
        return;
      }

      const claim = getById(claimId);
      if (!claim) {
        toast.error("Claim not found");
        return;
      }

      const result = await optimisticUpdate(
        claimId,
        {
          claimant: { type: "human", userId: user.id, name: user.name },
          status: "active" as ClaimStatus,
          updatedAt: new Date().toISOString(),
        },
        () =>
          claimsApi.claim(claimId, {
            type: "human",
            id: user.id,
            name: user.name,
          })
      );

      if (!result.success) {
        toast.error(result.error?.message || "Failed to claim item");
      } else {
        toast.success("Item claimed");
        if (result.result) {
          updateClaim(result.result);
        }
      }
    },
    [user, getById, optimisticUpdate, updateClaim]
  );

  const releaseItem = useCallback(
    async (claimId: string) => {
      const claim = getById(claimId);
      if (!claim) {
        toast.error("Claim not found");
        return;
      }

      const result = await optimisticUpdate(
        claimId,
        {
          claimant: undefined,
          status: "backlog" as ClaimStatus,
          updatedAt: new Date().toISOString(),
        },
        () => claimsApi.release(claimId)
      );

      if (!result.success) {
        toast.error(result.error?.message || "Failed to release item");
      } else {
        toast.success("Item released");
        if (result.result) {
          updateClaim(result.result);
        }
      }
    },
    [getById, optimisticUpdate, updateClaim]
  );

  return {
    claims,
    loading,
    error,
    getByColumn,
    getById,
    loadClaims,
    createClaim,
    moveToColumn,
    claimItem,
    releaseItem,
  };
}
