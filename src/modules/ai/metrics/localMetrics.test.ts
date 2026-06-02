import { describe, expect, it } from "vitest";
import { LocalMetrics } from "@/modules/ai/metrics/localMetrics";
import type { MetricsPersistence } from "@/modules/ai/metrics/persistence";

class InMemoryPersistence implements MetricsPersistence {
  readonly values = new Map<string, unknown>();
  saves = 0;
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
  async save(): Promise<void> { this.saves += 1; }
}

describe("LocalMetrics", () => {
  it("persists bounded local measurements and restores them", async () => {
    const persistence = new InMemoryPersistence();
    let id = 0;
    const first = new LocalMetrics(persistence, { maxRecords: 2, clock: () => 100, idFactory: () => `m-${++id}` });
    await first.record({ name: "tool.completed", value: 1, unit: "count", attributes: { tool: "read_file" } });
    await first.record({ name: "run.duration", value: 12, unit: "ms" });
    await first.record({ name: "run.completed", value: 1, unit: "count" });
    const restored = new LocalMetrics(persistence);
    await expect(restored.list()).resolves.toMatchObject([
      { id: "m-3", name: "run.completed" },
      { id: "m-2", name: "run.duration" },
    ]);
    expect(persistence.saves).toBe(3);
  });

  it("refuses secret and invalid high-cardinality attributes", async () => {
    const metrics = new LocalMetrics(new InMemoryPersistence());
    await expect(metrics.record({
      name: "run.completed", value: 1, unit: "count", attributes: { token: "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    })).rejects.toThrow("possible secret material");
    await expect(metrics.record({
      name: "run.completed", value: 1, unit: "count", attributes: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, i])),
    })).rejects.toThrow("too many");
  });
});
