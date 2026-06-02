import {
  MCP_MAX_CONCURRENT_CALLS,
  MCP_OUTPUT_BYTES,
  MCP_TIMEOUT_MS,
  isPlainMcpInput,
  type McpCallInput,
  type McpServerConfig,
  validateMcpToolName,
} from "@/modules/ai/mcp/contracts";
import type { McpRegistry } from "@/modules/ai/mcp/registry";
import { boundPayload } from "@/modules/ai/proof/contracts";

export type McpInvoker = (
  server: McpServerConfig,
  toolName: string,
  input: Record<string, unknown>,
) => Promise<unknown>;

export class McpBoundary {
  private inFlight = 0;

  constructor(
    private readonly registry: McpRegistry,
    private readonly invoker?: McpInvoker,
    private readonly timeoutMs = MCP_TIMEOUT_MS,
  ) {}

  async callTool(call: McpCallInput) {
    const server = await this.registry.get(call.serverId);
    if (!server) throw new Error(`MCP server not found: ${call.serverId}`);
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    const toolName = validateMcpToolName(call.toolName);
    if (!isPlainMcpInput(call.input)) throw new Error("MCP tool input must be an object");
    const policy = server.tools[toolName] ?? server.defaultToolPolicy;
    if (policy === "deny") throw new Error(`MCP tool denied: ${toolName}`);
    if (policy === "ask" && call.approved !== true) {
      throw new Error(`MCP tool requires explicit approval: ${toolName}`);
    }
    if (!this.invoker) {
      throw new Error("MCP transport adapter is intentionally deferred");
    }
    if (this.inFlight >= MCP_MAX_CONCURRENT_CALLS) {
      throw new Error("MCP concurrent call limit reached");
    }

    this.inFlight += 1;
    try {
      const result = await Promise.race([
        this.invoker(server, toolName, call.input),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`MCP tool timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
        }),
      ]);
      return {
        serverId: server.id,
        toolName,
        policy,
        output: boundPayload(result, MCP_OUTPUT_BYTES),
      };
    } finally {
      this.inFlight -= 1;
    }
  }
}
