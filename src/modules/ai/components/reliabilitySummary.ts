import type { LocalMetricRecord } from "../metrics/contracts";
import type { ProofRun } from "../proof/contracts";

export type ReliabilitySummary = {
  finishedRuns: number;
  /** Runs where a recognized test/build/typecheck/lint check passed. */
  verifiedRuns: number;
  /** Runs that completed/smoke-checked but ran no recognized check. */
  softPassRuns: number;
  failedRuns: number;
  incompleteRuns: number;
  /** Strict ratio: only truly verified runs over all finished runs. */
  verifiedRatio: number;
  toolFailures: number;
};

export function summarizeReliability(
  runs: readonly ProofRun[],
  metrics: readonly LocalMetricRecord[],
): ReliabilitySummary {
  const finished = runs.filter((run) => run.status !== "running");
  const verifiedRuns = finished.filter(
    (run) => run.status === "verified",
  ).length;
  const softPassRuns = finished.filter(
    (run) => run.status === "smoke_checked" || run.status === "completed",
  ).length;
  const failedRuns = finished.filter((run) => run.status === "failed").length;
  const incompleteRuns = finished.filter(
    (run) => run.status === "unverified" || run.status === "cancelled",
  ).length;
  const toolFailures = metrics
    .filter(
      (metric) =>
        metric.name === "tool.completed" &&
        metric.attributes.status === "failed",
    )
    .reduce((total, metric) => total + metric.value, 0);

  return {
    finishedRuns: finished.length,
    verifiedRuns,
    softPassRuns,
    failedRuns,
    incompleteRuns,
    verifiedRatio:
      finished.length === 0 ? 0 : Math.round((verifiedRuns / finished.length) * 100),
    toolFailures,
  };
}

