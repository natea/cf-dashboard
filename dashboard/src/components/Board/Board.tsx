// dashboard/src/components/Board/Board.tsx
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useClaimsStore } from "../../stores/claims";
import { COLUMNS, type ColumnId } from "../../lib/types";
import { updateClaimStatus, columnToStatus } from "../../lib/api";
import { Column } from "./Column";

export function Board() {
  const { getByColumn, loading, error, updateClaim } = useClaimsStore();

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, source, destination } = result;

    // Don't do anything if dropped in same place
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const targetColumn = destination.droppableId as ColumnId;
    const newStatus = columnToStatus(targetColumn);

    try {
      // Optimistic update
      const currentClaim = useClaimsStore.getState().getByIssueId(draggableId);
      if (currentClaim) {
        updateClaim({ ...currentClaim, status: newStatus });
      }

      // API call
      await updateClaimStatus(draggableId, newStatus);
    } catch (err) {
      console.error("Failed to update claim status:", err);
      // TODO: Rollback optimistic update on error
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        Error: {error}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 overflow-x-auto pb-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            column={column}
            claims={getByColumn(column.id)}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
