import {
  MCP_MAX_CONCURRENT_CALLS,
  MCP_OUTPUT_BYTES,
  MCP_TIMEOUT_MS,
  type McpCallInput,
  type McpServerConfig,
  validateMcpCallInput,
  validateMcpToolName,
} from "@/modules/ai/mcp/contracts";
import type { McpRegistry } from "@/modules/ai/mcp/registry";
import { boundPayload } from "@/modules/ai/proof/contracts";

export type McpInvoker = (
  server: McpServerConfig,
  toolName: string,
  input: Record<string, unknown>,
  requestId: string,
  projectRoot: string,
) => Promise<unknown>;

/** Best-effort: tells the native side to tear down the in-flight call's
 * connection immediately rather than waiting out its own timeout. Cannot
 * stop the external MCP server's own execution of an already-dispatched
 * request — see the F-11 plan for the honest ceiling here. */
export type McpCanceller = (requestId: string) => Promise<void>;

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class McpBoundary {
  private inFlight = 0;

  constructor(
    private readonly registry: McpRegistry,
    private readonly invoker?: McpInvoker,
    private readonly timeoutMs = MCP_TIMEOUT_MS,
    private readonly canceller?: McpCanceller,
  ) {}

  async callTool(call: McpCallInput, abortSignal?: AbortSignal) {
    const server = await this.registry.get(call.serverId);
    if (!server) throw new Error(`MCP server not found: ${call.serverId}`);
    if (!server.enabled) throw new Error(`MCP server disabled: ${server.id}`);
    const toolName = validateMcpToolName(call.toolName);
    const input = validateMcpCallInput(call.input);
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
    if (abortSignal?.aborted) throw new Error("MCP tool call cancelled");

    const requestId = newRequestId();
    this.inFlight += 1;
    let gaveUp: "timed_out" | "cancelled" | null = null;
    try {
      const racers: Promise<unknown>[] = [
        this.invoker(server, toolName, input, requestId, call.projectRoot ?? ""),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            gaveUp = "timed_out";
            reject(new Error(`MCP tool timed out after ${this.timeoutMs}ms`));
          }, this.timeoutMs);
        }),
      ];
      if (abortSignal) {
        racers.push(
          new Promise<never>((_, reject) => {
            abortSignal.addEventListener(
              "abort",
              () => {
                gaveUp = "cancelled";
                reject(new Error("MCP tool call cancelled"));
              },
              { once: true },
            );
          }),
        );
      }
      const result = await Promise.race(racers);
      return {
        serverId: server.id,
        toolName,
        policy,
        output: boundPayload(result, MCP_OUTPUT_BYTES),
      };
    } finally {
      this.inFlight -= 1;
      // Tell the native side to stop waiting the moment we give up, instead
      // of leaving the connection open for the rest of its own timeout.
      if (gaveUp) void this.canceller?.(requestId);
    }
  }
}
