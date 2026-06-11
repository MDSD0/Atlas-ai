import {
  Bot as ClaudeIcon,
  Bug as ReviewIcon,
  CheckCircle2 as TestIcon,
  FileText as ExplainIcon,
  ListChecks as CheckListIcon,
  Sparkles as SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { usePlanStore } from "../store/planStore";

/**
 * Outcome of intercepting a slash command from the composer.
 *
 * - `"handled"`: command ran; the composer should NOT send a chat message.
 * - `"send-prompt"`: replace the user's text with `prompt` and send normally.
 * - `"none"`: not a slash command; let the composer behave as usual.
 */
export type SlashOutcome =
  | { kind: "handled"; toast?: string }
  | { kind: "send-prompt"; prompt: string; commandName?: string }
  | { kind: "none" };

function claudeCodeDirective(request: string): string {
  return `The user wants to drive a Claude Code agent through you. Their request:

<request>
${request}
</request>

You are the orchestrator, not the implementer. Do not write the code yourself.
1. Call read_agent_output to see whether a Claude Code agent is already active in this session.
2. If none is active: turn the request into one clear, complete, self-contained prompt (state the concrete goal, relevant constraints, and what "done" looks like) and call spawn_coding_agent with it.
3. If one is active: read its latest output, then craft a precise follow-up and call send_to_agent.
Sharpen vague requests into precise engineering instructions; keep each agent prompt focused on one coherent unit of work.`;
}

const INIT_PROMPT = `Scan this workspace and produce ATLAS.md at the workspace root with:

- One-paragraph project description.
- Build / test / dev commands.
- Architecture overview (subsystems, data flow, key dirs).
- Conventions worth knowing (naming, patterns, gotchas).
- Paths to entry points.

Use grep/glob/list_directory/read_file to explore. Cap ATLAS.md under 200 lines. Use write_file to create it (will go through normal approval).`;

export type SlashCommandMeta = {
  name: string;
  invocation: string;
  label: string;
  icon: LucideIcon;
};

export const SLASH_COMMANDS: Record<string, SlashCommandMeta> = {
  init: {
    name: "init",
    invocation: "/init",
    label: "Initialize workspace",
    icon: SparklesIcon,
  },
  plan: {
    name: "plan",
    invocation: "/plan",
    label: "Plan mode",
    icon: CheckListIcon,
  },
  "claude-code": {
    name: "claude-code",
    invocation: "/claude-code",
    label: "Delegate to Claude Code",
    icon: ClaudeIcon,
  },
  review: {
    name: "review",
    invocation: "/review",
    label: "Review changes",
    icon: ReviewIcon,
  },
  test: {
    name: "test",
    invocation: "/test",
    label: "Run relevant checks",
    icon: TestIcon,
  },
  explain: {
    name: "explain",
    invocation: "/explain",
    label: "Explain context",
    icon: ExplainIcon,
  },
};

export const ATLAS_CMD_RE =
  /^<atlas-command\s+name="([a-z0-9-]+)"(?:\s+state="([a-z]+)")?\s*\/>(?:\n+|$)/;

export function wrapWithCommandMarker(prompt: string, name: string): string {
  return `<atlas-command name="${name}" />\n\n${prompt}`;
}

export function tryRunSlashCommand(
  input: string,
  sessionId?: string | null,
): SlashOutcome {
  const trimmed = input.trim();
  const lead = trimmed[0];
  if (lead !== "/" && lead !== "#") return { kind: "none" };
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  if (lead === "#" && !SLASH_COMMANDS[head]) return { kind: "none" };
  const tail = rest.join(" ").trim();

  switch (head) {
    case "plan": {
      const store = usePlanStore.getState();
      if (tail === "off" || tail === "exit") {
        store.disable(sessionId);
        return { kind: "handled", toast: "Plan mode off" };
      }
      if (tail) {
        // "/plan build X" must NOT swallow the task: enable plan mode and
        // send the task as the prompt.
        store.enable(sessionId);
        return { kind: "send-prompt", prompt: tail, commandName: "plan" };
      }
      store.toggle(sessionId);
      const nowActive = usePlanStore.getState().isActive(sessionId);
      return {
        kind: "handled",
        toast: nowActive ? "Plan mode on" : "Plan mode off",
      };
    }
    case "init": {
      return {
        kind: "send-prompt",
        prompt: INIT_PROMPT,
        commandName: "init",
      };
    }
    case "claude-code": {
      if (!tail) {
        return { kind: "handled", toast: "Usage: /claude-code <request>" };
      }
      return {
        kind: "send-prompt",
        prompt: claudeCodeDirective(tail),
        commandName: "claude-code",
      };
    }
    case "review": {
      return {
        kind: "send-prompt",
        prompt:
          tail ||
          "Review the current workspace changes. Prioritize bugs, regressions, missing tests, and UX issues. Use git diff and relevant reads before reporting findings.",
        commandName: "review",
      };
    }
    case "test": {
      return {
        kind: "send-prompt",
        prompt:
          tail ||
          "Run the narrowest relevant checks for the current workspace state, report the exact commands and exit codes, and fix only failures caused by the current task.",
        commandName: "test",
      };
    }
    case "explain": {
      return {
        kind: "send-prompt",
        prompt:
          tail ||
          "Explain the active file or selected context and how it fits into the project. Read only the files needed to ground the explanation.",
        commandName: "explain",
      };
    }
    default:
      return { kind: "none" };
  }
}
