import { describe, expect, it } from "vitest";
import { selectAgentRunPolicy } from "./lanePolicy";

describe("selectAgentRunPolicy", () => {
  it("narrows static HTML/CSS/JS app work to the simple lane", () => {
    const policy = selectAgentRunPolicy({
      prompt:
        "build a simple beautiful scientific calculator in html css and js, then run it",
      planMode: false,
      activeFile: null,
    });

    expect(policy.lane).toBe("static_web_app");
    expect(policy.toolMode).toBe("simple");
    expect(policy.includeMemoryIndex).toBe(false);
    expect(policy.includeLocalMemory).toBe(false);
    expect(policy.includeSimpleMem).toBe(false);
    expect(policy.includeWorkPacket).toBe(false);
    expect(policy.includeSkills).toBe(false);
  });

  it("keeps static run follow-ups narrow when a static file is active", () => {
    const policy = selectAgentRunPolicy({
      prompt: "run it",
      planMode: false,
      activeFile: "C:\\Users\\name\\Downloads\\project\\index.html",
    });

    expect(policy.lane).toBe("static_web_app");
    expect(policy.toolMode).toBe("simple");
  });

  it("keeps repo edits on the full lane", () => {
    const policy = selectAgentRunPolicy({
      prompt: "fix the provider fallback bug in the Rust backend",
      planMode: false,
      activeFile: null,
    });

    expect(policy.lane).toBe("full");
    expect(policy.toolMode).toBe("full");
    expect(policy.includeSimpleMem).toBe(true);
  });

  it("does not narrow plan mode", () => {
    const policy = selectAgentRunPolicy({
      prompt: "build a calculator in html css and js",
      planMode: true,
      activeFile: null,
    });

    expect(policy.lane).toBe("full");
    expect(policy.toolMode).toBe("full");
  });
});

