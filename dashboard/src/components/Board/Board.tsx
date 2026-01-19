// dashboard/src/components/Board/Board.tsx
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useClaimsStore } from "../../stores/claims";
import { COLUMNS } from "../../lib/types";
import { Column } from "./Column";

export function Board() {
  const { getByColumn, loading, error } = useClaimsStore();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const targetColumn = destination.droppableId;

    console.log(`Move ${draggableId} to ${targetColumn}`);
    // TODO: API call to update claim status
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
