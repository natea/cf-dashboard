import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useClaims } from "../../hooks/useClaims";
import { useClaimsStore } from "../../stores/claims";
import { Column } from "./Column";
import { COLUMNS, ColumnId } from "../../lib/types";

export function Board() {
  const { loading, error, moveToColumn } = useClaims();
  const getByColumn = useClaimsStore((state) => state.getByColumn);

  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, source, destination } = result;

    // Dropped outside a droppable area
    if (!destination) {
      return;
    }

    // Dropped in the same position
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const targetColumn = destination.droppableId as ColumnId;
    await moveToColumn(draggableId, targetColumn);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-4">
          <svg
            className="animate-spin h-8 w-8 text-blue-500"
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
          <p className="text-gray-500 dark:text-gray-400">Loading claims...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-6 py-4 rounded-lg">
          <h3 className="font-medium">Error loading claims</h3>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full min-w-max pb-4">
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
