import {
  agentNative,
  type McpStdioCallResponse,
} from "@/modules/ai/lib/native";
import type { McpInvoker } from "@/modules/ai/mcp/boundary";
import type { McpServerConfig } from "@/modules/ai/mcp/contracts";

export const invokeMcpStdioTool: McpInvoker = (server, toolName, input, requestId, projectRoot) =>
  agentNative.mcpStdioCall({
    requestId,
    serverId: server.id,
    command: server.command,
    args: server.args,
    toolName,
    input,
  }, projectRoot);

export function listMcpStdioTools(server: McpServerConfig, projectRoot: string) {
  return agentNative.mcpStdioListTools({
    serverId: server.id,
    command: server.command,
    args: server.args,
  }, projectRoot);
}

export async function closeMcpStdioClient(serverId?: string): Promise<number> {
  return agentNative.mcpStdioClose(serverId);
}

/** Best-effort: see `agentNative.mcpStdioCancel` — never throws. */
export async function cancelMcpStdioCall(requestId: string): Promise<void> {
  await agentNative.mcpStdioCancel(requestId).catch(() => {});
}

export type { McpStdioCallResponse };
