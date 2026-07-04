import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWorktreeAgent } from "../agents/runWorktreeAgent";
import { native } from "../lib/native";
import type { ToolContext } from "./context";
import { buildWorktreeTools } from "./worktrees";

vi.mock("../agents/runWorktreeAgent", () => ({
  runWorktreeAgent: vi.fn(),
}));

function context(workspaceRoot: string | null): ToolContext {
  return {
    getProjectContext: () => ({ workspaceRoot }),
  } as unknown as ToolContext;
}

async function execute(
  tool: unknown,
  input: Record<string, unknown>,
): Promise<unknown> {
  const fn = (tool as { execute?: (value: Record<string, unknown>) => unknown })
    .execute;
  if (!fn) throw new Error("tool has no execute function");
  return (fn as (
    value: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => unknown)(input, {
    toolCallId: "worktree-test",
    messages: [],
    abortSignal: new AbortController().signal,
  });
}

beforeEach(() => vi.restoreAllMocks());

describe("worktree tools", () => {
  it("refuses every operation when no workspace is bound", async () => {
    const spy = vi.spyOn(native, "gitWorktreeList");
    const tools = buildWorktreeTools(context(null));

    const result = await execute(tools.worktree_list, {});

    expect(result).toEqual({
      error: "no project is bound; refusing workspace file access",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("lists native worktrees for the bound repository", async () => {
    vi.spyOn(native, "gitWorktreeList").mockResolvedValue([
      { path: "/repo", branch: "main", head: "abc", isMain: true },
    ]);
    const tools = buildWorktreeTools(context("/repo"));

    const result = await execute(tools.worktree_list, {});

    expect(native.gitWorktreeList).toHaveBeenCalledWith("/repo");
    expect(result).toEqual({
      worktrees: [{ path: "/repo", branch: "main", head: "abc", isMain: true }],
    });
  });

  it("creates worktrees through the native constrained operation", async () => {
    vi.spyOn(native, "gitWorktreeCreate").mockResolvedValue({
      worktree: {
        path: "/repo/.atlas/worktrees/fix-one",
        branch: "atlas/fix-one",
        head: "abc",
        isMain: false,
      },
    });
    const tools = buildWorktreeTools(context("/repo"));

    const result = await execute(tools.worktree_create, {
      name: "fix-one",
      base_ref: "main",
    });

    expect(native.gitWorktreeCreate).toHaveBeenCalledWith(
      "/repo",
      "fix-one",
      "main",
    );
    expect(result).toHaveProperty("worktree.branch", "atlas/fix-one");
  });

  it("inspects only a linked Atlas worktree and returns both patch lanes", async () => {
    vi.spyOn(native, "gitWorktreeList").mockResolvedValue([
      { path: "/repo", branch: "main", head: "abc", isMain: true },
      {
        path: "/repo/.atlas/worktrees/fix-one",
        branch: "atlas/fix-one",
        head: "def",
        isMain: false,
      },
    ]);
    vi.spyOn(native, "gitStatus").mockResolvedValue({
      repoRoot: "/repo/.atlas/worktrees/fix-one",
      branch: "atlas/fix-one",
      upstream: null,
      ahead: 0,
      behind: 0,
      isDetached: false,
      truncated: false,
      changedFiles: [],
    });
    vi.spyOn(native, "gitDiff")
      .mockResolvedValueOnce({ diffText: "unstaged", truncated: false })
      .mockResolvedValueOnce({ diffText: "staged", truncated: false });
    const tools = buildWorktreeTools(context("/repo"));

    const result = await execute(tools.worktree_inspect, {
      path: "/repo/.atlas/worktrees/fix-one",
    });

    expect(native.gitStatus).toHaveBeenCalledWith(
      "/repo/.atlas/worktrees/fix-one",
    );
    expect(result).toMatchObject({
      unstaged: { diffText: "unstaged" },
      staged: { diffText: "staged" },
    });
  });

  it("refuses inspection and commits for a checkout not returned by Git", async () => {
    vi.spyOn(native, "gitWorktreeList").mockResolvedValue([
      { path: "/repo", branch: "main", head: "abc", isMain: true },
    ]);
    const commit = vi.spyOn(native, "gitCommit");
    const tools = buildWorktreeTools(context("/repo"));

    const result = await execute(tools.worktree_commit, {
      path: "/repo/other",
      message: "should not run",
    });

    expect(result).toEqual({
      error: "worktree is not an Atlas-managed linked checkout",
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("binds a coding worker to the managed worktree and returns its patch", async () => {
    const path = "/repo/.atlas/worktrees/fix-one";
    vi.spyOn(native, "gitWorktreeList").mockResolvedValue([
      { path: "/repo", branch: "main", head: "abc", isMain: true },
      { path, branch: "atlas/fix-one", head: "def", isMain: false },
    ]);
    vi.spyOn(native, "workspaceAuthorizeAgentProject").mockResolvedValue(
      path,
    );
    vi.mocked(runWorktreeAgent).mockResolvedValue({
      summary: "updated parser",
      stepCount: 4,
      durationMs: 20,
    });
    vi.spyOn(native, "gitStatus").mockResolvedValue({
      repoRoot: path,
      branch: "atlas/fix-one",
      upstream: null,
      ahead: 0,
      behind: 0,
      isDetached: false,
      truncated: false,
      changedFiles: [],
    });
    vi.spyOn(native, "gitDiff")
      .mockResolvedValueOnce({ diffText: "patch", truncated: false })
      .mockResolvedValueOnce({ diffText: "", truncated: false });
    const tools = buildWorktreeTools(context("/repo"));

    const result = await execute(tools.worktree_run, {
      path,
      prompt: "fix the parser",
    });

    expect(native.workspaceAuthorizeAgentProject).toHaveBeenCalledWith(
      path,
    );
    expect(runWorktreeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: path, prompt: "fix the parser" }),
    );
    expect(result).toMatchObject({
      summary: "updated parser",
      verificationRequired: true,
      unstaged: { diffText: "patch" },
    });
  });
});
