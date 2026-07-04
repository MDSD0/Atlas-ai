import { afterEach, describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CORE_TOOL_NAMES,
  activeToolNames,
  capabilityToolNames,
  clearPromotedCapabilities,
  getPromotedCapabilities,
  promoteCapabilities,
  searchCapabilities,
} from "./capabilities";
import { buildTools, type ToolContext } from "./tools";

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

const SESSION = "test-session";

afterEach(() => clearPromotedCapabilities(SESSION));

describe("capability gateway", () => {
  it("default active toolbelt is just the small core set", () => {
    expect(activeToolNames(SESSION).sort()).toEqual([...CORE_TOOL_NAMES].sort());
    expect(activeToolNames(SESSION)).toContain("capability_search");
    expect(activeToolNames(SESSION)).not.toContain("lsp_references");
  });

  it("ranks capabilities by keyword overlap", () => {
    const refs = searchCapabilities("find all callers of this function");
    expect(refs.map((c) => c.id)).toContain("repo_intel");

    const mem = searchCapabilities("what did we decide in past sessions");
    expect(mem.map((c) => c.id)).toContain("memory");

    const worktrees = searchCapabilities("create an isolated git worktree");
    expect(worktrees.map((c) => c.id)).toContain("worktrees");

    expect(searchCapabilities("")).toEqual([]);
  });

  it("promotes searched capabilities into the active set for the run", () => {
    promoteCapabilities(SESSION, ["code_intel_lsp"]);
    expect(getPromotedCapabilities(SESSION)).toEqual(["code_intel_lsp"]);
    const active = activeToolNames(SESSION);
    expect(active).toContain("lsp_references");
    expect(active).toContain("read_file"); // core stays
  });

  it("ignores unknown capability ids", () => {
    promoteCapabilities(SESSION, ["not_a_capability"]);
    expect(getPromotedCapabilities(SESSION)).toEqual([]);
  });

  it("leaves no orphaned tool — every full-mode tool is core or in a capability", () => {
    const reachable = new Set<string>([
      ...CORE_TOOL_NAMES,
      ...capabilityToolNames(CAPABILITIES.map((c) => c.id)),
    ]);
    const built = Object.keys(buildTools(ctx, "full"));
    const orphans = built.filter((name) => !reachable.has(name));
    expect(orphans).toEqual([]);
  });

  it("clears promotions between runs", () => {
    promoteCapabilities(SESSION, ["memory"]);
    clearPromotedCapabilities(SESSION);
    expect(activeToolNames(SESSION).sort()).toEqual([...CORE_TOOL_NAMES].sort());
  });

  it("can pre-promote a capability family without capability_search", () => {
    promoteCapabilities(SESSION, ["repo_intel"]);
    const active = activeToolNames(SESSION);
    expect(active).toContain("find_symbol");
    expect(active).toContain("repo_map");
    expect(active).toContain("read_file");
  });

  it("blocked capability families stay removed even after promotion", () => {
    promoteCapabilities(SESSION, ["repo_intel"]);
    const active = activeToolNames(SESSION, ["repo_intel"]);
    expect(getPromotedCapabilities(SESSION)).toEqual(["repo_intel"]);
    expect(active).not.toContain("find_symbol");
    expect(active).not.toContain("repo_map");
    expect(active).toContain("read_file");
    expect(active).toContain("grep");
  });

  it("skillToolRestriction narrows the active toolbelt to the given set (F-10)", () => {
    const active = activeToolNames(SESSION, [], ["read_file", "grep"]);
    expect(active).toEqual(["read_file", "grep"]);
  });

  it("skillToolRestriction can exclude capability_search itself, so a skill can't be routed around", () => {
    const active = activeToolNames(SESSION, [], ["read_file"]);
    expect(active).not.toContain("capability_search");
  });

  it("null or empty skillToolRestriction leaves the normal gateway output untouched", () => {
    expect(activeToolNames(SESSION, [], null)).toEqual(activeToolNames(SESSION));
    expect(activeToolNames(SESSION, [], [])).toEqual(activeToolNames(SESSION));
  });

  it("skillToolRestriction only narrows what the gateway already exposes, never adds beyond it", () => {
    // "lsp_references" isn't active (no capability promoted), so listing it
    // in the restriction must not make it appear.
    const active = activeToolNames(SESSION, [], ["read_file", "lsp_references"]);
    expect(active).toEqual(["read_file"]);
  });
});
