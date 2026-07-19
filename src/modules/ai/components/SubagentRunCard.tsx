import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  CircleX,
  GitBranch,
} from "lucide-react";
import { useMemo } from "react";
import {
  useSubagentActivityStore,
  type SubagentActivity,
} from "../agents/subagentActivityStore";

type Props = {
  toolName: "run_subagent" | "run_subagents" | "worktree_run";
  toolCallId: string;
  state: string;
  input: unknown;
  output: unknown;
};

type OutputResult = {
  runId?: string;
  type?: string;
  description?: string;
  summary?: string;
  error?: string;
  durationMs?: number;
};

function outputResults(output: unknown): OutputResult[] {
  if (!output || typeof output !== "object") return [];
  const record = output as OutputResult & { results?: unknown };
  if (Array.isArray(record.results)) {
    return record.results.filter(
      (result): result is OutputResult => !!result && typeof result === "object",
    );
  }
  return [record];
}

function inputRows(toolName: Props["toolName"], input: unknown): OutputResult[] {
  if (!input || typeof input !== "object") return [];
  const record = input as {
    type?: string;
    description?: string;
    path?: string;
    jobs?: unknown;
  };
  if (Array.isArray(record.jobs)) {
    return record.jobs.filter(
      (job): job is OutputResult => !!job && typeof job === "object",
    );
  }
  if (toolName === "worktree_run") {
    return [{
      type: "worktree",
      description: record.path
        ? `Worker · ${record.path.replace(/\\/g, "/").split("/").pop()}`
        : "Worktree worker",
    }];
  }
  return [{ type: record.type, description: record.description }];
}

function fallbackActivity(
  row: OutputResult,
  index: number,
  state: string,
): SubagentActivity {
  const failed = !!row.error || state === "output-error";
  const cancelled = state === "output-denied";
  const completed = state === "output-available";
  return {
    id: row.runId ?? `fallback-${index}`,
    parentCallId: "",
    sessionId: "",
    kind: row.type ?? "agent",
    description: row.description?.trim() || row.type || "Subagent",
    status: failed
      ? "failed"
      : cancelled
        ? "cancelled"
        : completed
          ? "completed"
          : "running",
    step: null,
    summary: row.summary ?? null,
    error: row.error ?? null,
    startedAt: null,
    endedAt: null,
    durationMs: row.durationMs ?? null,
  };
}

function statusLabel(run: SubagentActivity): string {
  if (run.status === "queued") return "Queued";
  if (run.status === "running") return run.step ?? "Working";
  if (run.status === "cancelled") return "Cancelled";
  if (run.status === "failed") return "Failed";
  return run.durationMs == null
    ? "Complete"
    : `Complete · ${(run.durationMs / 1000).toFixed(1)}s`;
}

function StatusIcon({ run }: { run: SubagentActivity }) {
  if (run.status === "running") return <Spinner className="size-3" />;
  if (run.status === "completed") return <Check className="size-3 text-primary" />;
  if (run.status === "failed" || run.status === "cancelled") {
    return <CircleX className="size-3 text-destructive" />;
  }
  return <Circle className="size-2.5 text-muted-foreground/60" />;
}

export function SubagentRunCard({
  toolName,
  toolCallId,
  state,
  input,
  output,
}: Props) {
  const activities = useSubagentActivityStore((store) => store.runs);
  const live = useMemo(
    () =>
      Object.values(activities)
        .filter((run) => run.parentCallId === toolCallId)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [activities, toolCallId],
  );
  const runs = useMemo(() => {
    if (live.length > 0) return live;
    const outputRows = outputResults(output);
    const inputs = inputRows(toolName, input);
    const rows =
      outputRows.length > 0
        ? outputRows.map((row, index) => ({ ...inputs[index], ...row }))
        : inputs;
    return rows.map((row, index) => fallbackActivity(row, index, state));
  }, [input, live, output, state, toolName]);
  const active = runs.filter(
    (run) => run.status === "queued" || run.status === "running",
  ).length;
  const Icon = toolName === "worktree_run" ? GitBranch : Bot;

  return (
    <section
      className="overflow-hidden rounded-md border border-border/60 bg-card/45"
      aria-label="Subagent activity"
      aria-live="polite"
    >
      <div className="flex h-8 items-center gap-2 border-b border-border/50 px-2.5">
        <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.6} />
        <span className="text-[12px] font-medium text-foreground">
          {toolName === "worktree_run"
            ? "Worktree agent"
            : runs.length === 1
              ? "Subagent"
              : `${runs.length} subagents`}
        </span>
        <span className="ml-auto text-[10.5px] text-muted-foreground">
          {active > 0 ? `${active} active` : "Finished"}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {runs.map((run) => (
          <div key={run.id} className="px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <StatusIcon run={run} />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">
                {run.description}
              </span>
              <span
                className={cn(
                  "max-w-40 truncate text-[10.5px] text-muted-foreground",
                  run.status === "failed" && "text-destructive",
                )}
              >
                {statusLabel(run)}
              </span>
            </div>
            {run.error ? (
              <p className="mt-1.5 pl-5 text-[11px] leading-4 text-destructive">
                {run.error}
              </p>
            ) : run.summary ? (
              <details className="group mt-1.5 pl-5">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground">
                  <ChevronDown className="size-3 -rotate-90 transition-transform duration-150 group-open:rotate-0" />
                  Result
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">
                  {run.summary}
                </p>
              </details>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
