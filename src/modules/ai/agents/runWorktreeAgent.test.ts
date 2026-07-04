import { describe, expect, it } from "vitest";
import type { ToolContext } from "../tools/context";
import { bindWorktreeContext } from "./runWorktreeAgent";

describe("bindWorktreeContext", () => {
  it("rebinds every file and execution root without sharing read state", () => {
    const parentReadCache = new Map();
    const parent = {
      getCwd: () => "/repo",
      getWorkspaceRoot: () => "/repo",
      getProjectContext: () => ({
        projectId: "/repo",
        workspaceRoot: "/repo",
        projectName: "Repo",
        activeFolder: "/repo/src",
        activeFile: "/repo/src/main.ts",
        activeSelection: "selected",
        activeTerminalId: 1,
        activeTerminalCwd: "/outside",
        executionCwd: "/repo",
        executionCwdMode: "workspace" as const,
      }),
      readCache: parentReadCache,
      getApprovalMode: () => "default" as const,
    } as unknown as ToolContext;

    const bound = bindWorktreeContext(parent, "/repo/.atlas/worktrees/fix");
    const project = bound.getProjectContext();

    expect(bound.getWorkspaceRoot()).toBe("/repo/.atlas/worktrees/fix");
    expect(bound.getCwd()).toBe("/repo/.atlas/worktrees/fix");
    expect(project.workspaceRoot).toBe("/repo/.atlas/worktrees/fix");
    expect(project.executionCwd).toBe("/repo/.atlas/worktrees/fix");
    expect(project.activeFile).toBeNull();
    expect(project.activeTerminalCwd).toBeNull();
    expect(bound.getApprovalMode()).toBe("full");
    expect(bound.readCache).not.toBe(parentReadCache);
  });
});
