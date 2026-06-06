import { describe, expect, it } from "vitest";
import { MAX_AGENT_STEPS, modelStepBudget } from "../config";
import { selectAgentRunPolicy } from "./lanePolicy";

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

describe("lane step ceiling", () => {
  it("static web lane caps steps lower than full", () => {
    const staticLane = selectAgentRunPolicy({
      prompt: "build a calculator web app with html css js and open it",
      planMode: false,
      activeFile: null,
    });
    expect(staticLane.lane).toBe("static_web_app");
    expect(staticLane.maxSteps).toBeDefined();
    expect(staticLane.maxSteps!).toBeLessThan(MAX_AGENT_STEPS);

    const full = selectAgentRunPolicy({
      prompt: "refactor the auth module and run the tests",
      planMode: false,
      activeFile: null,
    });
    expect(full.lane).toBe("full");
    expect(full.maxSteps).toBeUndefined();
  });
});
