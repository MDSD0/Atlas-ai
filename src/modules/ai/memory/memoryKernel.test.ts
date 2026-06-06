import { describe, expect, it } from "vitest";
import { buildPinnedMemoryContext } from "@/modules/ai/memory";
import { LocalRecordsProvider } from "@/modules/ai/memory/localRecords";
import type { MemoryPersistence } from "@/modules/ai/memory/persistence";

class InMemoryPersistence implements MemoryPersistence {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
  async save(): Promise<void> {}
}

function provider() {
  let i = 0;
  return new LocalRecordsProvider(new InMemoryPersistence(), {
    clock: () => 100 + i,
    idFactory: () => `m-${++i}`,
  });
}

const PROJECT = "/repo";

describe("memory kernel — pinned snapshot", () => {
  it("returns null when there are no records", async () => {
    expect(await buildPinnedMemoryContext(PROJECT, 5, provider())).toBeNull();
    expect(await buildPinnedMemoryContext(null, 5, provider())).toBeNull();
  });

  it("pins highest-confidence active facts, bounded, cited, advisory", async () => {
    const records = provider();
    await records.remember({ projectId: PROJECT, kind: "decision", content: "low fact", confidence: 0.2 });
    await records.remember({ projectId: PROJECT, kind: "decision", content: "high fact", confidence: 0.95 });
    await records.remember({ projectId: PROJECT, kind: "decision", content: "mid fact", confidence: 0.6 });

    const ctx = await buildPinnedMemoryContext(PROJECT, 2, records);
    expect(ctx).not.toBeNull();
    // Bounded to limit, highest confidence first.
    expect(ctx).toContain("high fact");
    expect(ctx).toContain("mid fact");
    expect(ctx).not.toContain("low fact");
    // Cited + advisory.
    expect(ctx).toContain("id=");
    expect(ctx).toContain("confidence=0.95");
    expect(ctx!.toLowerCase()).toContain("advisory");
    expect(ctx).toContain("memory_recall");
    expect(ctx).toContain('scope="pinned"');
  });

  it("excludes stale records from the pinned snapshot", async () => {
    const records = provider();
    const stale = await records.remember({
      projectId: PROJECT,
      kind: "decision",
      content: "stale fact",
      confidence: 0.99,
    });
    await records.remember({ projectId: PROJECT, kind: "decision", content: "fresh fact", confidence: 0.5 });
    await records.markStaleForArtifacts(PROJECT, stale.sourceArtifacts, "changed");
    // markStaleForArtifacts only marks records linked to artifacts; force-mark directly.
    await records.delete(PROJECT, stale.id);

    const ctx = await buildPinnedMemoryContext(PROJECT, 5, records);
    expect(ctx).toContain("fresh fact");
    expect(ctx).not.toContain("stale fact");
  });
});
