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

  it("drops requests after an approval response is recorded", () => {
    const answered = {
      type: "tool-write_file",
      state: "approval-requested",
      approval: { id: "a1" },
      input: { path: "src/demo.ts" },
    };
    const stillPending = {
      type: "tool-edit",
      state: "approval-requested",
      approval: { id: "a2" },
      input: { path: "src/demo.ts" },
    };

    const pending = collectPendingApprovals([
      { id: "m1", role: "assistant", parts: [answered, stillPending] },
      {
        id: "m2",
        role: "assistant",
        parts: [
          {
            ...answered,
            state: "approval-responded",
            approval: { id: "a1", approved: true },
          },
        ],
      },
    ] as any);

    expect(pending.map((p) => p.part.approval.id)).toEqual(["a2"]);
  });

  it.each(["output-available", "output-error", "output-denied"])(
    "drops requests after terminal state %s",
    (state) => {
      const approval = {
        type: "tool-bash_run",
        state: "approval-requested",
        approval: { id: "a1" },
        input: { command: "npm test" },
      };

      const pending = collectPendingApprovals([
        { id: "m1", role: "assistant", parts: [approval] },
        {
          id: "m2",
          role: "assistant",
          parts: [{ ...approval, state }],
        },
      ] as any);

      expect(pending).toEqual([]);
    },
  );
});
