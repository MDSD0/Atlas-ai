import { describe, expect, it } from "vitest";
import { withFileMutationQueue } from "./fileMutationQueue";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition not reached");
}

describe("file mutation queue", () => {
  const identity = async (path: string) => path;

  it("serializes operations for the same canonical file", async () => {
    const gate = deferred();
    const events: string[] = [];
    const first = withFileMutationQueue(
      "/repo/value.ts",
      async () => {
        events.push("first:start");
        await gate.promise;
        events.push("first:end");
      },
      identity,
    );
    await waitFor(() => events.includes("first:start"));

    const second = withFileMutationQueue(
      "/repo/value.ts",
      async () => {
        events.push("second:start");
      },
      identity,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["first:start"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("serializes aliases that canonicalize to the same file", async () => {
    const gate = deferred();
    const events: string[] = [];
    const canonicalize = async () => "/repo/real.ts";
    const first = withFileMutationQueue(
      "/repo/link.ts",
      async () => {
        events.push("first:start");
        await gate.promise;
      },
      canonicalize,
    );
    await waitFor(() => events.includes("first:start"));

    const second = withFileMutationQueue(
      "/repo/real.ts",
      async () => {
        events.push("second:start");
      },
      canonicalize,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["first:start"]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "second:start"]);
  });

  it("keeps operations for different files parallel", async () => {
    const gate = deferred();
    const events: string[] = [];
    const first = withFileMutationQueue(
      "/repo/a.ts",
      async () => {
        events.push("a:start");
        await gate.promise;
      },
      identity,
    );
    const second = withFileMutationQueue(
      "/repo/b.ts",
      async () => {
        events.push("b:start");
      },
      identity,
    );

    await waitFor(() => events.includes("a:start") && events.includes("b:start"));
    gate.resolve();
    await Promise.all([first, second]);
  });

  it("releases the next waiter after a rejected mutation", async () => {
    const events: string[] = [];
    const first = withFileMutationQueue(
      "/repo/value.ts",
      async () => {
        events.push("first");
        throw new Error("expected failure");
      },
      identity,
    ).catch(() => undefined);
    const second = withFileMutationQueue(
      "/repo/value.ts",
      async () => {
        events.push("second");
      },
      identity,
    );

    await Promise.all([first, second]);
    expect(events).toEqual(["first", "second"]);
  });
});
