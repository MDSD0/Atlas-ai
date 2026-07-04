import { redactSensitive } from "@/modules/ai/lib/redact";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_STORE_PATH = "atlas-ai-mcp.json";
export const MCP_SERVER_LIMIT = 20;
export const MCP_ARGS_LIMIT = 20;
export const MCP_ARG_BYTES = 512;
export const MCP_INPUT_BYTES = 32 * 1024;
export const MCP_OUTPUT_BYTES = 8192;
export const MCP_TIMEOUT_MS = 60_000;
export const MCP_MAX_CONCURRENT_CALLS = 2;

export type McpToolPolicy = "allow" | "ask" | "deny";

export type McpServerConfig = {
  id: string;
  name: string;
  enabled: boolean;
  transport: "stdio";
  command: string;
  args: string[];
  defaultToolPolicy: McpToolPolicy;
  tools: Record<string, McpToolPolicy>;
  createdAt: number;
  updatedAt: number;
};

export type ConfigureMcpServerInput = {
  id: string;
  name: string;
  command: string;
  args?: readonly string[];
  enabled?: boolean;
  defaultToolPolicy?: McpToolPolicy;
  tools?: Readonly<Record<string, McpToolPolicy>>;
};

export type McpCallInput = {
  serverId: string;
  toolName: string;
  input: Record<string, unknown>;
  approved?: boolean;
  projectRoot?: string;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TOOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function boundedText(value: string, field: string, maxBytes: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (new TextEncoder().encode(trimmed).byteLength > maxBytes) {
    throw new Error(`${field} exceeds ${maxBytes} bytes`);
  }
  if (redactSensitive(trimmed) !== trimmed) {
    throw new Error(`${field} contains possible secret material`);
  }
  return trimmed;
}

export function validateMcpToolName(name: string): string {
  const validated = boundedText(name, "tool name", 128);
  if (!TOOL_PATTERN.test(validated)) throw new Error("invalid MCP tool name");
  return validated;
}

export function validateMcpServerInput(
  input: ConfigureMcpServerInput,
  timestamp = Date.now(),
  existing?: McpServerConfig | null,
): McpServerConfig {
  const id = boundedText(input.id, "server id", 64);
  if (!ID_PATTERN.test(id)) {
    throw new Error("server id must use lowercase letters, digits, dot, dash, or underscore");
  }
  const args = [...(input.args ?? [])];
  if (args.length > MCP_ARGS_LIMIT) {
    throw new Error(`MCP args exceed ${MCP_ARGS_LIMIT} items`);
  }
  const tools: Record<string, McpToolPolicy> = {};
  for (const [name, policy] of Object.entries(input.tools ?? {})) {
    tools[validateMcpToolName(name)] = policy;
  }
  return {
    id,
    name: boundedText(input.name, "server name", 128),
    enabled: input.enabled ?? existing?.enabled ?? false,
    transport: "stdio",
    command: boundedText(input.command, "server command", MCP_ARG_BYTES),
    args: args.map((arg, index) =>
      boundedText(arg, `server arg ${index + 1}`, MCP_ARG_BYTES),
    ),
    defaultToolPolicy: input.defaultToolPolicy ?? existing?.defaultToolPolicy ?? "deny",
    tools,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function isPlainMcpInput(
  input: unknown,
): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

export function validateMcpCallInput(
  input: unknown,
): Record<string, unknown> {
  if (!isPlainMcpInput(input)) throw new Error("MCP tool input must be an object");
  let encoded: string;
  try {
    encoded = JSON.stringify(input);
  } catch {
    throw new Error("MCP tool input must be JSON serializable");
  }
  if (new TextEncoder().encode(encoded).byteLength > MCP_INPUT_BYTES) {
    throw new Error(`MCP tool input exceeds ${MCP_INPUT_BYTES} bytes`);
  }
  if (redactSensitive(encoded) !== encoded) {
    throw new Error("MCP tool input contains possible secret material");
  }
  return input;
}
