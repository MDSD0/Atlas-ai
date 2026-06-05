import { buildManagedAgentTools } from "./agent";
import { buildEditTools } from "./edit";
import { buildFsTools } from "./fs";
import { buildMemoryTools } from "./memory";
import { buildMetricsTools } from "./metrics";
import { buildMcpTools } from "./mcp";
import { buildRealityTools } from "./reality";
import { buildSearchTools } from "./search";
import { buildSemanticTools } from "./semantic";
import { buildShellTools } from "./shell";
import { buildSkillTools } from "./skills";
import { buildSubagentTools } from "./subagent";
import { buildTerminalTools } from "./terminal";
import { buildTodoTools } from "./todo";
import { buildVerificationTools } from "./verification";
import { buildWorkPacketTools } from "./workPackets";

export {
  atlasContextBlock,
  resolvePath,
  type AtlasToolProjectContext,
  type ExecutionCwdMode,
  type ToolContext,
} from "./context";

/**
 * AI tool definitions.
 *
 * Approval policy:
 *  - Read-only tools (`read_file`, `list_directory`, `grep`, `glob`)
 *    auto-execute, but go through the security guard which refuses obvious
 *    secret paths (.env*, .ssh/, credentials, etc.).
 *  - Mutating tools (`write_file`, `edit`, `multi_edit`, `create_directory`,
 *    `run_command`) require explicit user approval — the AI SDK pauses on
 *    tool-call and surfaces a `tool-approval-request` part that the UI
 *    renders as a confirmation card.
 *  - `edit` / `multi_edit` additionally enforce a read-before-edit invariant
 *    (the model must have called read_file on the path earlier in the
 *    session).
 *
 * The model sees paths through Atlas project context. Bare paths resolve
 * against active file parent, then active folder, then workspace root. Active
 * terminal cwd is informational unless the execution mode explicitly selects it.
 */
/**
 * Ablation modes for benchmarking which capability layers earn their keep.
 * `full` (the default) is the normal product behavior — every tool. The
 * narrower modes restrict the agent's toolbelt so a benchmark can compare
 * plain vs +repo-map vs +LSP on the same task (GPT review: prove the substrate).
 *   - simple:       fs + edit + search + shell + verification (small static flows)
 *   - plain:        simple + todo (mini-swe baseline)
 *   - repo_map:     plain + reality (repo_context/repo_map/find_symbol/…)
 *   - repo_map_lsp: repo_map + semantic LSP tools
 *   - full:         everything (memory, mcp, skills, subagents, work packets, …)
 */
export type AblationMode =
  | "simple"
  | "plain"
  | "repo_map"
  | "repo_map_lsp"
  | "full";


// Full product toolbelt. This is the source of truth for ChatTools; the
// ablation-narrowed modes return a subset cast to the same type.
function buildFullTools(ctx: import("./context").ToolContext) {
  const base = {
    ...buildFsTools(ctx),
    ...buildEditTools(ctx),
    ...buildMemoryTools(ctx),
    ...buildMetricsTools(ctx),
    ...buildMcpTools(),
    ...buildSearchTools(ctx),
    ...buildRealityTools(ctx),
    ...buildSemanticTools(ctx),
    ...buildVerificationTools(),
    ...buildWorkPacketTools(ctx),
    ...buildShellTools(ctx),
    ...buildSubagentTools(ctx),
    ...buildTerminalTools(ctx),
    ...buildTodoTools(ctx),
    ...buildManagedAgentTools(ctx),
  } as const;
  return {
    ...base,
    ...buildSkillTools(() => Object.keys(base)),
  } as const;
}

export type ChatTools = ReturnType<typeof buildFullTools>;

export function buildTools(
  ctx: import("./context").ToolContext,
  mode: AblationMode = "full",
): ChatTools {
  if (mode === "full") return buildFullTools(ctx);

  // Narrowed benchmark toolbelts: the irreducible coding loop, plus optional
  // repo-map / LSP layers depending on the ablation mode.
  let tools: Record<string, unknown> = {
    ...buildFsTools(ctx),
    ...buildEditTools(ctx),
    ...buildSearchTools(ctx),
    ...buildShellTools(ctx),
    ...buildVerificationTools(),
  };
  if (mode === "plain" || mode === "repo_map" || mode === "repo_map_lsp") {
    tools = { ...tools, ...buildTodoTools(ctx) };
  }
  if (mode === "repo_map" || mode === "repo_map_lsp") {
    tools = { ...tools, ...buildRealityTools(ctx) };
  }
  if (mode === "repo_map_lsp") {
    tools = { ...tools, ...buildSemanticTools(ctx) };
  }
  return tools as unknown as ChatTools;
}
