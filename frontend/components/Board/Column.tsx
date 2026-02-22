import { Droppable } from "@hello-pangea/dnd";
import { ClaimCard } from "./ClaimCard";
import type { Claim, Column as ColumnType } from "../../lib/types";

interface ColumnProps {
  column: ColumnType;
  claims: Claim[];
}

export function Column({ column, claims }: ColumnProps) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-t-lg border-t-4 ${column.borderClass} ${column.bgClass}`}
      >
        <h3 className="font-semibold text-gray-800 dark:text-gray-200">
          {column.label}
        </h3>
        <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {claims.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 space-y-2 rounded-b-lg min-h-[200px] transition-colors ${
              snapshot.isDraggingOver
                ? "bg-blue-50 dark:bg-blue-900/30"
                : column.bgClass
            }`}
          >
            {claims.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-gray-400 dark:text-gray-500 text-sm">
                No claims
              </div>
            ) : (
              claims.map((claim, index) => (
                <ClaimCard key={claim.id} claim={claim} index={index} />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
