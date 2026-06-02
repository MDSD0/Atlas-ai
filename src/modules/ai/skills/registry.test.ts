import { describe, expect, it } from "vitest";
import { narrowSkillTools } from "@/modules/ai/skills/contracts";
import type { SkillPersistence } from "@/modules/ai/skills/persistence";
import { SkillRegistry } from "@/modules/ai/skills/registry";

class InMemoryPersistence implements SkillPersistence {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async save(): Promise<void> {}
}

function registry() {
  return new SkillRegistry(new InMemoryPersistence(), {
    idFactory: () => "skill-1",
    clock: () => 100,
  });
}

describe("SkillRegistry", () => {
  it("installs, inspects, enables, disables, and removes a valid package", async () => {
    const skills = registry();
    await expect(
      skills.install({
        name: "verify-release",
        description: "Runs a release checklist.",
        prompt: "Inspect evidence and run the narrow verifier.",
        allowedTools: ["read_file", "bash_run"],
        fixture: "simple-ts",
      }),
    ).resolves.toMatchObject({ id: "skill-1", enabled: false });
    await expect(skills.setEnabled("skill-1", true)).resolves.toBe(true);
    await expect(skills.enabled()).resolves.toMatchObject([
      { id: "skill-1", enabled: true },
    ]);
    await expect(skills.setEnabled("skill-1", false)).resolves.toBe(true);
    await expect(skills.remove("skill-1")).resolves.toBe(true);
    await expect(skills.list()).resolves.toEqual([]);
  });

  it("rejects invalid package metadata", async () => {
    await expect(
      registry().install({
        name: "Bad Name",
        description: "bad",
        prompt: "bad",
      }),
    ).rejects.toThrow("lowercase");
  });

  it("can only narrow an existing tool set", () => {
    expect(
      narrowSkillTools(
        { allowedTools: ["read_file", "invent_policy_bypass", "bash_run"] },
        ["read_file", "bash_run"],
      ),
    ).toEqual(["read_file", "bash_run"]);
  });
});
