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

  it("always shows a finished verdict, even with no events", () => {
    expect(shouldShowReceipt(summary({ status: "passed" }))).toBe(true);
    expect(shouldShowReceipt(summary({ status: "failed" }))).toBe(true);
    expect(shouldShowReceipt(summary({ status: "incomplete" }))).toBe(true);
    expect(shouldShowReceipt(summary({ status: "cancelled" }))).toBe(true);
  });
});
