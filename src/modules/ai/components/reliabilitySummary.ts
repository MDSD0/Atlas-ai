import type { LocalMetricRecord } from "../metrics/contracts";
import type { ProofRun } from "../proof/contracts";

export type ReliabilitySummary = {
  finishedRuns: number;
  verifiedRuns: number;
  failedRuns: number;
  incompleteRuns: number;
  verifiedRatio: number;
  toolFailures: number;
};

export function summarizeReliability(
  runs: readonly ProofRun[],
  metrics: readonly LocalMetricRecord[],
): ReliabilitySummary {
  const finished = runs.filter((run) => run.status !== "running");
  const verifiedRuns = finished.filter((run) => run.status === "passed").length;
  const failedRuns = finished.filter((run) => run.status === "failed").length;
  const incompleteRuns = finished.filter(
    (run) => run.status === "incomplete" || run.status === "cancelled",
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
    failedRuns,
    incompleteRuns,
    verifiedRatio:
      finished.length === 0 ? 0 : Math.round((verifiedRuns / finished.length) * 100),
    toolFailures,
  };
}

