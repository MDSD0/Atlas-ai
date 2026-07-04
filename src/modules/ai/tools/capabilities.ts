/**
 * Capability Gateway.
 *
 * Atlas copies Claude Code / Codex progressive disclosure: the model always
 * sees a tiny universal toolbelt, and everything else is hidden until the model
 * asks for it via `capability_search`. Searching a capability promotes its tool
 * schemas into the active set for the rest of the run. This keeps per-turn tool
 * schemas small (the "MCP/tools tax") while leaving the model in control — no
 * hard intent router. The full tool object is always built; the gateway only
 * narrows `activeTools` per step (see runAgentStream prepareStep).
 */
import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./context";

/** Tools the model can always call. Kept deliberately small. */
export const CORE_TOOL_NAMES: readonly string[] = [
  // read + search
  "read_file",
  "list_directory",
  "grep",
  "glob",
  // mutate
  "edit",
  "multi_edit",
  "write_file",
  "create_directory",
  // execute + observe
  "bash_run",
  "get_terminal_output",
  "serve_preview",
  "suggest_command",
  // cheap orientation + planning
  "repo_context",
  "todo_write",
  // the gateway itself
  "capability_search",
];

export type CapabilityDescriptor = {
  id: string;
  summary: string;
  keywords: readonly string[];
  toolNames: readonly string[];
};

/** Lazy capabilities. Promoted into the active toolbelt on `capability_search`. */
export const CAPABILITIES: readonly CapabilityDescriptor[] = [
  {
    id: "repo_intel",
    summary:
      "Ranked repo map and symbol intelligence: repo_map, find_symbol, find_references, impact_candidates.",
    keywords: [
      "repo", "map", "symbol", "symbols", "definition", "references",
      "callers", "impact", "architecture", "where", "find", "structure",
    ],
    toolNames: [
      "repo_map", "repo_status", "find_symbol", "find_references",
      "impact_candidates",
    ],
  },
  {
    id: "code_intel_lsp",
    summary:
      "Language-server code intelligence: diagnostics, go-to-definition, references, hover, document/workspace symbols.",
    keywords: [
      "lsp", "diagnostics", "type", "types", "definition", "references",
      "hover", "symbol", "language server", "errors", "compile",
    ],
    toolNames: [
      "lsp_status", "lsp_diagnostics", "lsp_definition", "lsp_references",
      "lsp_hover", "lsp_document_symbols", "lsp_workspace_symbols",
    ],
  },
  {
    id: "memory",
    summary:
      "Long-term memory: recall/remember project facts, search past sessions, SimpleMem semantic retrieval.",
    keywords: [
      "memory", "remember", "recall", "forget", "past", "history",
      "session", "sessions", "note", "fact", "facts", "simplemem", "context",
    ],
    toolNames: [
      "memory_recall", "memory_remember", "memory_list", "memory_delete",
      "memory_clear_project", "memory_status", "memory_lab",
      "memory_surface_status", "memory_surface_enable", "memory_surface_disable",
      "memory_surface_read_index", "memory_surface_search_sessions",
      "memory_surface_export_work_packet", "memory_simplemem_configure",
      "memory_simplemem_search", "memory_simplemem_stats", "memory_simplemem_probe",
    ],
  },
  {
    id: "mcp",
    summary:
      "Model Context Protocol connectors: list, configure, enable, and call external MCP tools.",
    keywords: [
      "mcp", "connector", "connectors", "external", "integration", "tool server",
    ],
    toolNames: [
      "mcp_status", "mcp_list", "mcp_connector_studies", "mcp_discover_tools",
      "mcp_configure", "mcp_configure_playwright",
      "mcp_enable", "mcp_disable", "mcp_remove", "mcp_call",
    ],
  },
  {
    id: "skills",
    summary: "Skill packages: list, inspect, install, enable/disable skills.",
    keywords: ["skill", "skills", "package", "install", "enable", "workflow"],
    toolNames: [
      "skill_list", "skill_inspect", "skill_install", "skill_enable",
      "skill_disable", "skill_remove",
    ],
  },
  {
    id: "subagents",
    summary:
      "Delegate isolated work to subagents/coding agents and read their output.",
    keywords: [
      "subagent", "agent", "delegate", "parallel", "explore", "spawn", "background agent",
    ],
    toolNames: [
      "run_subagent", "run_subagents", "spawn_coding_agent", "send_to_agent", "read_agent_output",
    ],
  },
  {
    id: "work_packets",
    summary:
      "Resumable work packets: generate, list, inspect, resume, delete long-task state.",
    keywords: [
      "work packet", "packet", "resume", "checkpoint", "long task", "plan state",
    ],
    toolNames: [
      "work_packet_generate", "work_packet_list", "work_packet_inspect",
      "work_packet_resume", "work_packet_delete",
    ],
  },
  {
    id: "worktrees",
    summary:
      "Git worktree isolation: list, create, remove, and merge Atlas-managed worktrees.",
    keywords: [
      "worktree", "worktrees", "branch", "isolate", "isolated", "parallel", "merge",
    ],
    toolNames: [
      "worktree_list", "worktree_create", "worktree_run", "worktree_inspect", "worktree_stage",
      "worktree_unstage", "worktree_commit", "worktree_remove", "worktree_merge",
    ],
  },
  {
    id: "verification",
    summary: "Build a verification plan (tests/checks) for the current change.",
    keywords: ["verify", "verification", "test", "tests", "check", "validate", "gate"],
    toolNames: ["verification_plan"],
  },
  {
    id: "background_jobs",
    summary:
      "Long-running background processes: start, tail logs, list, and kill jobs.",
    keywords: [
      "background", "server", "watch", "daemon", "long running", "logs", "job", "kill", "process",
    ],
    toolNames: ["bash_background", "bash_logs", "bash_list", "bash_kill", "open_preview"],
  },
  {
    id: "metrics",
    summary: "Run metrics and context inspector for cost/usage introspection.",
    keywords: ["metrics", "usage", "cost", "tokens", "inspect context", "telemetry"],
    toolNames: ["metrics_status", "metrics_export", "context_inspector"],
  },
];

