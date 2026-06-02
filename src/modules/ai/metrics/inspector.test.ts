import { describe, expect, it } from "vitest";
import { inspectContext, type ContextInspectorSources } from "@/modules/ai/metrics/inspector";
import type { ToolContext } from "@/modules/ai/tools/context";

function context(root: string | null = "/repo"): ToolContext {
  return {
    getCwd: () => root, getWorkspaceRoot: () => root, getTerminalContext: () => null,
    isActiveTerminalPrivate: () => false, injectIntoActivePty: () => false,
    openPreview: () => false, spawnAgent: () => null, readAgentOutput: () => null,
    readCache: new Map(), getSessionId: () => "s-1", getApprovalMode: () => "default",
    getProjectContext: () => ({
      projectId: root, workspaceRoot: root, projectName: "repo", activeFolder: root,
      activeFile: root ? `${root}/src/main.ts` : null, activeSelection: null,
      activeTerminalId: null, activeTerminalCwd: root, executionCwd: root, executionCwdMode: "workspace",
    }),
  };
}

function sources(): ContextInspectorSources {
  return {
    reality: async () => ({ file_count: 3 }), lsp: async () => [{ status: "available" }],
    memory: async () => ({ active: 1 }), skills: async () => ({ enabled: [] }),
    mcp: async () => ({ state: "disabled" }), proof: () => ({ status: "passed" }),
  };
}

describe("inspectContext", () => {
  it("aggregates existing subsystem boundaries on demand", async () => {
    await expect(inspectContext(context(), "inspect", sources())).resolves.toMatchObject({
      sections: { reality: { status: "ok" }, lsp: { status: "ok" }, memory: { status: "ok" }, skills: { status: "ok" }, mcp: { status: "ok" } },
      proof: { status: "passed" }, degraded: [],
    });
  });

  it("surfaces degraded sections and refuses unbound projects", async () => {
    const degraded = sources();
    degraded.lsp = async () => { throw new Error("missing provider"); };
    await expect(inspectContext(context(), "inspect", degraded)).resolves.toMatchObject({ degraded: ["lsp"] });
    await expect(inspectContext(context(null), "inspect", sources())).resolves.toMatchObject({ error: expect.stringContaining("no project") });
  });
});
