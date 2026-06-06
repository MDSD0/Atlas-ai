import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { compactModelMessagesDetailed } from "./compact";

const LIMIT = 1000; // tokens; bytes threshold ~ LIMIT * 4

function toolResultMsg(toolName: string, size: number): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: `${toolName}-${Math.random().toString(36).slice(2)}`,
        toolName,
        output: { type: "text", value: "x".repeat(size) },
      },
    ],
  } as unknown as ModelMessage;
}

function elidedValue(msg: ModelMessage): string {
  const part = (msg.content as Array<{ output?: { value?: string } }>)[0];
  return part.output?.value ?? "";
}

describe("compactModelMessagesDetailed", () => {
  it("leaves small histories untouched", () => {
    const msgs = [toolResultMsg("read_file", 100)];
    const r = compactModelMessagesDetailed(msgs, LIMIT);
    expect(r.compacted).toBe(false);
    expect(elidedValue(r.messages[0])).not.toContain("elided");
  });

  it("elides old tool output with a tool-name breadcrumb (causal chain kept)", () => {
    // 30 messages so the head (beyond KEEP_TAIL=24) gets elided.
    const msgs = Array.from({ length: 30 }, () => toolResultMsg("read_file", 800));
    const r = compactModelMessagesDetailed(msgs, LIMIT);
    expect(r.compacted).toBe(true);
    const head = elidedValue(r.messages[0]);
    expect(head).toContain("read_file");
    expect(head).toContain("elided");
  });

  it("is idempotent — already-elided output is not re-elided", () => {
    const msgs = Array.from({ length: 30 }, () => toolResultMsg("grep", 800));
    const once = compactModelMessagesDetailed(msgs, LIMIT);
    const twice = compactModelMessagesDetailed(once.messages, LIMIT);
    // Second pass should not keep finding new things to drop in the head.
    expect(twice.droppedCount).toBeLessThanOrEqual(once.droppedCount);
  });

  it("tail-overflow guard elides a giant result even inside the kept tail", () => {
    // Few messages (< KEEP_TAIL) but one huge result pushes past 0.9 * limit.
    const msgs = [
      toolResultMsg("read_file", 100),
      toolResultMsg("bash_run", 6000),
      toolResultMsg("read_file", 100),
    ];
    const r = compactModelMessagesDetailed(msgs, LIMIT);
    expect(r.compacted).toBe(true);
    expect(elidedValue(r.messages[1])).toContain("elided");
  });
});
