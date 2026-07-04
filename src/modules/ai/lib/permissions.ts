// Approval policy. Pure functions: given the tool category, the command, and
// the session's approval mode, decide whether a tool call needs an approval
// PROMPT. This never decides whether a call is *allowed*: dangerous-command
// (checkShellCommand) and secret-path (checkReadable/checkWritable) guards
// live inside each tool's execute and the Rust layer, and are NEVER skipped by
// any mode. No product mode lifts the workspace or secret boundaries.

export type ApprovalMode = "default" | "acceptEdits" | "full" | "benchmark";

export const APPROVAL_MODES: {
  id: ApprovalMode;
  label: string;
  hint: string;
  risky?: boolean;
}[] = [
  {
    id: "default",
    label: "Ask",
    hint: "Approve every file edit and command before it runs.",
  },
  {
    id: "acceptEdits",
    label: "Accept edits",
    hint: "Auto-apply file edits in the workspace. Still ask before running commands.",
  },
  {
    id: "full",
    label: "Autonomous workspace",
    hint: "Auto-apply edits inside this workspace. Only the small read-only command allow-list runs without approval; all other commands still ask.",
  },
];

const NO_ARG_COMMANDS = new Set(["pwd", "date", "whoami"]);
const SAFE_GIT_STATUS_FLAGS = new Set([
  "-b",
  "-s",
  "--branch",
  "--ignored",
  "--porcelain",
  "--porcelain=v1",
  "--porcelain=v2",
  "--short",
  "--show-stash",
  "--untracked-files=all",
  "--untracked-files=no",
  "--untracked-files=normal",
]);

function isFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

function isSimpleRelativeOpenTarget(token: string): boolean {
  if (!/^[a-zA-Z0-9._/-]+$/.test(token)) return false;
  if (token.startsWith("/") || token.startsWith("~")) return false;
  const parts = token.split("/");
  return parts.every((part) => part !== ".." && part.length > 0);
}

/**
 * True only for a single safe command with no shell operators. Any of
 * `; & | < > \` $(` (or a newline) means the command can compound into
 * something unreviewed, so it falls back to mode-based approval.
 */
export function isAutoRunShell(command: string): boolean {
  const c = command.trim();
  if (!c) return false;
  if (/[;&|<>`\n\r]/.test(c) || c.includes("$(")) return false;
  const tokens = c.split(/\s+/);
  const [name, ...args] = tokens;
  if (NO_ARG_COMMANDS.has(name)) return args.length === 0;
  if (name === "ls") return args.every(isFlag);
  if (name === "git") {
    return (
      args[0] === "status" &&
      args.slice(1).every((arg) => SAFE_GIT_STATUS_FLAGS.has(arg))
    );
  }
  return (
    name === "open" &&
    args.length === 1 &&
    isSimpleRelativeOpenTarget(args[0])
  );
}

/** Edits/writes: only the default mode prompts. Native boundaries always apply. */
export function editNeedsApproval(mode: ApprovalMode): boolean {
  return mode === "default";
}

/**
 * Shell: safe read-only/open commands auto-run in any mode. Product modes ask
 * for everything else; the internal benchmark harness is non-interactive.
 */
export function shellNeedsApproval(command: string, mode: ApprovalMode): boolean {
  if (isAutoRunShell(command)) return false;
  return mode !== "benchmark";
}
