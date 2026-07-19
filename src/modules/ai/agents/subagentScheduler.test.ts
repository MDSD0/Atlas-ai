import { afterEach, describe, expect, it } from "vitest";
import {
  resetSubagentSchedulerForTests,
  scheduleSubagent,
  subagentSchedulerSnapshot,
} from "./subagentScheduler";

afterEach(() => resetSubagentSchedulerForTests());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("subagent scheduler", () => {
  it("bounds a session to three active workers and starts the queue in order", async () => {
    const gates = Array.from({ length: 4 }, () => deferred<number>());
    const started: number[] = [];
    const jobs = gates.map((gate, index) =>
      scheduleSubagent({
        sessionId: "s1",
        onStart: () => started.push(index),
        run: () => gate.promise,
      }),
    );

    expect(started).toEqual([0, 1, 2]);
    expect(subagentSchedulerSnapshot()).toMatchObject({
      activeGlobal: 3,
      queued: 1,
    });
    gates[0].resolve(0);
    await jobs[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3]);

    gates[1].resolve(1);
    gates[2].resolve(2);
    gates[3].resolve(3);
    await Promise.all(jobs.slice(1));
  });

  it("removes an aborted queued worker without starting it", async () => {
    const gates = Array.from({ length: 3 }, () => deferred<void>());
    const active = gates.map((gate) =>
      scheduleSubagent({ sessionId: "s1", run: () => gate.promise }),
    );
    const controller = new AbortController();
    let started = false;
    const queued = scheduleSubagent({
      sessionId: "s1",
      signal: controller.signal,
      onStart: () => {
        started = true;
      },
      run: async () => undefined,
    });
    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toBe(false);
    expect(subagentSchedulerSnapshot().queued).toBe(0);
    gates.forEach((gate) => gate.resolve());
    await Promise.all(active);
  });
});
