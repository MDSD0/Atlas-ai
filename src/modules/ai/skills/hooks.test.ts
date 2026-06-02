import { describe, expect, it } from "vitest";
import { LifecycleHookRunner } from "@/modules/ai/skills/hooks";

describe("LifecycleHookRunner", () => {
  it("runs enabled hooks in registration order and leaves disabled hooks inert", async () => {
    const order: string[] = [];
    const runner = new LifecycleHookRunner([
      {
        id: "first",
        enabled: true,
        events: ["before_tool"],
        run: () => void order.push("first"),
      },
      {
        id: "disabled",
        enabled: false,
        events: ["before_tool"],
        run: () => void order.push("disabled"),
      },
      {
        id: "second",
        enabled: true,
        events: ["before_tool"],
        run: () => void order.push("second"),
      },
    ]);

    await expect(runner.run("before_tool")).resolves.toMatchObject([
      { hookId: "first", status: "ok" },
      { hookId: "second", status: "ok" },
    ]);
    expect(order).toEqual(["first", "second"]);
  });

  it("isolates failures and timeouts", async () => {
    const runner = new LifecycleHookRunner(
      [
        {
          id: "failure",
          enabled: true,
          events: ["after_tool"],
          run: () => {
            throw new Error("broken hook");
          },
        },
        {
          id: "timeout",
          enabled: true,
          events: ["after_tool"],
          run: () => new Promise(() => {}),
        },
        {
          id: "later",
          enabled: true,
          events: ["after_tool"],
          run: () => "still runs",
        },
      ],
      5,
    );

    await expect(runner.run("after_tool")).resolves.toMatchObject([
      { hookId: "failure", status: "failed" },
      { hookId: "timeout", status: "timed_out" },
      { hookId: "later", status: "ok", detail: "still runs" },
    ]);
  });
});
