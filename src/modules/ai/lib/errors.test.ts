import { describe, expect, it } from "vitest";
import { formatAgentError } from "./errors";

describe("formatAgentError", () => {
  it("turns provider credit failures into an actionable message", () => {
    expect(
      formatAgentError(
        "OpenRouter 402: This request requires more credits, you can only afford 498",
      ),
    ).toMatch(/credits are exhausted/i);
  });

  it("turns OpenAI quota failures into an actionable message", () => {
    expect(
      formatAgentError(
        new Error(
          "429 insufficient_quota: You exceeded your current quota, please check billing",
        ),
      ),
    ).toMatch(/quota is exhausted/i);
  });

  it("identifies provider tool-call format failures", () => {
    expect(formatAgentError("400 tool_use_failed: invalid tool call")).toMatch(
      /tool-call format/i,
    );
  });

  it("keeps unknown failures but trims long blobs", () => {
    const formatted = formatAgentError(`x ${"a".repeat(500)}`);
    expect(formatted).toMatch(/^x a+/);
    expect(formatted.length).toBeLessThanOrEqual(360);
  });
});