const CAPABILITY_BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

/** Rank capabilities by keyword overlap with a free-text query. */
export function searchCapabilities(query: string): CapabilityDescriptor[] {
  const words = query.toLowerCase().match(/[a-z_]+/g) ?? [];
  if (words.length === 0) return [];
  const scored = CAPABILITIES.map((cap) => {
    let score = 0;
    for (const kw of cap.keywords) {
      for (const w of words) {
        if (kw === w) score += 2;
        else if (kw.includes(w) || w.includes(kw)) score += 1;
      }
    }
    return { cap, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.cap);
}

export function capabilityToolNames(ids: Iterable<string>): string[] {
  const names: string[] = [];
  for (const id of ids) {
    const cap = CAPABILITY_BY_ID.get(id);
    if (cap) names.push(...cap.toolNames);
  }
  return names;
}

// ---- Per-run promotion state -------------------------------------------------
// Which lazy capabilities the model has unlocked this run, keyed by sessionId.

const promotedBySession = new Map<string, Set<string>>();

export function promoteCapabilities(sessionId: string, ids: Iterable<string>): void {
  let set = promotedBySession.get(sessionId);
  if (!set) {
    set = new Set();
    promotedBySession.set(sessionId, set);
  }
  for (const id of ids) {
    if (CAPABILITY_BY_ID.has(id)) set.add(id);
  }
}

export function getPromotedCapabilities(sessionId: string): string[] {
  return [...(promotedBySession.get(sessionId) ?? [])];
}

/** Active tool names for a run = core + promoted capability tools, minus
 * blocked families, further narrowed to `skillToolRestriction` when a
 * currently-enabled skill declares one (see `skills/index.ts`'s
 * `getEnabledSkillToolRestriction`). The restriction can only narrow what the
 * gateway already exposes — including `capability_search` itself, so a skill
 * can't be routed around mid-run by unlocking more capabilities. */
export function activeToolNames(
  sessionId: string,
  blockedCapabilityIds: Iterable<string> = [],
  skillToolRestriction?: readonly string[] | null,
): string[] {
  const blocked = new Set(capabilityToolNames(blockedCapabilityIds));
  const names = [
    ...CORE_TOOL_NAMES,
    ...capabilityToolNames(getPromotedCapabilities(sessionId)),
  ].filter((name) => !blocked.has(name));
  if (!skillToolRestriction || skillToolRestriction.length === 0) return names;
  const allowed = new Set(skillToolRestriction);
  return names.filter((name) => allowed.has(name));
}

export function clearPromotedCapabilities(sessionId: string): void {
  promotedBySession.delete(sessionId);
}

// ---- The gateway tool --------------------------------------------------------

const CAPABILITY_CATALOG = CAPABILITIES.map((c) => `- ${c.id}: ${c.summary}`).join(
  "\n",
);

export function buildCapabilityTools(ctx: ToolContext) {
  return {
    capability_search: tool({
      description:
        "Unlock additional tools you don't have yet. Your default toolbelt is intentionally small (read/search/edit/run/preview). When a task needs more — language-server diagnostics, repo-wide symbol search, long-term memory, MCP connectors, skills, subagents, background servers, verification — call this with a short description of what you need. It returns matching capabilities and immediately makes their tools available for the rest of the run. Auto-executes (no approval).\n\nAvailable capabilities:\n" +
        CAPABILITY_CATALOG,
      inputSchema: z.object({
        query: z
          .string()
          .describe("What you need to do, e.g. 'find all callers of this function' or 'run a dev server'."),
      }),
      execute: async ({ query }) => {
        const sessionId = ctx.getSessionId() ?? "unknown";
        const matches = searchCapabilities(query);
        if (matches.length === 0) {
          return {
            unlocked: [],
            note: "No capability matched. Available: " +
              CAPABILITIES.map((c) => c.id).join(", "),
          };
        }
        promoteCapabilities(sessionId, matches.map((m) => m.id));
        return {
          unlocked: matches.map((m) => ({
            id: m.id,
            summary: m.summary,
            tools: m.toolNames,
          })),
          note: "These tools are now available. Call them directly.",
        };
      },
    }),
  } as const;
}
