interface ProgressProps {
  value: number; // 0-100
  size?: "sm" | "md";
  showLabel?: boolean;
}

export function Progress({ value, size = "sm", showLabel = false }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  const heightClass = size === "sm" ? "h-1.5" : "h-2";

  const getColorClass = (val: number): string => {
    if (val >= 80) return "bg-green-500";
    if (val >= 50) return "bg-blue-500";
    if (val >= 25) return "bg-yellow-500";
    return "bg-gray-400";
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Progress
          </span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {clampedValue}%
          </span>
        </div>
      )}
      <div
        className={`w-full ${heightClass} bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden`}
      >
        <div
          className={`${heightClass} ${getColorClass(clampedValue)} rounded-full transition-all duration-300`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
