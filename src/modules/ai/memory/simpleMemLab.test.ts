import { describe, expect, it, vi } from "vitest";
import { SimpleMemAdapter } from "@/modules/ai/memory/simpleMem";
import { probeSimpleMem } from "@/modules/ai/memory/simpleMemLab";

describe("probeSimpleMem", () => {
  it("measures a real lifecycle and retrieval sample without claiming unsupported gates", async () => {
    const marker = "atlas-memorylab-test";
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const path = new URL(String(url)).pathname;
      if (path === "/cross/health") {
        return new Response('{"status":"ok","service":"simplemem-cross"}');
      }
      if (path === "/cross/sessions/start") {
        return new Response('{"memory_session_id":"memory-1","context":"","context_tokens":0}');
      }
      if (path.endsWith("/message")) return new Response('{"event_id":1}');
      if (path.endsWith("/stop")) {
        return new Response(
          '{"memory_session_id":"memory-1","observations_count":1,"summary_generated":true,"entries_stored":1}',
        );
      }
      if (path.endsWith("/end")) {
        return new Response('{"memory_session_id":"memory-1","status":"completed"}');
      }
      if (path === "/cross/search") {
        return new Response(
          JSON.stringify({
            entries: [{ text: `remember ${marker}`, score: 1, metadata: {} }],
            count: 1,
          }),
        );
      }
      return new Response('{"sessions":1,"events":1,"observations":1,"summaries":1}');
    });

    await expect(
      probeSimpleMem(new SimpleMemAdapter({ enabled: true, fetchImpl }), marker),
    ).resolves.toMatchObject({
      provider: "simplemem",
      status: "measured",
      lifecycle: {
        started: true,
        messageRecorded: true,
        finalized: true,
        ended: true,
      },
      retrieval: { observed: true, resultCount: 1 },
    });
  });

  it("keeps context injection disabled when the sidecar is absent", async () => {
    const fetchImpl = vi.fn(async () => new Response("offline", { status: 503 }));

    await expect(
      probeSimpleMem(new SimpleMemAdapter({ enabled: true, fetchImpl }), "probe"),
    ).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
