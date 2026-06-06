import { describe, expect, it } from "vitest";
import { receiptNeedsAttention, shouldShowReceipt } from "./ReceiptStrip";
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
    expect(shouldShowReceipt(summary({ status: "unverified" }))).toBe(false);
    expect(shouldShowReceipt(summary({ status: "cancelled" }))).toBe(false);
    expect(shouldShowReceipt(summary({ status: "verified" }))).toBe(false);
  });

  it("shows a finished verdict once it carries evidence", () => {
    expect(
      shouldShowReceipt(summary({ status: "failed", failures: ["boom"] })),
    ).toBe(true);
    expect(
      shouldShowReceipt(summary({ status: "verified", checks: ["npm test (exit 0)"] })),
    ).toBe(true);
    expect(
      shouldShowReceipt(summary({ status: "completed", changedFiles: ["/a.ts"] })),
    ).toBe(true);
  });
});

describe("receiptNeedsAttention", () => {
  it("auto-expands runs that need eyes — failures or diagnostics", () => {
    expect(receiptNeedsAttention(summary({ status: "failed", failures: ["boom"] }))).toBe(true);
    expect(receiptNeedsAttention(summary({ diagnostics: ["TS2345 on foo.ts"] }))).toBe(true);
  });

  it("stays collapsed for clean runs (quiet by default)", () => {
    expect(
      receiptNeedsAttention(summary({ status: "verified", checks: ["npm test (exit 0)"] })),
    ).toBe(false);
    expect(
      receiptNeedsAttention(summary({ status: "completed", changedFiles: ["/a.ts", "/b.ts"] })),
    ).toBe(false);
    expect(receiptNeedsAttention(summary({ status: "smoke_checked", eventCount: 3 }))).toBe(false);
  });
});
