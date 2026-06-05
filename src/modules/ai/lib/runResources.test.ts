import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginRunResources,
  configureRunResourceKillerForTests,
  killRunResourcesForSession,
  registerRunBackgroundHandle,
  releaseRunResources,
  resetRunResourcesForTests,
} from "./runResources";

describe("run resource cancellation", () => {
  const killed: number[] = [];

  beforeEach(() => {
    killed.length = 0;
    configureRunResourceKillerForTests((handle) => {
      killed.push(handle);
    });
  });

  afterEach(() => {
    resetRunResourcesForTests();
  });

  it("kills registered background handles when the run aborts", () => {
    const controller = new AbortController();
    beginRunResources("s1", controller.signal);
    registerRunBackgroundHandle("s1", controller.signal, 7);
    registerRunBackgroundHandle("s1", controller.signal, 8);

    controller.abort();

    expect(killed).toEqual([7, 8]);
  });

  it("does not kill handles on normal release", () => {
    const controller = new AbortController();
    beginRunResources("s1", controller.signal);
    registerRunBackgroundHandle("s1", controller.signal, 7);

    releaseRunResources("s1", controller.signal);
    controller.abort();

    expect(killed).toEqual([]);
  });

  it("kills each handle only once when stop races with abort", () => {
    const controller = new AbortController();
    beginRunResources("s1", controller.signal);
    registerRunBackgroundHandle("s1", controller.signal, 7);

    killRunResourcesForSession("s1");
    controller.abort();

    expect(killed).toEqual([7]);
  });

  it("ignores stale signals for a newer run in the same session", () => {
    const oldRun = new AbortController();
    const nextRun = new AbortController();
    beginRunResources("s1", nextRun.signal);

    registerRunBackgroundHandle("s1", oldRun.signal, 1);
    registerRunBackgroundHandle("s1", nextRun.signal, 2);
    oldRun.abort();
    nextRun.abort();

    expect(killed).toEqual([2]);
  });
});
