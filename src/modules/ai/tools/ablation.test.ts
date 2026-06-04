import { describe, expect, it } from "vitest";
import { buildTools, type ToolContext } from "./tools";

// The tool builders only capture ctx in closures (getters run lazily at execute
// time), so a structural stub is enough to assert which families each ablation
// mode exposes.
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

function names(mode: Parameters<typeof buildTools>[1]) {
  return new Set(Object.keys(buildTools(ctx, mode)));
}

describe("buildTools ablation modes", () => {
  it("plain mode exposes the irreducible coding loop only", () => {
    const t = names("plain");
    expect(t.has("read_file")).toBe(true);
    expect(t.has("edit")).toBe(true);
    expect(t.has("grep")).toBe(true);
    expect(t.has("bash_run")).toBe(true);
    expect(t.has("todo_write")).toBe(true);
    // No repo map, LSP, memory, or MCP in plain.
    expect(t.has("repo_context")).toBe(false);
    expect(t.has("lsp_status")).toBe(false);
    expect(t.has("mcp_call")).toBe(false);
  });

  it("repo_map mode adds reality tools but not LSP", () => {
    const t = names("repo_map");
    expect(t.has("repo_context")).toBe(true);
    expect(t.has("find_symbol")).toBe(true);
    expect(t.has("lsp_status")).toBe(false);
    expect(t.has("mcp_call")).toBe(false);
  });

  it("repo_map_lsp mode adds semantic tools on top of repo map", () => {
    const t = names("repo_map_lsp");
    expect(t.has("repo_context")).toBe(true);
    expect(t.has("lsp_status")).toBe(true);
    // Still no memory/MCP — those are full-mode only.
    expect(t.has("mcp_call")).toBe(false);
  });

  it("full mode (default) exposes the advanced tools", () => {
    const t = names("full");
    expect(t.has("repo_context")).toBe(true);
    expect(t.has("lsp_status")).toBe(true);
    expect(t.has("mcp_call")).toBe(true);
    // Default with no mode argument equals full.
    expect(new Set(Object.keys(buildTools(ctx)))).toEqual(t);
  });
});
