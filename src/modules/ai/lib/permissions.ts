// Approval policy. Pure functions: given the tool category, the command, and
// the session's approval mode, decide whether a tool call needs an approval
// PROMPT. This never decides whether a call is *allowed*: deny decisions
// (dangerous shell via checkShellCommand, secret paths via checkWritable, and
// out-of-workspace via the native boundary) live inside each tool's execute and
// the Rust layer, and are NEVER skipped by any mode. A mode only suppresses the
// prompt for an otherwise-permitted call.

export type ApprovalMode = "default" | "acceptEdits" | "full";

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
    label: "Full access",
    hint: "Run edits and commands without asking. Dangerous-command and out-of-workspace guards still apply.",
    risky: true,
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

/** Edits/writes: only the default mode prompts; acceptEdits and full auto-apply. */
export function editNeedsApproval(mode: ApprovalMode): boolean {
  return mode === "default";
}

/**
 * Shell: safe read-only/open commands auto-run in any mode; otherwise only
 * full access skips the prompt. The execute-time circuit breaker still blocks
 * dangerous commands regardless of mode.
 */
export function shellNeedsApproval(command: string, mode: ApprovalMode): boolean {
  if (isAutoRunShell(command)) return false;
  return mode !== "full";
}
