import { describe, expect, it } from "vitest";
import {
  resolvePath,
  validateWithinWorkspace,
  type AtlasToolProjectContext,
} from "./context";

function ctx(
  patch: Partial<AtlasToolProjectContext> = {},
): AtlasToolProjectContext {
  return {
    projectId: "/repo",
    workspaceRoot: "/repo",
    projectName: "repo",
    activeFolder: null,
    activeFile: null,
    activeSelection: null,
    activeTerminalId: 1,
    activeTerminalCwd: "/tmp",
    executionCwd: "/repo",
    executionCwdMode: "workspace",
    ...patch,
  };
}

describe("Atlas path resolution", () => {
  it("resolves relative paths to active file parent first", () => {
    expect(
      resolvePath("notes.md", ctx({ activeFile: "/repo/src/app.ts" })),
    ).toBe("/repo/src/notes.md");
  });

  it("resolves relative paths to activeFolder when no active file exists", () => {
    expect(resolvePath("notes.md", ctx({ activeFolder: "/repo/docs" }))).toBe(
      "/repo/docs/notes.md",
    );
  });

  it("resolves relative paths to workspaceRoot when no active folder exists", () => {
    expect(resolvePath("notes.md", ctx())).toBe("/repo/notes.md");
  });

  it("does not resolve relative paths against activeTerminalCwd by default", () => {
    expect(resolvePath("notes.md", ctx({ activeTerminalCwd: "/tmp" }))).toBe(
      "/repo/notes.md",
    );
  });

  it("rejects relative paths without project, folder, or file binding", () => {
    expect(() =>
      resolvePath(
        "notes.md",
        ctx({
          projectId: null,
          workspaceRoot: null,
          activeFolder: null,
          activeFile: null,
        }),
      ),
    ).toThrow(/cannot resolve relative path/);
  });
});

describe("Atlas workspace boundary", () => {
  const canonicalize = async (path: string) => {
    if (path === "/repo" || path.startsWith("/repo/")) return path;
    if (path === "/tmp" || path.startsWith("/tmp/")) return path;
    throw new Error("missing");
  };

  it("allows paths inside workspaceRoot", async () => {
    await expect(
      validateWithinWorkspace("/repo/src/app.ts", ctx(), canonicalize),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects paths outside workspaceRoot", async () => {
    await expect(
      validateWithinWorkspace("/tmp/notes.md", ctx(), canonicalize),
    ).resolves.toMatchObject({ ok: false });
  });

  it("allows new nested paths when an ancestor is inside workspaceRoot", async () => {
    await expect(
      validateWithinWorkspace("/repo/new/deep/notes.md", ctx(), canonicalize),
    ).resolves.toEqual({ ok: true });
  });
});
