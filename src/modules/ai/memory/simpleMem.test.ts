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
      endpoint: "http://127.0.0.1:8766/cross/health",
    });
    const [[calledUrl]] = fetchImpl.mock.calls as unknown as [[URL]];
    expect(String(calledUrl)).toBe("http://127.0.0.1:8766/cross/health");
  });

  it("refuses non-loopback endpoints", () => {
    expect(() => assertLoopbackHttpUrl("https://example.com")).toThrow(
      "credential-free loopback HTTP",
    );
  });

  it("wraps the upstream cross-session lifecycle and retrieval contract", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const responses: Record<string, unknown> = {
        "/cross/sessions/start": {
          memory_session_id: "memory-1",
          context: "prior context",
          context_tokens: 3,
        },
        "/cross/sessions/memory-1/message": { event_id: 1 },
        "/cross/sessions/memory-1/tool-use": { event_id: 2 },
        "/cross/sessions/memory-1/stop": {
          memory_session_id: "memory-1",
          observations_count: 2,
          summary_generated: true,
          entries_stored: 1,
        },
        "/cross/sessions/memory-1/end": {
          memory_session_id: "memory-1",
          status: "completed",
        },
        "/cross/search": {
          entries: [{ text: "remembered fact", score: 0.9, metadata: {} }],
          count: 1,
        },
        "/cross/stats": {
          sessions: 1,
          events: 2,
          observations: 2,
          summaries: 1,
        },
      };
      expect(init?.method).toBe(path === "/cross/stats" ? "GET" : "POST");
      return new Response(JSON.stringify(responses[path]));
    });
    const adapter = new SimpleMemAdapter({ enabled: true, fetchImpl });

    await expect(
      adapter.startSession({
        tenantId: "local",
        contentSessionId: "chat-1",
        project: "/repo",
        userPrompt: "fix parser",
      }),
    ).resolves.toMatchObject({ memory_session_id: "memory-1" });
    await expect(adapter.recordMessage("memory-1", "fix parser")).resolves.toEqual({
      event_id: 1,
    });
    await expect(
      adapter.recordToolUse("memory-1", "read_file", { path: "src/a.ts" }, "ok"),
    ).resolves.toEqual({ event_id: 2 });
    await expect(adapter.stopSession("memory-1")).resolves.toMatchObject({
      entries_stored: 1,
    });
    await expect(adapter.endSession("memory-1")).resolves.toMatchObject({
      status: "completed",
    });
    await expect(adapter.search({ query: "parser", tenantId: "local" })).resolves.toMatchObject({
      count: 1,
    });
    await expect(adapter.stats()).resolves.toMatchObject({ sessions: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    const start = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(start).toMatchObject({
      tenant_id: "local",
      content_session_id: "chat-1",
      project: "/repo",
      user_prompt: "fix parser",
    });
  });

  it("refuses secret-bearing sidecar events before touching the network", async () => {
    const fetchImpl = vi.fn();
    const adapter = new SimpleMemAdapter({ enabled: true, fetchImpl });

    expect(() =>
      adapter.recordMessage("memory-1", "API_KEY=super-secret-value"),
    ).toThrow("possible secret material");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails visibly when an enabled sidecar returns malformed JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json"));
    const adapter = new SimpleMemAdapter({ enabled: true, fetchImpl });

    await expect(adapter.stats()).rejects.toThrow("returned invalid JSON");
  });
});
