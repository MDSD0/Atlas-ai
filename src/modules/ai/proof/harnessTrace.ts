import type { ProofRun } from "@/modules/ai/proof/contracts";

// Atlas Harness Eval trace: a flat, per-run JSON summary for benchmarking the
// architecture (not just outcome). Derived purely from a recorded ProofRun, so
// it reflects what actually happened, never an estimate. Token counts are NOT
// included here because they are only known during a live model run (they live
// in chatStore.agentMeta), not in the durable journal — a benchmark runner that
// has the live usage attaches them separately rather than this faking them.

export type HarnessTrace = {
  runId: string;
  sessionId: string;
  workspaceRoot: string | null;
  status: string;
  durationMs: number | null;
  /** Tool-call counts by tool name, parsed from event kinds (lane.tool.ok|failed). */
  toolCalls: Record<string, number>;
  /** Total recorded tool calls (sum of toolCalls). */
  toolCallCount: number;
  files: {
    /** Files the run actually changed (from mutation artifacts/verdict). */
    edited: string[];
  };
  /** Verification/check commands recorded (with exit info in their text). */
  checks: string[];
  diagnostics: string[];
  unresolvedFailures: string[];
  /** Whether a repo_context / repo_map projection was requested this run. */
  usedRepoMap: boolean;
  eventsDropped: number;
  artifactsDropped: number;
};

const TOOL_KIND = /^(?:read|mutation|shell)\.([^.]+)\.(ok|failed)$/;

/** Pure: flatten a recorded run into a benchmark trace. */
export function buildHarnessTrace(run: ProofRun): HarnessTrace {
  const toolCalls: Record<string, number> = {};
  let usedRepoMap = false;
  for (const event of run.events) {
    const match = TOOL_KIND.exec(event.kind);
    if (!match) continue;
    const tool = match[1];
    toolCalls[tool] = (toolCalls[tool] ?? 0) + 1;
    if (tool === "repo_context" || tool === "repo_map") usedRepoMap = true;
  }
  const toolCallCount = Object.values(toolCalls).reduce((a, b) => a + b, 0);

  return {
    runId: run.id,
    sessionId: run.sessionId,
    workspaceRoot: run.workspaceRoot,
    status: run.status,
    durationMs:
      run.finishedAt !== null ? run.finishedAt - run.startedAt : null,
    toolCalls,
    toolCallCount,
    files: {
      edited: (run.verdict?.changedFiles.items ?? []).map((f) => f.preview),
    },
    checks: (run.verdict?.checks.items ?? []).map((c) => c.preview),
    diagnostics: (run.verdict?.diagnostics.items ?? []).map((d) => d.preview),
    unresolvedFailures: (run.verdict?.unresolvedFailures.items ?? []).map(
      (f) => f.preview,
    ),
    usedRepoMap,
    eventsDropped: run.eventsDropped,
    artifactsDropped: run.artifactsDropped,
  };
}
