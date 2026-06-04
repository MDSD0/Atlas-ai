import { describe, expect, it } from "vitest";
import { boundText, boundTextList, type ProofRun } from "./contracts";
import { buildHarnessTrace } from "./harnessTrace";

function event(kind: string, sequence: number) {
  return {
    id: `r:event:${sequence}`,
    runId: "r",
    sequence,
    kind,
    startedAt: 0,
    finishedAt: 1,
    summary: boundText(kind, 64),
    boundedPayload: null,
  };
}

function run(): ProofRun {
  return {
    id: "r",
    sessionId: "s1",
    workspaceRoot: "/repo",
    startedAt: 100,
    finishedAt: 250,
    status: "verified",
    nextSequence: 6,
    events: [
      event("read.repo_context.ok", 1),
      event("read.read_file.ok", 2),
      event("read.read_file.ok", 3),
      event("mutation.edit.ok", 4),
      event("shell.bash_run.ok", 5),
    ],
    eventsDropped: 0,
    artifacts: [],
    artifactsDropped: 0,
    verdict: {
      runId: "r",
      status: "verified",
      changedFiles: boundTextList(["src/cart.ts"]),
      diagnostics: boundTextList([]),
      checks: boundTextList(["pnpm test (exit 0)"]),
      unresolvedFailures: boundTextList([]),
    },
  };
}

describe("buildHarnessTrace", () => {
  it("counts tool calls by name from event kinds", () => {
    const trace = buildHarnessTrace(run());
    expect(trace.toolCalls).toEqual({
      repo_context: 1,
      read_file: 2,
      edit: 1,
      bash_run: 1,
    });
    expect(trace.toolCallCount).toBe(5);
  });

  it("flags repo-map usage and reports edited files + checks + duration", () => {
    const trace = buildHarnessTrace(run());
    expect(trace.usedRepoMap).toBe(true);
    expect(trace.files.edited).toEqual(["src/cart.ts"]);
    expect(trace.checks).toEqual(["pnpm test (exit 0)"]);
    expect(trace.durationMs).toBe(150);
    expect(trace.status).toBe("verified");
  });

  it("does not flag repo map when only plain reads happened", () => {
    const r = run();
    r.events = [event("read.read_file.ok", 1)];
    r.verdict = null;
    const trace = buildHarnessTrace(r);
    expect(trace.usedRepoMap).toBe(false);
    expect(trace.files.edited).toEqual([]);
    expect(trace.durationMs).toBe(150);
  });
});
