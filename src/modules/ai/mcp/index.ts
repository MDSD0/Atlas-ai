import { McpBoundary } from "@/modules/ai/mcp/boundary";
import { TauriMcpPersistence } from "@/modules/ai/mcp/persistence";
import { McpRegistry } from "@/modules/ai/mcp/registry";

export * from "@/modules/ai/mcp/boundary";
export * from "@/modules/ai/mcp/contracts";
export * from "@/modules/ai/mcp/persistence";
export * from "@/modules/ai/mcp/registry";
export * from "@/modules/ai/mcp/studies";

export const mcpRegistry = new McpRegistry(new TauriMcpPersistence());
export const mcpBoundary = new McpBoundary(mcpRegistry);
