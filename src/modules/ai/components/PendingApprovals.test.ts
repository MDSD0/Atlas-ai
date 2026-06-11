import { describe, expect, it } from "vitest";
import { collectPendingApprovals } from "./PendingApprovals";

describe("collectPendingApprovals", () => {
  it("dedupes replayed approval requests by approval id", () => {
    const approval = {
      type: "tool-bash_run",
      state: "approval-requested",
      approval: { id: "a1" },
      input: { command: "npm test" },
    };

    const pending = collectPendingApprovals([
      { id: "m1", role: "assistant", parts: [approval] },
      { id: "m1", role: "assistant", parts: [approval] },
      {
        id: "m2",
        role: "assistant",
        parts: [{ ...approval, approval: { id: "a2" } }],
      },
    ] as any);

    expect(pending.map((p) => p.part.approval.id)).toEqual(["a1", "a2"]);
  });
});
