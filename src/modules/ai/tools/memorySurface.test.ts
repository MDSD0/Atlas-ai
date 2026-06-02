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

describe("memory filesystem tools", () => {
  it("keeps repository artifact mutations approval gated", () => {
    const tools = buildMemoryTools(context);
    expect(tools.memory_surface_enable.needsApproval).toBe(true);
    expect(tools.memory_surface_disable.needsApproval).toBe(true);
    expect(tools.memory_surface_export_work_packet.needsApproval).toBe(true);
  });

  it("gives read-only subagents only inspectable surface operations", () => {
    const tools = buildReadOnlyMemoryTools(context);
    expect(tools).toHaveProperty("memory_surface_status");
    expect(tools).toHaveProperty("memory_surface_read_index");
    expect(tools).toHaveProperty("memory_surface_search_sessions");
    expect(tools).not.toHaveProperty("memory_surface_enable");
    expect(tools).not.toHaveProperty("memory_surface_disable");
    expect(tools).not.toHaveProperty("memory_surface_export_work_packet");
  });
});
