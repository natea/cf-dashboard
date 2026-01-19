// dashboard/src/components/Board/ClaimCard.tsx
import { Draggable } from "@hello-pangea/dnd";
import type { Claim } from "../../lib/types";

interface ClaimCardProps {
  claim: Claim;
  index: number;
}

export function ClaimCard({ claim, index }: ClaimCardProps) {
  return (
    <Draggable draggableId={claim.issueId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`
            bg-white rounded-lg shadow-sm border p-4 mb-3
            ${snapshot.isDragging ? "shadow-lg ring-2 ring-blue-400" : ""}
          `}
        >
          <div className="flex items-start justify-between">
            <h3 className="font-medium text-gray-900 text-sm">{claim.title}</h3>
            <span className="text-xs text-gray-500">{claim.issueId}</span>
          </div>

          {claim.description && (
            <p className="mt-1 text-xs text-gray-600 line-clamp-2">
              {claim.description}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            {/* Progress bar */}
            {claim.progress > 0 && (
              <div className="flex-1 mr-3">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${claim.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Claimant badge */}
            {claim.claimant && (
              <span
                className={`
                  text-xs px-2 py-0.5 rounded-full
                  ${claim.claimant.type === "human"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                  }
                `}
              >
                {claim.claimant.type === "human"
                  ? claim.claimant.name
                  : claim.claimant.agentType}
              </span>
            )}

            {/* Source badge */}
            <span className="text-xs text-gray-400 ml-2">{claim.source}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
