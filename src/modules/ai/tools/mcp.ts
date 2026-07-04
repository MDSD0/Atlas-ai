import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { platform } from "@tauri-apps/plugin-os";
import type { ToolContext } from "./context";
import { agentNative } from "../lib/native";
import {
  MCP_CONNECTOR_STUDIES,
  closeMcpStdioClient,
  listMcpStdioTools,
  mcpBoundary,
  mcpRegistry,
} from "@/modules/ai/mcp";

const toolPolicy = z.enum(["allow", "ask", "deny"]);

export function buildMcpTools(ctx: ToolContext) {
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
    mcp_discover_tools: tool({
      description:
        "Connect to one enabled MCP server and enumerate its advertised tools, descriptions, and input schemas. Requires approval because discovery starts the configured external process. Use this before mcp_call instead of guessing tool names.",
      inputSchema: z.object({ server_id: z.string() }),
      needsApproval: true,
      execute: async ({ server_id }) => {
        try {
          const server = await mcpRegistry.get(server_id);
          if (!server) return { error: `MCP server not found: ${server_id}` };
          if (!server.enabled) {
            return { error: `MCP server disabled: ${server_id}` };
          }
          const projectRoot = ctx.getProjectContext().workspaceRoot;
          if (!projectRoot) return { error: "no project is bound" };
          const discovered = await listMcpStdioTools(server, projectRoot);
          return {
            serverId: server.id,
            serverName: server.name,
            ...discovered,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
    mcp_configure: tool({
      description: "Persist an opt-in stdio MCP server configuration. This never starts a server; the RMCP transport connects lazily after an approved call.",
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
          const configured = await mcpRegistry.configure({
            ...input,
            defaultToolPolicy: default_tool_policy,
          });
          await closeMcpStdioClient(configured.id).catch(() => undefined);
          return configured;
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
    mcp_configure_playwright: tool({
      description:
        "Configure and enable the official Playwright MCP server in isolated headless mode for behavioral browser verification. Uses the source-reviewed @playwright/mcp 0.0.77 package. Requires approval and may download the npm package when first discovered.",
      inputSchema: z.object({}),
      needsApproval: true,
      execute: async () => {
        try {
          const projectRoot = ctx.getProjectContext().workspaceRoot;
          if (!projectRoot) return { error: "no project is bound" };
          const session = (ctx.getSessionId() ?? "default").replace(
            /[^A-Za-z0-9_-]/g,
            "_",
          );
          const outputDir = `${projectRoot.replace(/[\\/]$/, "")}/.atlas/browser/${session}`;
          await agentNative.gitPrepareAtlasInternal(projectRoot).catch(
            () => undefined,
          );
          const browserArgs =
            platform() === "windows" ? ["--browser", "msedge"] : [];
          const configured = await mcpRegistry.configure({
            id: "playwright",
            name: "Playwright browser verification",
            command: "npx",
            args: [
              "-y",
              "@playwright/mcp@0.0.77",
              "--isolated",
              "--headless",
              "--console-level",
              "warning",
              "--output-mode",
              "stdout",
              "--output-dir",
              outputDir,
              ...browserArgs,
            ],
            enabled: true,
            defaultToolPolicy: "ask",
          });
          await closeMcpStdioClient(configured.id).catch(() => undefined);
          return {
            configured,
            outputDir,
            next:
              "Call mcp_discover_tools with server_id playwright, then invoke only the browser tools needed for the requested behavior.",
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
    mcp_enable: tool({
      description: "Enable an MCP server configuration. The RMCP stdio client still starts lazily only after an approved tool call.",
      inputSchema: z.object({ id: z.string() }),
      needsApproval: true,
      execute: async ({ id }) => ({ id, enabled: await mcpRegistry.setEnabled(id, true) }),
    }),
    mcp_disable: tool({
      description: "Disable an MCP server configuration.",
      inputSchema: z.object({ id: z.string() }),
      needsApproval: true,
      execute: async ({ id }) => {
        const disabled = await mcpRegistry.setEnabled(id, false);
        await closeMcpStdioClient(id).catch(() => undefined);
        return { id, disabled };
      },
    }),
    mcp_remove: tool({
      description: "Remove an MCP server configuration.",
      inputSchema: z.object({ id: z.string() }),
      needsApproval: true,
      execute: async ({ id }) => {
        const removed = await mcpRegistry.remove(id);
        await closeMcpStdioClient(id).catch(() => undefined);
        return { id, removed };
      },
    }),
    mcp_call: tool({
      description: "Invoke one explicitly configured MCP tool through the bounded policy boundary and lazy RMCP stdio transport.",
      inputSchema: z.object({
        server_id: z.string(),
        tool_name: z.string(),
        input: z.record(z.string(), z.unknown()),
      }),
      needsApproval: true,
      execute: async ({ server_id, tool_name, input }, options: ToolExecutionOptions) => {
        try {
          const projectRoot = ctx.getProjectContext().workspaceRoot;
          if (!projectRoot) return { error: "no project is bound" };
          return await mcpBoundary.callTool(
            {
              serverId: server_id,
              toolName: tool_name,
              input,
              approved: true,
              projectRoot,
            },
            options.abortSignal,
          );
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
  } as const;
}

export function buildReadOnlyMcpTools() {
  return {
    mcp_status: tool({
      description: "Inspect the optional Atlas MCP boundary.",
      inputSchema: z.object({}),
      execute: () => mcpRegistry.status(),
    }),
    mcp_list: tool({
      description: "List inert MCP server configurations.",
      inputSchema: z.object({}),
      execute: () => mcpRegistry.list(),
    }),
    mcp_connector_studies: tool({
      description: "Inspect MCP connector studies.",
      inputSchema: z.object({}),
      execute: async () => ({ studies: MCP_CONNECTOR_STUDIES }),
    }),
  } as const;
}
