import type { ApprovalMode } from "../lib/permissions";
import type { ReadFingerprint } from "./fingerprint";

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
  readCache: Map<string, ReadFingerprint>;
  /** Active chat session id — used by tools that persist per-session state (todos). */
  getSessionId: () => string | null;
  /** Per-session approval mode, read at tool-call time so changes take effect immediately. */
  getApprovalMode: () => ApprovalMode;
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

function isWindowsStylePath(path: string): boolean {
  return path.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(path);
}

/**
 * Normalize only for walking a user-supplied path to an existing parent.
 * Native canonical paths already use forward slashes on Windows. On Unix a
 * backslash is a legal filename character, so rewriting it would turn a
 * sibling such as `/repo\escape` into a false child of `/repo`.
 */
function normalizeForPathOps(path: string): string {
  const normalized = isWindowsStylePath(path)
    ? path.replace(/\\/g, "/")
    : path;
  if (normalized === "/" || /^[a-zA-Z]:\/$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

function normalizeCanonical(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
}

function dirname(path: string): string | null {
  const normalized = normalizeForPathOps(path);
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return null;
  if (idx === 0) return "/";
  if (idx === 2 && /^[a-zA-Z]:\//.test(normalized)) {
    return normalized.slice(0, 3);
  }
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

export const UNBOUND_MUTATION_ERROR =
  "no project is bound; refusing workspace mutation";

/**
 * Fail-closed guard for mutating tools. Unbound sessions (no workspaceRoot)
 * allow chat and reads but must never create, write, edit, or delete files.
 * Returns a structured error to return verbatim, or null when a project is bound.
 */
export function checkMutationAllowed(
  ctx: AtlasToolProjectContext,
): { error: string } | null {
  if (!ctx.workspaceRoot) return { error: UNBOUND_MUTATION_ERROR };
  return null;
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
  const c = normalizeCanonical(candidate);
  const r = normalizeCanonical(root);
  return c === r || (r === "/" ? c.startsWith("/") : c.startsWith(`${r}/`));
}

function appendCanonicalTail(base: string, tail: string): string {
  const normalizedBase = normalizeCanonical(base);
  const normalizedTail = tail.replace(/^\/+/, "");
  if (!normalizedTail) return normalizedBase;
  return normalizedBase === "/"
    ? `/${normalizedTail}`
    : `${normalizedBase}/${normalizedTail}`;
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
        const normalizedPath = normalizeForPathOps(path);
        const normalizedParent = normalizeForPathOps(parent);
        const tail = normalizedPath.slice(normalizedParent.length);
        return appendCanonicalTail(canonParent, tail);
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
