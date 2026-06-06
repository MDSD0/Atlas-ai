import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { sanitizeToolParts } from "./agent";

function msg(parts: unknown[]): UIMessage {
  return { id: "m", role: "assistant", parts } as unknown as UIMessage;
}
function partsOf(m: UIMessage): Array<{ type?: string; input?: unknown }> {
  return m.parts as unknown as Array<{ type?: string; input?: unknown }>;
}

describe("sanitizeToolParts", () => {
  it("drops an incomplete (input-streaming) tool call that would orphan a tool_use", () => {
    const out = sanitizeToolParts([
      msg([
        { type: "text", text: "ok" },
        { type: "tool-write_file", state: "output-available", input: { path: "a" }, output: {} },
        { type: "tool-write_file", state: "input-streaming", input: { content: "partial" } },
      ]),
    ]);
    const parts = partsOf(out[0]);
    expect(parts).toHaveLength(2);
    expect(parts.some((p) => p.type === "text")).toBe(true);
    expect(parts.filter((p) => p.type === "tool-write_file")).toHaveLength(1);
  });

  it("drops input-available tool calls (called but no result yet)", () => {
    const out = sanitizeToolParts([
      msg([{ type: "tool-grep", state: "input-available", input: { pattern: "x" } }]),
    ]);
    expect(partsOf(out[0])).toHaveLength(0);
  });

  it("coerces a non-object input on a finished tool part to {}", () => {
    const out = sanitizeToolParts([
      msg([
        {
          type: "tool-grep",
          state: "output-error",
          input: '{"pattern":"def _progress_bar","glob":task_manager.py}', // malformed string
          errorText: "JSON parse failed",
        },
      ]),
    ]);
    const parts = partsOf(out[0]);
    expect(parts).toHaveLength(1);
    expect(parts[0].input).toEqual({});
  });

  it("keeps well-formed terminal tool parts and non-tool parts untouched", () => {
    const input = [
      msg([
        { type: "text", text: "hi" },
        { type: "tool-read_file", state: "output-available", input: { path: "a" }, output: {} },
      ]),
    ];
    const out = sanitizeToolParts(input);
    expect(out).toBe(input); // unchanged reference when nothing to fix
  });

  it("preserves dynamic-tool parts with the same rules", () => {
    const out = sanitizeToolParts([
      msg([
        { type: "dynamic-tool", toolName: "x", state: "output-available", input: { a: 1 }, output: {} },
        { type: "dynamic-tool", toolName: "y", state: "input-streaming", input: {} },
      ]),
    ]);
    expect(partsOf(out[0])).toHaveLength(1);
  });
});
