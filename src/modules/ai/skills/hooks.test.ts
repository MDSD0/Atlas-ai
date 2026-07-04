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

  it("accepts a hooks provider function and re-resolves it on every run() call (F-10)", async () => {
    let currentId = "first";
    const runner = new LifecycleHookRunner(() => [
      {
        id: currentId,
        enabled: true,
        events: ["run_start"],
        run: () => `ran as ${currentId}`,
      },
    ]);

    await expect(runner.run("run_start")).resolves.toMatchObject([
      { hookId: "first", detail: "ran as first" },
    ]);

    // Changing what the provider returns (simulating a skill being
    // enabled/disabled between runs) must be picked up on the next call —
    // proves the runner isn't caching a stale hook list.
    currentId = "second";
    await expect(runner.run("run_start")).resolves.toMatchObject([
      { hookId: "second", detail: "ran as second" },
    ]);
  });

  it("fails closed (no hooks fired) when a dynamic hooks provider throws (F-10)", async () => {
    const runner = new LifecycleHookRunner(() => {
      throw new Error("storage unavailable");
    });
    await expect(runner.run("run_start")).resolves.toEqual([]);
  });

  it("fails closed when a dynamic hooks provider rejects", async () => {
    const runner = new LifecycleHookRunner(() => Promise.reject(new Error("storage unavailable")));
    await expect(runner.run("run_start")).resolves.toEqual([]);
  });
});
