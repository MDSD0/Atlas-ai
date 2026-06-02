import { describe, expect, it } from "vitest";
import type { McpPersistence } from "@/modules/ai/mcp/persistence";
import { McpRegistry } from "@/modules/ai/mcp/registry";

class InMemoryPersistence implements McpPersistence {
  readonly values = new Map<string, unknown>();
  saves = 0;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async save(): Promise<void> {
    this.saves += 1;
  }
}

describe("McpRegistry", () => {
  it("persists disabled stdio configurations and supports explicit lifecycle changes", async () => {
    const persistence = new InMemoryPersistence();
    const registry = new McpRegistry(persistence, () => 100);
    await expect(registry.configure({
      id: "github",
      name: "GitHub",
      command: "github-mcp-server",
      args: ["stdio", "--read-only"],
      tools: { get_file_contents: "allow" },
    })).resolves.toMatchObject({ enabled: false, transport: "stdio" });
    await expect(registry.status()).resolves.toMatchObject({ state: "configured_disabled" });
    await expect(registry.setEnabled("github", true)).resolves.toBe(true);
    await expect(registry.remove("github")).resolves.toBe(true);
    await expect(registry.list()).resolves.toEqual([]);
    expect(persistence.saves).toBe(3);
  });

  it("refuses persisted secret material", async () => {
    await expect(new McpRegistry(new InMemoryPersistence()).configure({
      id: "github",
      name: "GitHub",
      command: "github-mcp-server",
      args: ["GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"],
    })).rejects.toThrow("possible secret material");
  });
});
