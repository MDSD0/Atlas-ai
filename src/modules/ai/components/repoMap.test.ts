import { describe, expect, it } from "vitest";
import type { LocalMetricRecord } from "../metrics/contracts";
import type { ProofRun } from "../proof/contracts";
import { summarizeReliability } from "./reliabilitySummary";

// The force-layout buildRepoMap tests retired with the layout itself — the
// hierarchical Map model is covered in repoGraphPane.test.ts.

function run(id: string, status: ProofRun["status"]): ProofRun {
  return {
    id,
    sessionId: "session",
    workspaceRoot: "/repo",
    startedAt: 1,
    finishedAt: status === "running" ? null : 2,
    status,
    nextSequence: 1,
    events: [],
    eventsDropped: 0,
    artifacts: [],
    artifactsDropped: 0,
    verdict: null,
  };
}

describe("summarizeReliability", () => {
  it("reports verified ratio and failed tool measurements", () => {
    const metrics: LocalMetricRecord[] = [
      {
        id: "metric-1",
        name: "tool.completed",
        value: 2,
        unit: "count",
        attributes: { status: "failed" },
        recordedAt: 1,
      },
    ];

    expect(
      summarizeReliability(
        [run("verified", "verified"), run("failed", "failed"), run("live", "running")],
        metrics,
      ),
    ).toEqual({
      finishedRuns: 2,
      verifiedRuns: 1,
      softPassRuns: 0,
      failedRuns: 1,
      incompleteRuns: 0,
      verifiedRatio: 50,
      toolFailures: 2,
    });
  });
});
