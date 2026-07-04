import { describe, expect, it } from "vitest";
import {
  checkFileAccessAllowed,
  checkMutationAllowed,
  resolvePath,
  UNBOUND_FILE_ACCESS_ERROR,
  UNBOUND_MUTATION_ERROR,
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

  it("resolves an empty path to the default project base", () => {
    expect(resolvePath("", ctx({ activeFolder: "/repo/project" }))).toBe(
      "/repo/project",
    );
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

describe("Atlas unbound mutation guard", () => {
  it("blocks mutation when no project is bound (e.g. Create TODO.md)", () => {
    const blocked = checkMutationAllowed(
      ctx({ projectId: null, workspaceRoot: null }),
    );
    expect(blocked).toEqual({ error: UNBOUND_MUTATION_ERROR });
  });

  it("allows mutation when a project is bound", () => {
    expect(checkMutationAllowed(ctx({ workspaceRoot: "/repo" }))).toBeNull();
  });
});

describe("Atlas unbound file-access guard", () => {
  it("blocks agent file access when no project is bound", () => {
    const blocked = checkFileAccessAllowed(
      ctx({ projectId: null, workspaceRoot: null }),
    );
    expect(blocked).toEqual({ error: UNBOUND_FILE_ACCESS_ERROR });
  });

  it("allows agent file access when a project is bound", () => {
    expect(checkFileAccessAllowed(ctx({ workspaceRoot: "/repo" }))).toBeNull();
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
      validateWithinWorkspace("/repo/src/app.ts", ctx(), canonicalize, "default"),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects paths outside workspaceRoot", async () => {
    await expect(
      validateWithinWorkspace("/tmp/notes.md", ctx(), canonicalize, "default"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("allows new nested paths when an ancestor is inside workspaceRoot", async () => {
    await expect(
      validateWithinWorkspace("/repo/new/deep/notes.md", ctx(), canonicalize, "default"),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects case-variant siblings when native canonicalization keeps them distinct", async () => {
    await expect(
      validateWithinWorkspace("/Repo/src/app.ts", ctx(), async (path) => path, "default"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("rejects a Unix sibling whose filename contains a backslash", async () => {
    await expect(
      validateWithinWorkspace("/repo\\escape/file.ts", ctx(), async (path) => path, "default"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("rejects a sibling that only shares the root prefix", async () => {
    await expect(
      validateWithinWorkspace("/repository/file.ts", ctx(), async (path) => path, "default"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("keeps the boundary in the legacy full mode", async () => {
    await expect(
      validateWithinWorkspace("/tmp/notes.md", ctx(), canonicalize, "full"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("still enforces the boundary in acceptEdits mode", async () => {
    await expect(
      validateWithinWorkspace("/tmp/notes.md", ctx(), canonicalize, "acceptEdits"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("allows a macOS-style case variant only when native canonicalization resolves it into root", async () => {
    const canonicalizeMacPath = async (path: string) => {
      if (path === "/Users/me/Repo") return "/Users/me/Repo";
      if (path === "/users/me/repo/src/app.ts") return "/Users/me/Repo/src/app.ts";
      throw new Error("missing");
    };

    await expect(
      validateWithinWorkspace(
        "/users/me/repo/src/app.ts",
        ctx({ workspaceRoot: "/Users/me/Repo" }),
        canonicalizeMacPath,
        "default",
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("allows Windows drive paths after native canonicalization", async () => {
    const canonicalizeWindowsPath = async (path: string) => {
      if (path === "C:\\Repo") return "C:/Repo";
      if (path === "c:\\repo\\src\\app.ts") return "C:/Repo/src/app.ts";
      throw new Error("missing");
    };

    await expect(
      validateWithinWorkspace(
        "c:\\repo\\src\\app.ts",
        ctx({ workspaceRoot: "C:\\Repo" }),
        canonicalizeWindowsPath,
        "default",
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("allows Windows UNC descendants after native canonicalization", async () => {
    const canonicalizeUncPath = async (path: string) => {
      if (path === "\\\\server\\share\\Repo") return "//server/share/Repo";
      if (path === "\\\\server\\share\\Repo\\src\\app.ts") {
        return "//server/share/Repo/src/app.ts";
      }
      throw new Error("missing");
    };

    await expect(
      validateWithinWorkspace(
        "\\\\server\\share\\Repo\\src\\app.ts",
        ctx({ workspaceRoot: "\\\\server\\share\\Repo" }),
        canonicalizeUncPath,
        "default",
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("allows missing Windows-style descendants when an ancestor canonicalizes", async () => {
    const canonicalizeWindowsAncestor = async (path: string) => {
      if (path === "C:\\Repo" || path === "C:/Repo") return "C:/Repo";
      throw new Error("missing");
    };

    await expect(
      validateWithinWorkspace(
        "C:\\Repo\\new\\deep\\file.ts",
        ctx({ workspaceRoot: "C:\\Repo" }),
        canonicalizeWindowsAncestor,
        "default",
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects traversal after native canonicalization", async () => {
    const canonicalizeTraversal = async (path: string) => {
      if (path === "/repo") return "/repo";
      if (path === "/repo/../tmp/notes.md") return "/tmp/notes.md";
      throw new Error("missing");
    };

    await expect(
      validateWithinWorkspace(
        "/repo/../tmp/notes.md",
        ctx(),
        canonicalizeTraversal,
        "default",
      ),
    ).resolves.toMatchObject({ ok: false });
  });
});
