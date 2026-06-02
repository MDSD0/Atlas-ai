import { describe, expect, it } from "vitest";
import type { ToolContext } from "@/modules/ai/tools/context";
import {
  buildReadOnlyWorkPacketTools,
  buildWorkPacketTools,
} from "@/modules/ai/tools/workPackets";

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

describe("work packet tools", () => {
  it("keeps durable generation and deletion approval gated", () => {
    const tools = buildWorkPacketTools(context);
    expect(tools.work_packet_generate.needsApproval).toBe(true);
    expect(tools.work_packet_delete.needsApproval).toBe(true);
  });

  it("exposes only inspectable resume operations to read-only subagents", () => {
    expect(Object.keys(buildReadOnlyWorkPacketTools(context))).toEqual([
      "work_packet_list",
      "work_packet_inspect",
      "work_packet_resume",
    ]);
  });
});
