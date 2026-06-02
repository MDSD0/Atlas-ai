import { tool, type ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildPackedContextSnapshot,
  type PackedContextSnapshot,
} from "@/modules/ai/contextLedger/contracts";
import {
  contextLedger,
  useContextLedgerStore,
} from "@/modules/ai/contextLedger/store";

const binding = `<atlas_context>
project_id: /repo
active_file: /repo/src/main.ts
</atlas_context>`;

async function snapshot(
  patch: Partial<Parameters<typeof buildPackedContextSnapshot>[0]> = {},
) {
  return buildPackedContextSnapshot({
    projectId: "/repo",
    sessionId: "session-1",
    modelId: "test-model",
    activeFile: "/repo/src/main.ts",
    contextLimit: 100_000,
    stableSources: [
      {
        id: "system_prompt",
        label: "System prompt",
        source: "test",
        content: "You are Atlas.",
      },
      {
        id: "memory_index",
        label: "MEMORY.md",
        source: ".atlas/memory/MEMORY.md",
        content: null,
      },
    ],
    sessionBinding: binding,
    compactedHistory: [
      { role: "user", content: `${binding}\n\nFix auth.` },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "read_file",
            output: {
              type: "json",
              value: { text: "API_KEY=super-secret-value" },
            },
          },
        ],
      } as ModelMessage,
    ],
    compacted: false,
    droppedCount: 0,
    tools: {
      read_file: tool({
        description: "Read one bounded UTF-8 file.",
        inputSchema: z.object({ path: z.string() }),
        execute: async () => ({ ok: true }),
      }),
    },
    capturedAt: 123,
    ...patch,
  });
}

describe("packed context ledger", () => {
  it("accounts for schemas, bindings, history, and tool results without retaining bodies", async () => {
    const packed = await snapshot();
    const byId = Object.fromEntries(packed.items.map((item) => [item.id, item]));

    expect(byId.session_binding.tokenEstimate).toBeGreaterThan(0);
    expect(byId.conversation_history.tokenEstimate).toBeGreaterThan(0);
    expect(byId.tool_results.tokenEstimate).toBeGreaterThan(0);
    expect(byId.tool_definitions.tokenEstimate).toBeGreaterThan(0);
    expect(byId.memory_index.status).toBe("not_loaded");
    expect(packed.estimatedBytes).toBe(
      packed.items.reduce((sum, item) => sum + item.bytes, 0),
    );
    const serialized = JSON.stringify(packed);
    expect(serialized).not.toContain("Fix auth");
    expect(serialized).not.toContain("super-secret-value");
  });

  it("surfaces critical pressure instead of silently accepting an oversized pack", async () => {
    await expect(
      snapshot({
        contextLimit: 100,
        stableSources: [
          {
            id: "system_prompt",
            label: "System prompt",
            source: "test",
            content: "x".repeat(400),
          },
        ],
        compactedHistory: [],
        tools: {},
      }),
    ).resolves.toMatchObject({ pressure: "critical" });
  });

  it("keeps latest packed requests isolated by project", async () => {
    useContextLedgerStore.setState({ latestByProject: {} });
    const first = await snapshot();
    const second: PackedContextSnapshot = {
      ...first,
      projectId: "/elsewhere",
      sessionId: "session-2",
    };

    contextLedger.capture(first);
    contextLedger.capture(second);
    expect(contextLedger.get("/repo")).toEqual(first);
    expect(contextLedger.get("/elsewhere")).toEqual(second);
    contextLedger.clearProject("/repo");
    expect(contextLedger.get("/repo")).toBeNull();
    expect(contextLedger.get("/elsewhere")).toEqual(second);
  });
});
