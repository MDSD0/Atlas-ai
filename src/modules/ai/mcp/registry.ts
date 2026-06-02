import {
  MCP_SERVER_LIMIT,
  MCP_PROTOCOL_VERSION,
  type ConfigureMcpServerInput,
  type McpServerConfig,
  validateMcpServerInput,
} from "@/modules/ai/mcp/contracts";
import type { McpPersistence } from "@/modules/ai/mcp/persistence";

const SERVERS_KEY = "servers";

export class McpRegistry {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly persistence: McpPersistence,
    private readonly clock: () => number = Date.now,
  ) {}

  configure(input: ConfigureMcpServerInput): Promise<McpServerConfig> {
    return this.mutate(async () => {
      const servers = await this.listUnlocked();
      const previous = servers.find((server) => server.id === input.id) ?? null;
      const configured = validateMcpServerInput(input, this.clock(), previous);
      const next = [configured, ...servers.filter((server) => server.id !== configured.id)];
      if (next.length > MCP_SERVER_LIMIT) throw new Error("MCP server limit reached");
      await this.persist(next);
      return configured;
    });
  }

  async list(): Promise<McpServerConfig[]> {
    await this.writes;
    return this.listUnlocked();
  }

  async get(id: string): Promise<McpServerConfig | null> {
    return (await this.list()).find((server) => server.id === id) ?? null;
  }

  setEnabled(id: string, enabled: boolean): Promise<boolean> {
    return this.mutate(async () => {
      const servers = await this.listUnlocked();
      const server = servers.find((item) => item.id === id);
      if (!server) return false;
      server.enabled = enabled;
      server.updatedAt = this.clock();
      await this.persist(servers);
      return true;
    });
  }

  remove(id: string): Promise<boolean> {
    return this.mutate(async () => {
      const servers = await this.listUnlocked();
      const next = servers.filter((server) => server.id !== id);
      if (next.length === servers.length) return false;
      await this.persist(next);
      return true;
    });
  }

  async status() {
    const servers = await this.list();
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      state: servers.some((server) => server.enabled)
        ? "configured_enabled_lazy_stdio"
        : servers.length > 0
          ? "configured_disabled"
          : "disabled",
      transport: "stdio_rmcp_1_7",
      servers: servers.map(({ id, name, enabled, defaultToolPolicy }) => ({
        id,
        name,
        enabled,
        defaultToolPolicy,
      })),
    };
  }

  private async listUnlocked(): Promise<McpServerConfig[]> {
    return (await this.persistence.get<McpServerConfig[]>(SERVERS_KEY)) ?? [];
  }

  private async persist(servers: McpServerConfig[]): Promise<void> {
    await this.persistence.set(SERVERS_KEY, servers);
    await this.persistence.save();
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation, operation);
    this.writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
