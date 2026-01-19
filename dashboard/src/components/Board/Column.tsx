// dashboard/src/components/Board/Column.tsx
import { Droppable } from "@hello-pangea/dnd";
import type { Claim, Column as ColumnType } from "../../lib/types";
import { ClaimCard } from "./ClaimCard";

interface ColumnProps {
  column: ColumnType;
  claims: Claim[];
}

export function Column({ column, claims }: ColumnProps) {
  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      <div
        className="flex items-center gap-2 mb-4 px-2"
        style={{ borderLeftColor: column.color, borderLeftWidth: 4 }}
      >
        <h2 className="font-semibold text-gray-900">{column.label}</h2>
        <span className="text-sm text-gray-500">({claims.length})</span>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`
              min-h-[200px] p-2 rounded-lg transition-colors
              ${snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-50"}
            `}
          >
            {claims.map((claim, index) => (
              <ClaimCard key={claim.issueId} claim={claim} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
