import { describe, expect, it } from "vitest";
import { LocalRecordsProvider } from "@/modules/ai/memory/localRecords";
import type { MemoryPersistence } from "@/modules/ai/memory/persistence";

class InMemoryPersistence implements MemoryPersistence {
  readonly values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

function provider(
  persistence = new InMemoryPersistence(),
  ids = ["m-1", "m-2", "m-3", "m-4"],
) {
  let index = 0;
  return {
    persistence,
    records: new LocalRecordsProvider(persistence, {
      clock: () => 100 + index,
      idFactory: () => ids[index++] ?? `m-${index}`,
    }),
  };
}

describe("LocalRecordsProvider", () => {
  it("persists explicit records and restores them without crossing projects", async () => {
    const { persistence, records } = provider();
    await records.remember({
      projectId: "/repo-a",
      kind: "decision",
      content: "Use pnpm for project scripts.",
      tags: ["package-manager"],
    });
    await records.remember({
      projectId: "/repo-b",
      kind: "fact",
      content: "The greeting uses a period.",
    });

    const restored = new LocalRecordsProvider(persistence);
    await expect(restored.list("/repo-a")).resolves.toMatchObject([
      { id: "m-1", projectId: "/repo-a", content: "Use pnpm for project scripts." },
    ]);
    await expect(restored.list("/repo-b")).resolves.toHaveLength(1);
    expect(persistence.saves).toBe(2);
  });

  it("marks linked source facts stale and excludes them from default recall", async () => {
    const { records } = provider();
    await records.remember({
      projectId: "/repo",
      kind: "fact",
      content: "The greeting ends with a period.",
      sourceArtifacts: ["/repo/src/greeting.ts"],
      tags: ["greeting"],
    });
    await records.remember({
      projectId: "/repo",
      kind: "instruction",
      content: "Use narrow tests after edits.",
      tags: ["testing"],
    });

    await expect(
      records.markStaleForArtifacts(
        "/repo",
        ["/repo/src/greeting.ts"],
        "linked source artifact changed",
      ),
    ).resolves.toMatchObject([{ id: "m-1", status: "stale" }]);
    await expect(records.recall({ projectId: "/repo", query: "greeting" })).resolves
      .toMatchObject({ records: [], staleExcluded: 1 });
    await expect(
      records.recall({ projectId: "/repo", query: "greeting", includeStale: true }),
    ).resolves.toMatchObject({ records: [{ id: "m-1", status: "stale" }] });
  });

  it("supports soft delete, clear-project, and bounded token recall", async () => {
    const { records } = provider();
    const first = await records.remember({
      projectId: "/repo",
      kind: "preference",
      content: "Prefer focused verification commands.",
      tags: ["verification"],
    });
    await records.remember({
      projectId: "/repo",
      kind: "fact",
      content: "Verification requires a complete release smoke report.",
      tags: ["verification"],
    });

    await expect(
      records.recall({ projectId: "/repo", query: "verification", tokenBudget: 10 }),
    ).resolves.toMatchObject({ records: [{ id: "m-1" }] });
    await expect(records.delete("/repo", first.id)).resolves.toBe(true);
    await expect(records.stats("/repo")).resolves.toMatchObject({
      total: 2,
      active: 1,
      deleted: 1,
    });
    await expect(records.clearProject("/repo")).resolves.toBe(2);
    await expect(records.list("/repo", true)).resolves.toEqual([]);
  });

  it("refuses obvious secret material", async () => {
    const { records } = provider();
    await expect(
      records.remember({
        projectId: "/repo",
        kind: "fact",
        content: "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz",
      }),
    ).rejects.toThrow("possible secret material");
  });
});
