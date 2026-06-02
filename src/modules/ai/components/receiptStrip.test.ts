import { describe, expect, it } from "vitest";
import { shouldShowReceipt } from "./ReceiptStrip";
import type { ReceiptSummary } from "../proof/recorder";

function summary(patch: Partial<ReceiptSummary> = {}): ReceiptSummary {
  return {
    runId: "r1",
    sessionId: "s1",
    status: "running",
    eventCount: 0,
    changedFiles: [],
    checks: [],
    diagnostics: [],
    failures: [],
    startedAt: 0,
    finishedAt: null,
    ...patch,
  };
}

describe("shouldShowReceipt", () => {
  it("hides a just-started run with no activity", () => {
    expect(shouldShowReceipt(summary())).toBe(false);
    expect(shouldShowReceipt(undefined)).toBe(false);
  });

  it("shows a running run once it has activity", () => {
    expect(shouldShowReceipt(summary({ eventCount: 1 }))).toBe(true);
    expect(shouldShowReceipt(summary({ changedFiles: ["/a.ts"] }))).toBe(true);
  });

  it("hides a finished run that recorded no actions (pure-chat turn)", () => {
    // A receipt is evidence of actions; an empty finished run has nothing to
    // prove and must not render "Incomplete - 0 actions" noise.
    expect(shouldShowReceipt(summary({ status: "incomplete" }))).toBe(false);
    expect(shouldShowReceipt(summary({ status: "cancelled" }))).toBe(false);
    expect(shouldShowReceipt(summary({ status: "passed" }))).toBe(false);
  });

  it("shows a finished verdict once it carries evidence", () => {
    expect(
      shouldShowReceipt(summary({ status: "failed", failures: ["boom"] })),
    ).toBe(true);
    expect(
      shouldShowReceipt(summary({ status: "passed", checks: ["npm test (exit 0)"] })),
    ).toBe(true);
    expect(
      shouldShowReceipt(summary({ status: "passed", changedFiles: ["/a.ts"] })),
    ).toBe(true);
  });
});
