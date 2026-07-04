import { describe, expect, it } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { wrapToolsWithLifecycle } from "@/modules/ai/tools/lifecycle";

describe("wrapToolsWithLifecycle", () => {
  it("observes before and after around the existing tool execute function", async () => {
    const order: string[] = [];
    const wrapped = wrapToolsWithLifecycle(
      {
        sample: tool({
          description: "sample",
          inputSchema: z.object({ value: z.number() }),
          execute: async ({ value }) => {
            order.push("execute");
            return { value: value + 1 };
          },
        }),
      },
      async (event) => void order.push(event),
    );

    await expect(wrapped.sample.execute?.({ value: 1 }, {} as never)).resolves.toEqual({
      value: 2,
    });
    expect(order).toEqual(["before_tool", "execute", "after_tool"]);
  });

  it("never waits on observe() — a hanging journal/hook call must not delay the tool", async () => {
    // A never-resolving observe (simulating a stuck journal write or hook)
    // must not stop the tool from completing: proof-journal/hook plumbing is
    // fire-and-forget, not on the tool-execution path.
    const wrapped = wrapToolsWithLifecycle(
      {
        sample: tool({
          description: "sample",
          inputSchema: z.object({ value: z.number() }),
          execute: async ({ value }) => ({ value: value + 1 }),
        }),
      },
      () => new Promise<void>(() => {}),
    );

    await expect(wrapped.sample.execute?.({ value: 1 }, {} as never)).resolves.toEqual({
      value: 2,
    });
  });

  it("still returns the tool's output even if observe() rejects", async () => {
    const wrapped = wrapToolsWithLifecycle(
      {
        sample: tool({
          description: "sample",
          inputSchema: z.object({ value: z.number() }),
          execute: async ({ value }) => ({ value: value + 1 }),
        }),
      },
      async () => {
        throw new Error("journal write failed");
      },
    );

    await expect(wrapped.sample.execute?.({ value: 1 }, {} as never)).resolves.toEqual({
      value: 2,
    });
  });
});
