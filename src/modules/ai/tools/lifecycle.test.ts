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
});
