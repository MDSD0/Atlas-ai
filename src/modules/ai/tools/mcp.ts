import { tool } from "ai";
import { z } from "zod";
import {
  MCP_CONNECTOR_STUDIES,
  mcpBoundary,
  mcpRegistry,
} from "@/modules/ai/mcp";

const toolPolicy = z.enum(["allow", "ask", "deny"]);

export function buildMcpTools() {
  return {
    mcp_status: tool({
      description: "Inspect the optional Atlas MCP boundary. MCP stays disabled unless explicitly configured and enabled.",
      inputSchema: z.object({}),
      execute: () => mcpRegistry.status(),
    }),
    mcp_list: tool({
      description: "List inert MCP server configurations. Credentials are never persisted here.",
      inputSchema: z.object({}),
      execute: () => mcpRegistry.list(),
    }),
    mcp_connector_studies: tool({
      description: "Inspect the GitHub and Playwright MCP connector studies. Neither connector is enabled automatically.",
      inputSchema: z.object({}),
      execute: async () => ({ studies: MCP_CONNECTOR_STUDIES }),
    }),
    mcp_configure: tool({
      description: "Persist an inert stdio MCP server configuration. This never starts a server.",
      inputSchema: z.object({
        id: z.string(),
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
        default_tool_policy: toolPolicy.optional(),
        tools: z.record(z.string(), toolPolicy).optional(),
      }),
      needsApproval: true,
      execute: async ({ default_tool_policy, ...input }) => {
        try {
          return await mcpRegistry.configure({
            ...input,
            defaultToolPolicy: default_tool_policy,
          });
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
    mcp_enable: tool({
      description: "Enable an inert MCP server configuration. The V1 transport adapter remains deliberately deferred.",
      inputSchema: z.object({ id: z.string() }),
      needsApproval: true,
      execute: async ({ id }) => ({ id, enabled: await mcpRegistry.setEnabled(id, true) }),
    }),
    mcp_disable: tool({
      description: "Disable an MCP server configuration.",
      inputSchema: z.object({ id: z.string() }),
      needsApproval: true,
      execute: async ({ id }) => ({ id, disabled: await mcpRegistry.setEnabled(id, false) }),
    }),
    mcp_remove: tool({
      description: "Remove an MCP server configuration.",
      inputSchema: z.object({ id: z.string() }),
      needsApproval: true,
      execute: async ({ id }) => ({ id, removed: await mcpRegistry.remove(id) }),
    }),
    mcp_call: tool({
      description: "Invoke one explicitly configured MCP tool through the bounded policy boundary. Slice H leaves the process transport unattached.",
      inputSchema: z.object({
        server_id: z.string(),
        tool_name: z.string(),
        input: z.record(z.string(), z.unknown()),
      }),
      needsApproval: true,
      execute: async ({ server_id, tool_name, input }) => {
        try {
          return await mcpBoundary.callTool({
            serverId: server_id,
            toolName: tool_name,
            input,
            approved: true,
          });
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
  } as const;
}

export function buildReadOnlyMcpTools() {
  const tools = buildMcpTools();
  return {
    mcp_status: tools.mcp_status,
    mcp_list: tools.mcp_list,
    mcp_connector_studies: tools.mcp_connector_studies,
  } as const;
}
