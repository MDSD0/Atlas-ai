import { describe, expect, it, vi } from "vitest";
import { SimpleMemAdapter } from "@/modules/ai/memory/simpleMem";
import { SimpleMemRunObserver } from "@/modules/ai/memory/simpleMemObserver";

describe("SimpleMemRunObserver", () => {
  it("injects bounded prior context and records one best-effort run lifecycle", async () => {
    const paths: string[] = [];
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path === "/cross/sessions/start") {
        return new Response(
          JSON.stringify({
            memory_session_id: "memory-1",
            context: "prior parser decision",
            context_tokens: 4,
          }),
        );
      }
      if (path.endsWith("/message")) return new Response('{"event_id":1}');
      if (path.endsWith("/tool-use")) return new Response('{"event_id":2}');
      if (path.endsWith("/stop")) {
        return new Response(
          '{"memory_session_id":"memory-1","observations_count":1,"summary_generated":true,"entries_stored":1}',
        );
      }
      return new Response('{"memory_session_id":"memory-1","status":"completed"}');
    });
    const observer = await SimpleMemRunObserver.start({
      workspaceRoot: "/repo",
      contentSessionId: "chat-1",
      userPrompt: "fix parser",
      adapter: new SimpleMemAdapter({ enabled: true, fetchImpl }),
    });

    expect(observer?.context).toContain("prior parser decision");
    expect(observer?.context).toContain("current source files override recalled records");
    await observer?.recordTool({
      toolName: "read_file",
      input: { path: "src/parser.ts" },
      output: { kind: "text" },
    });
    await observer?.finish();
    await observer?.finish();

    expect(paths).toEqual([
      "/cross/sessions/start",
      "/cross/sessions/memory-1/message",
      "/cross/sessions/memory-1/tool-use",
      "/cross/sessions/memory-1/stop",
      "/cross/sessions/memory-1/end",
    ]);
  });

  it("does not start without a bound project", async () => {
    const fetchImpl = vi.fn();
    await expect(
      SimpleMemRunObserver.start({
        workspaceRoot: null,
        contentSessionId: "chat-1",
        userPrompt: "hello",
        adapter: new SimpleMemAdapter({ enabled: true, fetchImpl }),
      }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
