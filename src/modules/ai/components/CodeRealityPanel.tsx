import { useEffect } from "react";
import {
  RefreshCw as RefreshIcon,
  Boxes as SymbolIcon,
  TriangleAlert as DegradedIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/modules/workspace/workspaceStore";
import type { RepoContextResponse } from "../lib/native";
import { useRealityStore } from "../store/realityStore";
import { useStatusStore } from "../store/statusStore";
import { HarnessInspector } from "./HarnessInspector";
import { lspChips, memoryChips, type StatusChip } from "./statusChips";

// CodeReality panel: the visible repository "brain". Shows what Atlas indexed,
// what it skipped, how many symbols it extracted, and the token saving of the
// bounded projection vs naive file loading. All values come from the native
// projection — this never re-derives repo state in the frontend.

export type RealityStat = { label: string; value: string; hint?: string };

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Pure: turn a native snapshot into display stats. Tested without React. */
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

const CHIP_TONE: Record<StatusChip["tone"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  muted: "border-border/50 bg-card/50 text-muted-foreground",
};

export function CodeRealityPanel({
  onOpenFile,
}: {
  onOpenFile?: (path: string) => void;
} = {}) {
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);
  const status = useRealityStore((s) => s.status);
  const snapshot = useRealityStore((s) => s.snapshot);
  const task = useRealityStore((s) => s.task);
  const error = useRealityStore((s) => s.error);
  const refresh = useRealityStore((s) => s.refresh);
  const lsp = useStatusStore((s) => s.lsp);
  const memory = useStatusStore((s) => s.memory);
  const refreshStatus = useStatusStore((s) => s.refresh);

  useEffect(() => {
    void refresh(workspaceRoot);
    void refreshStatus(workspaceRoot);
  }, [workspaceRoot, refresh, refreshStatus]);

  if (!workspaceRoot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[11px] text-muted-foreground">
        <SymbolIcon size={22} strokeWidth={1.5} className="opacity-50" />
        Open a project to map its code reality.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <span className="flex-1 truncate text-xs font-medium text-foreground/80">
          Code Reality
        </span>
        {snapshot && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {freshnessLabel(snapshot)}
          </span>
        )}
        <button
          type="button"
          onClick={() => void refresh(workspaceRoot)}
          title="Re-index"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshIcon
            size={12}
            strokeWidth={1.5}
            className={cn(status === "loading" && "animate-spin")}
          />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {status === "unavailable" && (
          <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error ?? "Repository projection unavailable."}
          </div>
        )}

        {status === "loading" && !snapshot && (
          <div className="text-[11px] text-muted-foreground">Indexing…</div>
        )}

        {snapshot && (
          <>
            <HarnessInspector
              snapshot={snapshot}
              stats={formatRealityStats(snapshot)}
              workspaceRoot={workspaceRoot}
              task={task}
              onFocusTask={(focusedTask) => void refresh(workspaceRoot, focusedTask)}
              onOpenFile={onOpenFile}
            />

            {snapshot.degraded_files.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-amber-500">
                  <DegradedIcon size={11} strokeWidth={1.5} />
                  Degraded parses ({snapshot.degraded_files.length})
                </div>
                <ul className="flex flex-col gap-0.5">
                  {snapshot.degraded_files.slice(0, 20).map((f) => (
                    <li
                      key={f.path}
                      title={`${f.path} — ${f.status}`}
                      className="truncate px-1 text-[10px] text-muted-foreground"
                    >
                      {f.path}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 text-[10px] text-muted-foreground/70">
              watch: {snapshot.watch_status}
              {snapshot.truncated && " · projection truncated to budget"}
              {snapshot.parse_failures > 0 &&
                ` · ${snapshot.parse_failures} parse failures`}
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 px-3 py-2">
        <div className="mb-1.5 text-[10px] text-muted-foreground/70">
          indexes ts · tsx · js · py · rust · diagnostics are separate (below)
        </div>
        <div className="flex flex-wrap gap-1">
          {[...lspChips(lsp), ...memoryChips(memory)].map((chip) => (
            <span
              key={chip.label}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                CHIP_TONE[chip.tone],
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
