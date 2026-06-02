import { describe, expect, it, vi } from "vitest";
import {
  assertLoopbackHttpUrl,
  SimpleMemAdapter,
} from "@/modules/ai/memory/simpleMem";

describe("SimpleMemAdapter", () => {
  it("stays disabled without touching the network by default", async () => {
    const fetchImpl = vi.fn();
    await expect(new SimpleMemAdapter({ fetchImpl }).health()).resolves.toMatchObject({
      provider: "simplemem",
      status: "disabled",
      optional: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("probes only the optional loopback health endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"status":"ok"}'));
    await expect(
      new SimpleMemAdapter({
        enabled: true,
        fetchImpl,
        clock: () => 10,
      }).health(),
    ).resolves.toMatchObject({
      provider: "simplemem",
      status: "available",
      endpoint: "http://127.0.0.1:8766/health",
    });
    const [[calledUrl]] = fetchImpl.mock.calls as unknown as [[URL]];
    expect(String(calledUrl)).toBe("http://127.0.0.1:8766/health");
  });

  it("refuses non-loopback endpoints", () => {
    expect(() => assertLoopbackHttpUrl("https://example.com")).toThrow(
      "loopback HTTP",
    );
  });
});
