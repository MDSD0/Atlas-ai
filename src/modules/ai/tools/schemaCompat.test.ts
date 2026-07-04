import { describe, expect, it } from "vitest";
import { buildTools, type ToolContext } from "./tools";

// F-04: Gemini's function-calling schema rejects boolean-valued literals
// (z.literal(true)/z.literal(false)) — a real production run failed with an
// HTTP 400 before the first token once a tool using one was promoted into
// the active toolset. This is a static, no-network contract test: it walks
// every advertised tool's Zod schema and fails if any literal wraps a
// boolean, regardless of which provider/JSON-Schema converter is in play.
function hasBooleanLiteral(schema: unknown, seen = new Set<unknown>()): boolean {
  if (!schema || typeof schema !== "object" || !("_zod" in schema)) return false;
  if (seen.has(schema)) return false;
  seen.add(schema);
  const def = (schema as { _zod: { def: Record<string, unknown> } })._zod.def;
  if (
    def.type === "literal" &&
    Array.isArray(def.values) &&
    def.values.some((v) => typeof v === "boolean")
  ) {
    return true;
  }
  for (const value of Object.values(def)) {
    if (!value || typeof value !== "object") continue;
    if ("_zod" in value) {
      if (hasBooleanLiteral(value, seen)) return true;
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "_zod" in item && hasBooleanLiteral(item, seen)) {
          return true;
        }
      }
    } else {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (nested && typeof nested === "object" && "_zod" in nested && hasBooleanLiteral(nested, seen)) {
          return true;
        }
      }
    }
  }
  return false;
}

const ctx = {
  getCwd: () => null,
  getWorkspaceRoot: () => "/repo",
  getProjectContext: () => ({}),
  getTerminalContext: () => null,
  isActiveTerminalPrivate: () => false,
  injectIntoActivePty: () => false,
  openPreview: () => false,
  spawnAgent: () => null,
  readAgentOutput: () => null,
  readCache: new Map(),
  getSessionId: () => "s1",
  getApprovalMode: () => "default",
} as unknown as ToolContext;

describe("tool schema provider compatibility (F-04)", () => {
  it("no advertised tool's inputSchema contains a boolean literal", () => {
    const tools = buildTools(ctx, "full");
    const offenders: string[] = [];
    for (const [name, t] of Object.entries(tools)) {
      const inputSchema = (t as { inputSchema?: unknown }).inputSchema;
      if (hasBooleanLiteral(inputSchema)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
