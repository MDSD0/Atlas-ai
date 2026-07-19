import { describe, expect, it, vi, afterEach } from "vitest";
import {
  consumePartialOverride,
  setPartialOverride,
} from "./partialAccept";

describe("partialAccept", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("consumes the override once for the matching path", () => {
    setPartialOverride("s1", "C:/w/a.ts", "merged");
    expect(consumePartialOverride("s1", "C:\\w\\A.ts")).toBe("merged");
    expect(consumePartialOverride("s1", "C:/w/a.ts")).toBeNull();
  });

  it("leaves the slot alone for a different path", () => {
    setPartialOverride("s1", "C:/w/a.ts", "merged");
    expect(consumePartialOverride("s1", "C:/w/other.ts")).toBeNull();
    expect(consumePartialOverride("s1", "C:/w/a.ts")).toBe("merged");
  });

  it("expires stale overrides instead of applying them to later writes", () => {
    vi.useFakeTimers();
    setPartialOverride("s1", "C:/w/a.ts", "merged");
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(consumePartialOverride("s1", "C:/w/a.ts")).toBeNull();
  });

  it("is session-scoped", () => {
    setPartialOverride("s1", "C:/w/a.ts", "merged");
    expect(consumePartialOverride("s2", "C:/w/a.ts")).toBeNull();
  });
});
