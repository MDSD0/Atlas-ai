export type ToolContext = {
  /** Active terminal tab cwd. Informational only for file path resolution. */
  getCwd: () => string | null;
  /** Workspace root (explorer root). Used by tools that operate over the project. */
  getWorkspaceRoot: () => string | null;
  /** Full Atlas project/session context used by tools. */
  getProjectContext: () => AtlasToolProjectContext;
  /** Last N lines of the active terminal buffer (or null if not a terminal tab). */
  getTerminalContext: () => string | null;
  isActiveTerminalPrivate: () => boolean;
  /**
   * Type a string into the active terminal at the prompt — without executing.
   * Returns false if there is no active terminal tab to inject into.
   */
  injectIntoActivePty: (text: string) => boolean;
  /** Open a new preview tab (in-app iframe) at the given URL. */
  openPreview: (url: string) => boolean;
  /** Spawn a Claude Code agent in a new terminal tab, bound to this session. */
  spawnAgent: (prompt: string) => { tabId: number; leafId: number } | null;
  /** Read the terminal scrollback tail of a managed agent's leaf. */
  readAgentOutput: (leafId: number) => string | null;
  readCache: Map<string, { size: number; hash: number }>;
  /** Active chat session id — used by tools that persist per-session state (todos). */
  getSessionId: () => string | null;
};

export type ExecutionCwdMode = "workspace" | "activeFolder" | "activeTerminal";

export type AtlasToolProjectContext = {
  projectId: string | null;
  workspaceRoot: string | null;
  projectName: string;
  activeFolder: string | null;
  activeFile: string | null;
  activeSelection: string | null;
  activeTerminalId: number | null;
  activeTerminalCwd: string | null;
  executionCwd: string | null;
  executionCwdMode: ExecutionCwdMode;
};

export const PATH_POLICY =
  "bare paths resolve against active_file parent, then active_folder, then workspace_root; never active_terminal_cwd unless explicitly selected";

function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    /^[a-zA-Z]:[\\/]/.test(path)
  );
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function dirname(path: string): string | null {
  const normalized = normalize(path);
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized.startsWith("/") ? "/" : null;
  return normalized.slice(0, idx);
}

function joinPath(base: string, rel: string): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base.endsWith("/") || base.endsWith("\\")
    ? `${base}${rel}`
    : `${base}${sep}${rel}`;
}

function defaultBase(ctx: AtlasToolProjectContext): string | null {
  if (ctx.activeFile) {
    const parent = dirname(ctx.activeFile);
    if (parent) return parent;
  }
  return ctx.activeFolder ?? ctx.workspaceRoot;
}

export function resolvePath(
  rawPath: string,
  ctx: AtlasToolProjectContext,
): string {
  const path = rawPath.trim();
  if (!path) throw new Error("cannot resolve empty path");
  if (isAbsolutePath(path)) return path;
  const base = defaultBase(ctx);
  if (!base) {
    throw new Error(
      `cannot resolve relative path "${rawPath}": no project, active folder, or active file is bound.`,
    );
  }
  return joinPath(base, path);
}

export function resolveSearchRoot(
  rawRoot: string | undefined,
  ctx: AtlasToolProjectContext,
): string {
  if (rawRoot && rawRoot.trim().length > 0) return resolvePath(rawRoot, ctx);
  if (ctx.workspaceRoot) return ctx.workspaceRoot;
  if (ctx.activeFolder) return ctx.activeFolder;
  throw new Error("no workspace root or active folder; pass `root` explicitly.");
}

function isWithinPath(candidate: string, root: string): boolean {
  const c = normalize(candidate).toLowerCase();
  const r = normalize(root).toLowerCase();
  return c === r || c.startsWith(`${r}/`);
}

async function canonicalForBoundary(
  path: string,
  canonicalize: (p: string) => Promise<string>,
): Promise<string> {
  try {
    return await canonicalize(path);
  } catch {
    let parent = dirname(path);
    while (parent && parent !== path) {
      try {
        const canonParent = await canonicalize(parent);
        const tail = normalize(path).slice(normalize(parent).length);
        return `${normalize(canonParent)}${tail}`;
      } catch {
        const next = dirname(parent);
        if (!next || next === parent) break;
        parent = next;
      }
    }
    return path;
  }
}

export async function validateWithinWorkspace(
  path: string,
  ctx: AtlasToolProjectContext,
  canonicalize: (p: string) => Promise<string>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!ctx.workspaceRoot) return { ok: true };
  let root: string;
  let candidate: string;
  try {
    root = await canonicalize(ctx.workspaceRoot);
    candidate = await canonicalForBoundary(path, canonicalize);
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
  if (isWithinPath(candidate, root)) return { ok: true };
  return {
    ok: false,
    reason: `Refused: path is outside workspace root (${ctx.workspaceRoot}).`,
  };
}

export function atlasContextBlock(ctx: AtlasToolProjectContext): string {
  return [
    "<atlas_context>",
    `project_id: ${ctx.projectId ?? "none"}`,
    `workspace_root: ${ctx.workspaceRoot ?? "none"}`,
    `active_folder: ${ctx.activeFolder ?? "none"}`,
    `active_file: ${ctx.activeFile ?? "none"}`,
    `execution_cwd: ${ctx.executionCwd ?? "none"}`,
    `active_terminal_cwd: ${ctx.activeTerminalCwd ?? "none"} # informational only`,
    `path_policy: ${PATH_POLICY}`,
    "</atlas_context>",
  ].join("\n");
}
