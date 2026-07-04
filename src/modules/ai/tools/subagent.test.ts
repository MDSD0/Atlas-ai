import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSubagent } from "../agents/runSubagent";
import type { ToolContext } from "./context";
import { buildSubagentTools } from "./subagent";

vi.mock("../agents/runSubagent", () => ({
  runSubagent: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const context = {
  getSessionId: () => "session-1",
} as unknown as ToolContext;

type ExecutableTool = {
  execute?: (
    input: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
};

function execute(
  tool: unknown,
  input: Record<string, unknown>,
  abortSignal = new AbortController().signal,
) {
  const fn = (tool as ExecutableTool).execute;
  if (!fn) throw new Error("tool has no execute function");
  return fn(input, { toolCallId: "call-1", messages: [], abortSignal });
}

describe("subagent tools", () => {
  it("passes top-level cancellation into a child model call", async () => {
    vi.mocked(runSubagent).mockResolvedValue({
      summary: "done",
      stepCount: 1,
      durationMs: 2,
    });
    const controller = new AbortController();
    const tools = buildSubagentTools(context);

    await execute(
      tools.run_subagent,
      { type: "explore", prompt: "inspect it" },
      controller.signal,
    );

    expect(runSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });

  it("starts every batch job before waiting for any one to finish", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(runSubagent).mockImplementation(async ({ type }) => {
      await gate;
      return { summary: type, stepCount: 1, durationMs: 3 };
    });
    const tools = buildSubagentTools(context);

    const pending = execute(tools.run_subagents, {
      jobs: [
        { type: "explore", prompt: "find callers" },
        { type: "security", prompt: "inspect trust boundaries" },
        { type: "code-review", prompt: "review the patch" },
      ],
    });
    await Promise.resolve();

    expect(runSubagent).toHaveBeenCalledTimes(3);
    release();
    const result = await pending;
    expect(result).toMatchObject({ parallel: true, count: 3 });
  });

  it("returns cancellation honestly instead of a generic provider error", async () => {
    vi.mocked(runSubagent).mockRejectedValue(new Error("aborted downstream"));
    const controller = new AbortController();
    controller.abort();
    const tools = buildSubagentTools(context);

    const result = await execute(
      tools.run_subagent,
      { type: "general", prompt: "inspect it" },
      controller.signal,
    );

    expect(result).toMatchObject({ error: "subagent cancelled" });
  });
});
