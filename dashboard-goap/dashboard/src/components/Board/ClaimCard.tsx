import { Draggable } from "@hello-pangea/dnd";
import type { Claim, Claimant } from "../../lib/types";
import { Avatar } from "../shared/Avatar";
import { Progress } from "../shared/Progress";
import { Badge } from "../shared/Badge";

interface ClaimCardProps {
  claim: Claim;
  index: number;
}

// Helper function to get display name from claimant
function getClaimantDisplayName(claimant: Claimant): string {
  if (claimant.type === "agent") {
    return claimant.agentType;
  }
  return claimant.name;
}

export function ClaimCard({ claim, index }: ClaimCardProps) {

  const getSourceBadge = () => {
    switch (claim.source) {
      case "github":
        return { label: "GitHub", color: "gray" as const };
      case "mcp":
        return { label: "MCP", color: "purple" as const };
      default:
        return { label: "Manual", color: "blue" as const };
    }
  };

  const sourceBadge = getSourceBadge();

  return (
    <Draggable draggableId={claim.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`claim-card bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-3 cursor-grab active:cursor-grabbing ${
            snapshot.isDragging
              ? "shadow-lg ring-2 ring-blue-400 dark:ring-blue-500"
              : ""
          }`}
        >
          {/* Header with badges */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex flex-wrap gap-1">
              <Badge label={sourceBadge.label} color={sourceBadge.color} />
              {claim.status === "blocked" && (
                <Badge label="Blocked" color="red" />
              )}
              {claim.status === "paused" && (
                <Badge label="Paused" color="yellow" />
              )}
            </div>
            {claim.sourceRef && (
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                #{claim.issueId.slice(0, 7)}
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-2 line-clamp-2">
            {claim.title}
          </h4>

          {/* Description preview */}
          {claim.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
              {claim.description}
            </p>
          )}

          {/* Progress bar */}
          {claim.progress > 0 && (
            <div className="mb-2">
              <Progress value={claim.progress} />
            </div>
          )}

          {/* Footer with claimant */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-600">
            {claim.claimant ? (
              <div className="flex items-center gap-2">
                <Avatar
                  type={claim.claimant.type}
                  name={getClaimantDisplayName(claim.claimant)}
                  size="sm"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
                  {getClaimantDisplayName(claim.claimant)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Unclaimed
              </span>
            )}

            {/* Timestamp */}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTimeAgo(claim.updatedAt)}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
