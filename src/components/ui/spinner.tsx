import { cn } from "@/lib/utils";

/**
 * Infinity-loop activity indicator: a bright dash chasing around a lemniscate
 * over a faint full track. pathLength normalizes the curve to 100 so the
 * dash timing is resolution-independent.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const d =
    "M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4Z";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      role="status"
      aria-label="Loading"
      className={cn("size-4", className)}
      {...props}
    >
      <path d={d} opacity={0.25} />
      <path
        d={d}
        pathLength={100}
        strokeDasharray="28 72"
        style={{ animation: "atlas-infinity-dash 1.4s linear infinite" }}
      />
    </svg>
  );
}

export { Spinner };
