// Approval policy. Pure functions: given the tool category, the command, and
// the session's approval mode, decide whether a tool call needs an approval
// PROMPT. This never decides whether a call is *allowed* — deny decisions
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

// A single safe read-only or open command with no shell compounding. These
// auto-run in every mode (matches Claude Code's read-only bash allow-list).
const READONLY_COMMANDS = new Set([
  "ls", "cat", "pwd", "head", "tail", "grep", "rg", "find", "diff", "stat",
  "echo", "which", "open", "wc", "file", "du", "tree", "date", "whoami",
  "printenv", "env",
]);
const READONLY_GIT = new Set([
  "status", "log", "diff", "show", "branch", "remote", "describe", "rev-parse",
]);

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
  if (tokens[0] === "git") return READONLY_GIT.has(tokens[1] ?? "");
  return READONLY_COMMANDS.has(tokens[0]);
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
