type BadgeColor = "gray" | "blue" | "green" | "yellow" | "red" | "purple" | "orange";

interface BadgeProps {
  label: string;
  color: BadgeColor;
  size?: "sm" | "md";
}

const colorClasses: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const sizeClasses = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
};

export function Badge({ label, color, size = "sm" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-medium rounded ${colorClasses[color]} ${sizeClasses[size]}`}
    >
      {label}
    </span>
  );
}

// Status-specific badges
interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const statusConfig: Record<string, { label: string; color: BadgeColor }> = {
    backlog: { label: "Backlog", color: "gray" },
    active: { label: "Active", color: "blue" },
    paused: { label: "Paused", color: "yellow" },
    blocked: { label: "Blocked", color: "red" },
    "review-requested": { label: "Review", color: "purple" },
    completed: { label: "Done", color: "green" },
  };

  const config = statusConfig[status] || { label: status, color: "gray" as BadgeColor };

  return <Badge label={config.label} color={config.color} size={size} />;
}

// Source-specific badges
interface SourceBadgeProps {
  source: string;
  size?: "sm" | "md";
}

export function SourceBadge({ source, size = "sm" }: SourceBadgeProps) {
  const sourceConfig: Record<string, { label: string; color: BadgeColor }> = {
    github: { label: "GitHub", color: "gray" },
    mcp: { label: "MCP", color: "purple" },
    manual: { label: "Manual", color: "blue" },
  };

  const config = sourceConfig[source] || { label: source, color: "gray" as BadgeColor };

  return <Badge label={config.label} color={config.color} size={size} />;
}
