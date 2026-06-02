import {
  agentNative,
  type McpStdioCallResponse,
} from "@/modules/ai/lib/native";
import type { McpInvoker } from "@/modules/ai/mcp/boundary";

export const invokeMcpStdioTool: McpInvoker = (server, toolName, input) =>
  agentNative.mcpStdioCall({
    serverId: server.id,
    command: server.command,
    args: server.args,
    toolName,
    input,
  });

export async function closeMcpStdioClient(serverId?: string): Promise<number> {
  return agentNative.mcpStdioClose(serverId);
}

export type { McpStdioCallResponse };
