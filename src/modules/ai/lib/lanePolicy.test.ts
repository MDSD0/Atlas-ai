import { describe, expect, it } from "vitest";
import { selectAgentRunPolicy } from "./lanePolicy";

describe("selectAgentRunPolicy", () => {
  it("uses the full harness lane for a workspace (no static-web narrowing)", () => {
    // A textbook static-web prompt no longer gets narrowed: the misrouting
    // lane was removed, so everything runs on the full toolbelt.
    const policy = selectAgentRunPolicy({
      prompt:
        "build a simple beautiful scientific calculator in html css and js, then run it",
      planMode: false,
      activeFile: null,
      hasWorkspace: true,
    });

    expect(policy.lane).toBe("full");
    expect(policy.toolMode).toBe("full");
    expect(policy.includeSimpleMem).toBe(true);
    expect(policy.maxSteps).toBeUndefined();
  });

  it("does not downgrade when a stale static file is open in the editor", () => {
    // The exact regression that bit us: an unrelated index.html open in the
    // editor used to flip a non-web run into the narrowed lane.
    const policy = selectAgentRunPolicy({
      prompt: "run it yourself",
      planMode: false,
      activeFile: "C:\\Users\\name\\Downloads\\project\\index.html",
      hasWorkspace: true,
    });

    expect(policy.lane).toBe("full");
    expect(policy.toolMode).toBe("full");
  });

  it("keeps repo edits on the full lane", () => {
    const policy = selectAgentRunPolicy({
      prompt: "fix the provider fallback bug in the Rust backend",
      planMode: false,
      activeFile: null,
      hasWorkspace: true,
    });

    expect(policy.lane).toBe("full");
    expect(policy.toolMode).toBe("full");
    expect(policy.includeSimpleMem).toBe(true);
  });

  it("does not load project persistence sources without a workspace", () => {
    const policy = selectAgentRunPolicy({
      prompt: "explain what a mutex is",
      planMode: false,
      activeFile: null,
      hasWorkspace: false,
    });

    expect(policy.lane).toBe("unbound");
    expect(policy.toolMode).toBe("full");
    expect(policy.includeAtlasMd).toBe(false);
    expect(policy.includeMemoryIndex).toBe(false);
    expect(policy.includeLocalMemory).toBe(false);
    expect(policy.includeSimpleMem).toBe(false);
    expect(policy.includeWorkPacket).toBe(false);
    expect(policy.includeSkills).toBe(true);
  });
});
