import { describe, expect, it } from "vitest";
import { formatAgentError, isTransientStreamError } from "./errors";

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

describe("isTransientStreamError (auto-resume gate)", () => {
  it("flags mid-stream SSE corruption as transient", () => {
    for (const msg of [
      "JSON error injected into SSE stream",
      "Invalid JSON response from provider",
      "JSON parsing failed: unexpected end of input",
      "Unexpected token < in JSON at position 0",
      "Type validation failed: chunk did not match schema",
      "terminated",
      "read ECONNRESET",
      "socket hang up",
      "premature close",
    ]) {
      expect(isTransientStreamError(new Error(msg)), msg).toBe(true);
    }
  });

  it("never flags auth, billing, quota, rate-limit, or model errors", () => {
    for (const msg of [
      "401 unauthorized: invalid api key",
      "OpenRouter 402: This request requires more credits",
      "403 forbidden",
      "429 rate limit exceeded",
      "insufficient_quota: check billing",
      "model not found",
      "maximum context length exceeded",
      "400 tool_use_failed: invalid tool call",
    ]) {
      expect(isTransientStreamError(new Error(msg)), msg).toBe(false);
    }
  });

  it("never flags a user abort", () => {
    expect(isTransientStreamError(new Error("The operation was aborted"))).toBe(
      false,
    );
    expect(isTransientStreamError(new DOMException("Aborted", "AbortError"))).toBe(
      false,
    );
  });

  it("ignores empty or unknown errors", () => {
    expect(isTransientStreamError("")).toBe(false);
    expect(isTransientStreamError(new Error("something else broke"))).toBe(false);
  });
});
