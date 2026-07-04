import { describe, expect, it } from "vitest";
import { buildSkillHooks, computeSkillToolRestriction } from "@/modules/ai/skills/index";
import type { LocalSkillPackage } from "@/modules/ai/skills/contracts";

function skill(patch: Partial<LocalSkillPackage> = {}): LocalSkillPackage {
  return {
    id: "skill-1",
    name: "example",
    description: "An example skill.",
    prompt: "Follow the release checklist before merging.",
    allowedTools: [],
    hooks: [],
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe("computeSkillToolRestriction (F-10)", () => {
  it("returns null when no skill declares allowedTools", () => {
    expect(computeSkillToolRestriction([skill(), skill({ id: "s2" })])).toBeNull();
  });

  it("returns the union of every skill's allowedTools", () => {
    const result = computeSkillToolRestriction([
      skill({ id: "a", allowedTools: ["read_file", "grep"] }),
      skill({ id: "b", allowedTools: ["grep", "bash_run"] }),
      skill({ id: "c", allowedTools: [] }),
    ]);
    expect(result).not.toBeNull();
    expect(new Set(result)).toEqual(new Set(["read_file", "grep", "bash_run"]));
  });

  it("ignores disabled/irrelevant skills the caller already filtered out", () => {
    // computeSkillToolRestriction trusts its input list as-is (the async
    // wrapper is responsible for passing only enabled skills).
    const result = computeSkillToolRestriction([skill({ allowedTools: ["edit"] })]);
    expect(result).toEqual(["edit"]);
  });
});

describe("buildSkillHooks (F-10)", () => {
  it("produces no hooks for skills with an empty hooks array", () => {
    expect(buildSkillHooks([skill()])).toEqual([]);
  });

  it("produces one enabled hook per skill declaring events, scoped to those events", () => {
    const hooks = buildSkillHooks([
      skill({ id: "a", name: "release", hooks: ["before_tool", "verdict"] }),
    ]);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({ id: "a", enabled: true, events: ["before_tool", "verdict"] });
  });

  it("run() returns a bounded reminder derived from the skill's own prompt, not arbitrary code", () => {
    const [hook] = buildSkillHooks([
      skill({ name: "release", prompt: "Run the narrow verifier.", hooks: ["verdict"] }),
    ]);
    const result = hook.run({ event: "verdict", payload: {} });
    expect(typeof result).toBe("string");
    expect(result as string).toContain("release");
    expect(result as string).toContain("Run the narrow verifier.");
  });
});
