import { describe, expect, it } from "vitest";
import type { ToolContext } from "@/modules/ai/tools/context";
import {
  buildMemoryTools,
  buildReadOnlyMemoryTools,
} from "@/modules/ai/tools/memory";

const context: ToolContext = {
  getCwd: () => "/repo",
  getWorkspaceRoot: () => "/repo",
  getProjectContext: () => ({
    projectId: "/repo",
    workspaceRoot: "/repo",
    projectName: "repo",
    activeFolder: "/repo",
    activeFile: null,
    activeSelection: null,
    activeTerminalId: null,
    activeTerminalCwd: null,
    executionCwd: "/repo",
    executionCwdMode: "workspace",
  }),
  getTerminalContext: () => null,
  isActiveTerminalPrivate: () => false,
  injectIntoActivePty: () => false,
  openPreview: () => false,
  spawnAgent: () => null,
  readAgentOutput: () => null,
  readCache: new Map(),
  getSessionId: () => "session-1",
  getApprovalMode: () => "default",
};

describe("memory governor tools", () => {
  it("exposes exactly the consolidated governor surface", () => {
    const tools = buildMemoryTools(context);
    expect(Object.keys(tools).sort()).toEqual([
      "memory_forget",
      "memory_list",
      "memory_recall",
      "memory_remember",
      "memory_status",
      "memory_surface_enable",
    ]);
  });

  it("keeps mutations approval gated", () => {
    const tools = buildMemoryTools(context);
    expect(tools.memory_surface_enable.needsApproval).toBe(true);
    expect(tools.memory_remember.needsApproval).toBe(true);
    expect(tools.memory_forget.needsApproval).toBe(true);
  });

  it("gives read-only subagents only inspection operations", () => {
    const tools = buildReadOnlyMemoryTools(context);
    expect(Object.keys(tools).sort()).toEqual([
      "memory_list",
      "memory_recall",
      "memory_status",
    ]);
  });
});
