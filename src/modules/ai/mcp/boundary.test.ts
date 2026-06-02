import { describe, expect, it } from "vitest";
import { McpBoundary } from "@/modules/ai/mcp/boundary";
import type { McpPersistence } from "@/modules/ai/mcp/persistence";
import { McpRegistry } from "@/modules/ai/mcp/registry";

class InMemoryPersistence implements McpPersistence {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
  async save(): Promise<void> {}
}

async function configured(policy: "allow" | "ask" | "deny" = "allow") {
  const registry = new McpRegistry(new InMemoryPersistence());
  await registry.configure({
    id: "fixture",
    name: "Fixture",
    command: "fixture-server",
    enabled: true,
    tools: { inspect: policy },
  });
  return registry;
}

describe("McpBoundary", () => {
  it("enforces disabled, deny, and ask policies before invocation", async () => {
    const registry = await configured();
    await registry.setEnabled("fixture", false);
    await expect(new McpBoundary(registry, async () => "no").callTool({
      serverId: "fixture", toolName: "inspect", input: {},
    })).rejects.toThrow("disabled");
    await registry.setEnabled("fixture", true);
    await registry.configure({ id: "fixture", name: "Fixture", command: "fixture-server", tools: { inspect: "deny" } });
    await expect(new McpBoundary(registry, async () => "no").callTool({
      serverId: "fixture", toolName: "inspect", input: {},
    })).rejects.toThrow("denied");
    await registry.configure({ id: "fixture", name: "Fixture", command: "fixture-server", tools: { inspect: "ask" } });
    await expect(new McpBoundary(registry, async () => "no").callTool({
      serverId: "fixture", toolName: "inspect", input: {},
    })).rejects.toThrow("explicit approval");
  });

  it("invokes lazily after policy checks and bounds output", async () => {
    let calls = 0;
    const boundary = new McpBoundary(await configured("ask"), async () => {
      calls += 1;
      return "x".repeat(20_000);
    });
    await expect(boundary.callTool({
      serverId: "fixture", toolName: "inspect", input: {}, approved: true,
    })).resolves.toMatchObject({ output: { truncated: true, originalBytes: 20_000 } });
    expect(calls).toBe(1);
  });

  it("surfaces deferred transport, crashes, timeouts, and malformed inputs", async () => {
    const registry = await configured();
    await expect(new McpBoundary(registry).callTool({
      serverId: "fixture", toolName: "inspect", input: {},
    })).rejects.toThrow("intentionally deferred");
    await expect(new McpBoundary(registry, async () => { throw new Error("server crashed"); }).callTool({
      serverId: "fixture", toolName: "inspect", input: {},
    })).rejects.toThrow("server crashed");
    await expect(new McpBoundary(registry, async () => new Promise(() => {}), 5).callTool({
      serverId: "fixture", toolName: "inspect", input: {},
    })).rejects.toThrow("timed out");
    await expect(new McpBoundary(registry, async () => "no").callTool({
      serverId: "fixture", toolName: "inspect", input: [] as unknown as Record<string, unknown>,
    })).rejects.toThrow("must be an object");
  });
});
