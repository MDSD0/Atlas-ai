import { describe, expect, it } from "vitest";
import type { MemoryPersistence } from "@/modules/ai/memory/persistence";
import { SimpleMemConfigRegistry } from "@/modules/ai/memory/simpleMemConfig";

class InMemoryPersistence implements MemoryPersistence {
  readonly values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

describe("SimpleMemConfigRegistry", () => {
  it("defaults to an inert local sidecar", async () => {
    await expect(
      new SimpleMemConfigRegistry(new InMemoryPersistence()).get(),
    ).resolves.toEqual({
      enabled: false,
      injectContext: false,
      baseUrl: "http://127.0.0.1:8766",
      updatedAt: 0,
    });
  });

  it("persists only a normalized loopback origin", async () => {
    const persistence = new InMemoryPersistence();
    const registry = new SimpleMemConfigRegistry(persistence, () => 42);

    await expect(
      registry.configure({
        enabled: true,
        injectContext: true,
        baseUrl: "http://localhost:9000/custom-path",
      }),
    ).resolves.toEqual({
      enabled: true,
      injectContext: true,
      baseUrl: "http://localhost:9000",
      updatedAt: 42,
    });
    expect(persistence.saves).toBe(1);
  });

  it("refuses remote or credential-bearing endpoints", async () => {
    const registry = new SimpleMemConfigRegistry(new InMemoryPersistence());

    await expect(
      registry.configure({ baseUrl: "https://memory.example.com" }),
    ).rejects.toThrow("loopback HTTP");
    await expect(
      registry.configure({ baseUrl: "http://token@localhost:9000" }),
    ).rejects.toThrow("loopback HTTP");
  });
});
