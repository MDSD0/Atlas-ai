import { beforeEach, describe, expect, it } from "vitest";
import type { ReceiptSummary } from "@/modules/ai/proof/recorder";
import { useProofStore } from "@/modules/ai/store/proofStore";

function summary(patch: Partial<ReceiptSummary> = {}): ReceiptSummary {
  return {
    runId: "run-1",
    sessionId: "session-1",
    status: "verified",
    eventCount: 5,
    actionCount: 1,
    changedFiles: ["src/a.ts"],
    checks: ["pnpm test (exit 0)"],
    diagnostics: [],
    failures: [],
    startedAt: 1,
    finishedAt: 2,
    ...patch,
  };
}

describe("proofStore meaningful receipt selection", () => {
  beforeEach(() => useProofStore.setState({ latestBySession: {}, currentBySession: {} }));

  it("keeps the previous verified receipt during a later chat-only turn", () => {
    const store = useProofStore.getState();
    store.setSummary(summary());
    store.setSummary(
      summary({
        runId: "chat-only",
        status: "unverified",
        eventCount: 4,
        actionCount: 0,
        changedFiles: [],
        checks: [],
      }),
    );

    expect(useProofStore.getState().latestBySession["session-1"]?.runId).toBe("run-1");
    expect(useProofStore.getState().currentBySession["session-1"]?.runId).toBe("chat-only");
  });

  it("replaces the prior receipt when a new run performs a tool action", () => {
    const store = useProofStore.getState();
    store.setSummary(summary());
    store.setSummary(
      summary({
        runId: "read-run",
        status: "completed",
        actionCount: 1,
        changedFiles: [],
        checks: [],
      }),
    );

    expect(useProofStore.getState().latestBySession["session-1"]?.runId).toBe("read-run");
  });

  it("shows a run-level failure even when no tool completed", () => {
    useProofStore.getState().setSummary(
      summary({
        runId: "failed-before-tool",
        status: "failed",
        actionCount: 0,
        changedFiles: [],
        checks: [],
      }),
    );

    expect(useProofStore.getState().latestBySession["session-1"]?.runId).toBe("failed-before-tool");
  });
});
