import { describe, expect, it } from "vitest";
import {
  MAX_AGENT_OUTPUT_TOKENS,
  MAX_AGENT_STEPS,
  modelOutputTokenBudget,
  modelStepBudget,
} from "../config";
describe("per-model step budget", () => {
  it("gives frontier models the full budget", () => {
    expect(modelStepBudget("gpt-5.5")).toBe(MAX_AGENT_STEPS);
    expect(modelStepBudget("claude-opus-4-8")).toBe(MAX_AGENT_STEPS);
    expect(modelStepBudget(undefined)).toBe(MAX_AGENT_STEPS);
  });

  it("caps lite/local models below the frontier budget", () => {
    const lite = modelStepBudget("ollama-local");
    expect(lite).toBeLessThan(MAX_AGENT_STEPS);
    expect(modelStepBudget("qwen-3-32b")).toBe(lite);
    expect(modelStepBudget("gemini-2.5-flash")).toBe(lite);
  });
});

describe("per-model output token budget", () => {
  it("keeps provider output ceilings below context-sized defaults", () => {
    expect(modelOutputTokenBudget("gpt-5.5")).toBe(MAX_AGENT_OUTPUT_TOKENS);
    expect(modelOutputTokenBudget("openrouter-custom")).toBe(
      MAX_AGENT_OUTPUT_TOKENS,
    );
    expect(modelOutputTokenBudget("gemini-2.5-flash")).toBeLessThan(
      MAX_AGENT_OUTPUT_TOKENS,
    );
  });
});
