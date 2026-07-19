import type { RepoContextResponse } from "@/modules/ai/lib/native";

/**
 * Shared helpers for repository-projection surfaces. The former sidebar
 * Impact panel was replaced by the full Obsidian-style graph tab
 * (RepoGraphPane); these formatting/path helpers survive it.
 */

export type RealityStat = { label: string; value: string; hint?: string };

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function formatRealityStats(snap: RepoContextResponse): RealityStat[] {
  const saving = pct(
    Math.max(0, snap.naive_tokens - snap.projected_tokens),
    snap.naive_tokens,
  );
  return [
    {
      label: "Files scanned",
      value: snap.file_count.toLocaleString(),
      hint:
        snap.parse_failures > 0
          ? `${snap.parse_failures.toLocaleString()} unparsed (binary/large/unsupported)`
          : "all parseable files read",
    },
    {
      label: "Symbols",
      value: snap.symbol_count.toLocaleString(),
      hint: `${snap.definition_count.toLocaleString()} defs · ${snap.reference_count.toLocaleString()} refs`,
    },
    {
      label: "Ignored dirs",
      value: snap.skipped_dirs.toLocaleString(),
      hint: "generated / dependency trees pruned",
    },
    {
      label: "Context saving",
      value: `${saving}%`,
      hint: `${snap.projected_tokens.toLocaleString()} vs ${snap.naive_tokens.toLocaleString()} naive tokens`,
    },
  ];
}

export function freshnessLabel(snap: RepoContextResponse): string {
  const seconds = Math.max(0, Math.round((Date.now() - snap.indexed_at_ms) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function resolveRepoDisplayPath(workspaceRoot: string, path: string): string {
  if (
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.startsWith("/") ||
    path.startsWith("\\\\")
  ) {
    return path;
  }
  const separator = workspaceRoot.includes("\\") ? "\\" : "/";
  return `${workspaceRoot.replace(/[\\/]+$/, "")}${separator}${path.replace(/^[\\/]+/, "")}`;
}
