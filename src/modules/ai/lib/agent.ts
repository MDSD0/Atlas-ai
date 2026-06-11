import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  getModel,
  getModelContextLimit,
  LMSTUDIO_DEFAULT_BASE_URL,
  MLX_DEFAULT_BASE_URL,
  modelKeepsReasoning,
  modelOutputTokenBudget,
  modelStepBudget,
  OLLAMA_DEFAULT_BASE_URL,
  providerNeedsKey,
  selectSystemPrompt,
  type ModelId,
  type ProviderId,
} from "../config";
import {
  buildPackedContextSnapshot,
  type PackedContextSnapshot,
  type PackedContextSource,
} from "../contextLedger";
import { buildTools, type AblationMode, type ToolContext } from "../tools/tools";
import {
  activeToolNames,
  clearPromotedCapabilities,
  promoteCapabilities,
} from "../tools/capabilities";
import { wrapToolsWithLifecycle } from "../tools/lifecycle";
import type { AtlasLifecycleEvent } from "../skills";
import { compactModelMessagesDetailed } from "./compact";
import { unwrapDoubleEncodedInput } from "./repairToolInput";
import type { ProviderKeys } from "./keyring";
import { createProxyFetch } from "./proxyFetch";

const localProxyFetch = createProxyFetch({ allowPrivateNetwork: true });
// Cloud providers must also route through the Rust HTTP proxy: a raw webview
// fetch to api.anthropic.com / api.openai.com / etc. is blocked by CORS
// ("Failed to fetch"). Public networks only — no localhost.
const cloudProxyFetch = createProxyFetch({ allowPrivateNetwork: false });

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> =
  {
    read_file: (i) => `Reading ${shortPath(i.path)}`,
    list_directory: (i) => `Listing ${shortPath(i.path)}`,
    grep: (i) => `Grepping ${ellipsize(String(i.pattern ?? ""), 40)}`,
    glob: (i) => `Globbing ${ellipsize(String(i.pattern ?? ""), 40)}`,
    repo_context: (i) =>
      `Mapping ${ellipsize(String(i.task ?? "repository"), 40)}`,
    repo_status: () => "Reading repository status",
    repo_map: (i) => `Mapping ${ellipsize(String(i.task ?? "repository"), 40)}`,
    find_symbol: (i) => `Finding ${ellipsize(String(i.symbol ?? ""), 40)}`,
    find_references: (i) =>
      `Tracing ${ellipsize(String(i.symbol ?? ""), 40)}`,
    impact_candidates: (i) =>
      `Scoping ${ellipsize(String(i.symbol ?? ""), 40)}`,
    lsp_status: () => "Checking semantic provider",
    lsp_diagnostics: (i) => `Diagnosing ${shortPath(i.path)}`,
    lsp_definition: (i) => `Finding definition in ${shortPath(i.path)}`,
    lsp_references: (i) => `Finding references in ${shortPath(i.path)}`,
    lsp_hover: (i) => `Reading hover in ${shortPath(i.path)}`,
    lsp_document_symbols: (i) => `Reading symbols in ${shortPath(i.path)}`,
    lsp_workspace_symbols: (i) =>
      `Searching symbols ${ellipsize(String(i.query ?? ""), 40)}`,
    verification_plan: () => "Planning verification",
    memory_status: () => "Checking project memory",
    memory_recall: (i) =>
      `Recalling ${ellipsize(String(i.query ?? "project memory"), 40)}`,
    memory_remember: () => "Saving project memory",
    memory_list: () => "Listing project memory",
    memory_delete: () => "Deleting project memory",
    memory_clear_project: () => "Clearing project memory",
    memory_simplemem_configure: () => "Configuring SimpleMem",
    memory_simplemem_search: (i) =>
      `Searching SimpleMem ${ellipsize(String(i.query ?? ""), 40)}`,
    memory_simplemem_stats: () => "Reading SimpleMem stats",
    memory_simplemem_probe: () => "Probing SimpleMem lifecycle",
    memory_lab: () => "Inspecting MemoryLab",
    memory_surface_status: () => "Checking memory filesystem",
    memory_surface_enable: () => "Enabling memory filesystem",
    memory_surface_disable: () => "Disabling memory filesystem",
    memory_surface_read_index: () => "Reading memory index",
    memory_surface_search_sessions: (i) =>
      `Searching session summaries ${ellipsize(String(i.query ?? ""), 40)}`,
    memory_surface_export_work_packet: () => "Exporting work packet",
    work_packet_generate: () => "Generating work packet",
    work_packet_list: () => "Listing work packets",
    work_packet_inspect: () => "Inspecting work packet",
    work_packet_resume: () => "Loading work packet",
    work_packet_delete: () => "Deleting work packet",
    metrics_status: () => "Checking local metrics",
    metrics_export: () => "Exporting local metrics",
    context_inspector: () => "Inspecting Atlas context",
    mcp_status: () => "Checking MCP boundary",
    mcp_list: () => "Listing MCP servers",
    mcp_connector_studies: () => "Inspecting MCP connector studies",
    mcp_configure: () => "Configuring MCP server",
    mcp_enable: () => "Enabling MCP server",
    mcp_disable: () => "Disabling MCP server",
    mcp_remove: () => "Removing MCP server",
    mcp_call: (i) => `Calling MCP ${ellipsize(String(i.tool_name ?? ""), 40)}`,
    skill_list: () => "Listing local skills",
    skill_inspect: () => "Inspecting local skill",
    skill_install: () => "Installing local skill",
    skill_enable: () => "Enabling local skill",
    skill_disable: () => "Disabling local skill",
    skill_remove: () => "Removing local skill",
    edit: (i) => `Editing ${shortPath(i.path)}`,
    multi_edit: (i) => `Editing ${shortPath(i.path)}`,
    write_file: (i) => `Writing ${shortPath(i.path)}`,
    create_directory: (i) => `Creating ${shortPath(i.path)}`,
    bash_run: (i) => `Running ${ellipsize(String(i.command ?? ""), 60)}`,
    serve_preview: (i) =>
      `Serving ${ellipsize(String(i.command ?? ""), 60)}`,
    bash_background: (i) =>
      `Spawning ${ellipsize(String(i.command ?? ""), 60)}`,
    bash_logs: () => `Reading logs`,
    bash_list: () => `Listing background processes`,
    bash_kill: () => `Stopping background process`,
    suggest_command: (i) =>
      `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
    todo_write: (i) =>
      `Updating plan (${Array.isArray(i.todos) ? i.todos.length : 0} items)`,
    run_subagent: (i) => `Spawning ${String(i.type ?? "subagent")} subagent`,
  };

function shortPath(p: unknown): string {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type BuildModelOptions = {
  modelIdOverride?: string;
  lmstudioBaseURL?: string;
  mlxBaseURL?: string;
  ollamaBaseURL?: string;
  openaiCompatibleBaseURL?: string;
};

const modelCache = new Map<string, LanguageModel>();

export async function buildLanguageModel(
  provider: ProviderId,
  keys: ProviderKeys,
  resolvedModelId: string,
  options: BuildModelOptions = {},
): Promise<LanguageModel> {
  if (providerNeedsKey(provider) && !keys[provider]) {
    throw new Error(
      `No API key configured for ${provider}. Open Settings → AI to add one.`,
    );
  }
  const key = keys[provider] ?? "";
  const lmstudioURL = options.lmstudioBaseURL ?? LMSTUDIO_DEFAULT_BASE_URL;
  const mlxURL = options.mlxBaseURL ?? MLX_DEFAULT_BASE_URL;
  const ollamaURL = options.ollamaBaseURL ?? OLLAMA_DEFAULT_BASE_URL;
  const compatURL = options.openaiCompatibleBaseURL ?? "";
  const cacheKey = `${provider} ${key} ${resolvedModelId} ${lmstudioURL} ${mlxURL} ${ollamaURL} ${compatURL}`;
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  let built: LanguageModel;
  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      built = createOpenAI({ apiKey: key, fetch: cloudProxyFetch })(resolvedModelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      // Pin the API base explicitly: @ai-sdk/anthropic@3.0.71's default resolves
      // to a path that 404s, so every Anthropic model fails without this.
      built = createAnthropic({
        apiKey: key,
        baseURL: "https://api.anthropic.com/v1",
        fetch: cloudProxyFetch,
      })(resolvedModelId);
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      built = createGoogleGenerativeAI({ apiKey: key, fetch: cloudProxyFetch })(
        resolvedModelId,
      );
      break;
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      built = createXai({ apiKey: key, fetch: cloudProxyFetch })(resolvedModelId);
      break;
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      built = createCerebras({ apiKey: key, fetch: cloudProxyFetch })(resolvedModelId);
      break;
    }
    case "deepseek": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "deepseek",
        baseURL: "https://api.deepseek.com",
        apiKey: key,
        fetch: cloudProxyFetch,
      })(resolvedModelId);
      break;
    }
    case "mistral": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "mistral",
        baseURL: "https://api.mistral.ai/v1",
        apiKey: key,
        fetch: cloudProxyFetch,
      })(resolvedModelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      built = createGroq({ apiKey: key, fetch: cloudProxyFetch })(resolvedModelId);
      break;
    }
    case "openrouter": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: key,
        fetch: cloudProxyFetch,
        headers: {
          "HTTP-Referer": "https://atlas.ai",
          "X-Title": "Atlas",
        },
      })(resolvedModelId);
      break;
    }
    case "openai-compatible": {
      if (!compatURL) {
        throw new Error(
          "OpenAI-compatible provider has no base URL. Set it in Settings → Models.",
        );
      }
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "openai-compatible",
        baseURL: compatURL,
        apiKey: key || undefined,
        fetch: localProxyFetch,
      })(resolvedModelId);
      break;
    }
    case "lmstudio": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "lmstudio",
        baseURL: lmstudioURL,
        fetch: localProxyFetch,
      })(resolvedModelId);
      break;
    }
    case "mlx": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "mlx",
        baseURL: mlxURL,
        fetch: localProxyFetch,
      })(resolvedModelId);
      break;
    }
    case "ollama": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "ollama",
        baseURL: ollamaURL,
        fetch: localProxyFetch,
      })(resolvedModelId);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive as ProviderId}`);
    }
  }
  modelCache.set(cacheKey, built);
  return built;
}

export type LocalProviderConfig = {
  lmstudioBaseURL?: string;
  lmstudioModelId?: string;
  mlxBaseURL?: string;
  mlxModelId?: string;
  ollamaBaseURL?: string;
  ollamaModelId?: string;
  openaiCompatibleBaseURL?: string;
  openaiCompatibleModelId?: string;
  openrouterModelId?: string;
};

export function buildConfiguredLanguageModel(
  modelId: ModelId,
  keys: ProviderKeys,
  local: LocalProviderConfig = {},
): Promise<LanguageModel> {
  const m = getModel(modelId);
  let resolvedId: string = m.id;
  if (m.id === "lmstudio-local") {
    if (!local.lmstudioModelId?.trim()) {
      throw new Error(
        "LM Studio: no model id set. Open Settings → Models and enter the model id loaded in LM Studio.",
      );
    }
    resolvedId = local.lmstudioModelId.trim();
  } else if (m.id === "mlx-local") {
    if (!local.mlxModelId?.trim()) {
      throw new Error(
        "MLX: no model id set. Open Settings → Models and enter the model id served by mlx_lm.server.",
      );
    }
    resolvedId = local.mlxModelId.trim();
  } else if (m.id === "ollama-local") {
    if (!local.ollamaModelId?.trim()) {
      throw new Error(
        "Ollama: no model id set. Open Settings → Models and enter the model id (e.g. the name from `ollama list`).",
      );
    }
    resolvedId = local.ollamaModelId.trim();
  } else if (m.id === "openai-compatible-custom") {
    if (!local.openaiCompatibleModelId?.trim()) {
      throw new Error(
        "OpenAI-compatible: no model id set. Open Settings → Models.",
      );
    }
    resolvedId = local.openaiCompatibleModelId.trim();
  } else if (m.id === "openrouter-custom") {
    if (!local.openrouterModelId?.trim()) {
      throw new Error(
        "OpenRouter: no model id set. Open Settings → Models and enter an OpenRouter model id (e.g. anthropic/claude-sonnet-4-6).",
      );
    }
    resolvedId = local.openrouterModelId.trim();
  }
  return buildLanguageModel(m.provider, keys, resolvedId, {
    lmstudioBaseURL: local.lmstudioBaseURL,
    mlxBaseURL: local.mlxBaseURL,
    ollamaBaseURL: local.ollamaBaseURL,
    openaiCompatibleBaseURL: local.openaiCompatibleBaseURL,
  });
}

/**
 * Make persisted history safe to replay to a provider. Two failure modes seen
 * with weaker models and aborted runs:
 *   1. A run stopped mid-tool-call leaves a tool part in a non-terminal state
 *      (`input-streaming`/`input-available`) with no result. Converted, that
 *      becomes an orphaned `tool_use` with no `tool_result`, which Anthropic
 *      rejects ("messages.N.content.0.tool_use.input: Input should be an object").
 *   2. A model can emit malformed JSON tool arguments, leaving a tool part whose
 *      `input` is not a plain object — also rejected.
 * Drop incomplete tool parts; coerce non-object inputs to `{}`.
 */
export function sanitizeToolParts(messages: UIMessage[]): UIMessage[] {
  const replayableToolStates = new Set([
    "approval-responded",
    "output-available",
    "output-denied",
    "output-error",
  ]);
  let changed = false;
  const out = messages.map((message) => {
    const parts = message.parts as
      | Array<{ type?: string; state?: string; input?: unknown }>
      | undefined;
    if (!Array.isArray(parts)) return message;
    let local = false;
    const next: typeof parts = [];
    for (const part of parts) {
      const type = part.type ?? "";
      const isTool = type.startsWith("tool-") || type === "dynamic-tool";
      if (!isTool) {
        next.push(part);
        continue;
      }
      if (!replayableToolStates.has(part.state ?? "")) {
        local = true; // incomplete/aborted tool call — would orphan a tool_use
        continue;
      }
      if (typeof part.input !== "object" || part.input === null) {
        local = true;
        next.push({ ...part, input: {} });
        continue;
      }
      next.push(part);
    }
    if (!local) return message;
    changed = true;
    return { ...message, parts: next } as UIMessage;
  });
  return changed ? out : messages;
}

const PLAN_MODE_PROMPT = `## PLAN MODE - ACTIVE
This is a review loop: the user wants to see and shape the plan before anything lands.
1. Investigate with reads only (repo_context, read_file, grep, glob, list_directory).
2. Do not call write_file, edit, multi_edit, create_directory, bash_run, bash_background, or serve_preview while drafting the plan.
3. Post a short numbered plan: what you will change, per file, one line each; include checks to run and risks/unknowns.
4. Stop after the plan. Atlas will show an editable plan review dock with Proceed/Revise controls.
If the user proceeds, execute the approved plan normally. If they comment or revise, re-read only affected files and post the updated plan.`;

/**
 * Prompt-layer split. Two layers with different lifetimes:
 *   - stableText: base system prompt + session-stable persona/custom instructions.
 *     This is the prefix-cache target — it must stay byte-identical across turns.
 *   - volatileText: project/memory/work-packet/skill context, each under an
 *     honest heading. Sent as a separate system message *after* the cache
 *     breakpoint, so changes here never invalidate the cached stable prefix.
 *
 * Previously everything was concatenated into messages[0] under a single
 * `## PROJECT — ATLAS.md` label, which both mislabeled heterogeneous sources and
 * poisoned the cache (any memory change busted the whole system prefix).
 */
export function buildStableSystem(
  modelId: ModelId,
  persona: { name: string; instructions: string } | null,
  customInstructions: string | undefined,
  projectMemory: string | null,
  projectSources: readonly PackedContextSource[] = [],
): { stableText: string; volatileText: string | null; sources: PackedContextSource[] } {
  const base = selectSystemPrompt(getModel(modelId).id);
  const personaBlock = persona?.instructions.trim()
    ? `\n\n## ACTIVE AGENT — ${persona.name}\n${persona.instructions.trim()}`
    : "";
  const customBlock = customInstructions?.trim()
    ? `\n\n## USER CUSTOM INSTRUCTIONS — follow unless they conflict with safety rules above\n${customInstructions.trim()}`
    : "";

  // Volatile layer: render each project source under its own honest heading.
  const loadedProjectSources = projectSources.filter((source) =>
    source.content?.trim(),
  );
  let volatileText: string | null = null;
  if (loadedProjectSources.length > 0) {
    volatileText = loadedProjectSources
      .map((source) => `## ${source.label}\n${source.content!.trim()}`)
      .join("\n\n");
  } else if (projectMemory && projectMemory.trim().length > 0) {
    // Fallback when structured sources aren't available (no workspace root).
    volatileText = `## PROJECT CONTEXT\n${projectMemory.trim()}`;
  }

  return {
    stableText: `${base}${personaBlock}${customBlock}`,
    volatileText,
    sources: [
      {
        id: "system_prompt",
        label: "System prompt",
        source: "Atlas selected system prompt",
        content: base,
      },
      ...projectSources,
      {
        id: "agent_persona",
        label: "Agent persona",
        source: "active Atlas agent profile",
        content: personaBlock || null,
      },
      {
        id: "custom_instructions",
        label: "Custom instructions",
        source: "user settings",
        content: customBlock || null,
      },
    ],
  };
}

// OpenAI / Gemini / DeepSeek apply prefix caching automatically; only
// Anthropic needs explicit breakpoints. Mark the stable system prefix and
// the rotating conversation tail.
function applyCacheBreakpoints(
  messages: ModelMessage[],
  provider: ProviderId,
): ModelMessage[] {
  if (provider !== "anthropic" || messages.length === 0) return messages;
  const marker = {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  };
  const withMarker = (m: ModelMessage): ModelMessage => ({
    ...m,
    providerOptions: { ...(m.providerOptions ?? {}), ...marker },
  });
  const out = messages.slice();
  out[0] = withMarker(out[0]);
  const lastIdx = out.length - 1;
  if (lastIdx > 0) out[lastIdx] = withMarker(out[lastIdx]);
  return out;
}

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type AgentUsageDelta = AgentUsage & {
  lastInputTokens: number;
  lastCachedTokens: number;
};

const EMPTY_USAGE: AgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
};

export type RunAgentOptions = {
  keys: ProviderKeys;
  modelId?: ModelId;
  customInstructions?: string;
  agentPersona?: { name: string; instructions: string } | null;
  toolContext: ToolContext;
  toolMode?: AblationMode;
  /** Lane-level step ceiling; combined (min) with the per-model budget. */
  laneMaxSteps?: number;
  /** Absolute step cap that overrides the model/lane budget (raises or lowers).
   * For benchmarks and repo-editing lanes that need more runway than a lite
   * model's default. */
  stepBudgetOverride?: number;
  /** Per-step output ceiling; defaults to a conservative per-model budget. */
  maxOutputTokens?: number;
  /** Benchmark ablation: disable the capability gateway (expose every tool). */
  gatewayDisabled?: boolean;
  /** Capability families to unlock up front (e.g. ["repo_intel"]) so the model
   * has them from step 1 without a capability_search turn. */
  prePromoteCapabilities?: string[];
  /** Ablation: force the active toolbelt to exactly this set, bypassing the
   * gateway (e.g. ["bash_run","read_file","write_file","edit"] to test whether
   * the harness machinery beats a bare 4-tool loop). */
  forceActiveTools?: string[];
  /** Ablation: capability families to remove entirely (their tools never become
   * active even if the model searches for them). Used to A/B a capability's
   * value, e.g. blockCapabilities=["repo_intel"] for a grep-only arm. */
  blockCapabilities?: string[];
  onStep?: (step: string | null) => void;
  onUsage?: (delta: AgentUsageDelta) => void;
  onCompact?: (info: { droppedCount: number }) => void;
  onFinishMeta?: (info: { hitStepCap: boolean; finishReason: string }) => void;
  /** Per-tool observation for the proof journal. Does not add a tool runtime. */
  onToolCall?: (record: {
    toolName: string;
    input: Record<string, unknown>;
    toolCallId: string;
  }) => void;
  /** Per-tool result observation for the proof journal. Does not add a tool runtime. */
  onToolResult?: (record: {
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
  }) => void;
  onLifecycleEvent?: (
    event: AtlasLifecycleEvent,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  lmstudioBaseURL?: string;
  lmstudioModelId?: string;
  mlxBaseURL?: string;
  mlxModelId?: string;
  ollamaBaseURL?: string;
  ollamaModelId?: string;
  openaiCompatibleBaseURL?: string;
  openaiCompatibleModelId?: string;
  openaiCompatibleContextLimit?: number;
  openrouterModelId?: string;
  planMode?: boolean;
  projectMemory?: string | null;
  contextLedger?: {
    projectId: string;
    sessionId: string;
    activeFile: string | null;
    sessionBinding: string;
    projectSources: readonly PackedContextSource[];
  };
  onContextPacked?: (snapshot: PackedContextSnapshot) => void;
  uiMessages: UIMessage[];
  abortSignal?: AbortSignal;
};

export async function runAgentStream(opts: RunAgentOptions) {
  const modelId = opts.modelId ?? DEFAULT_MODEL_ID;
  const model = await buildConfiguredLanguageModel(modelId, opts.keys, {
    lmstudioBaseURL: opts.lmstudioBaseURL,
    lmstudioModelId: opts.lmstudioModelId,
    mlxBaseURL: opts.mlxBaseURL,
    mlxModelId: opts.mlxModelId,
    ollamaBaseURL: opts.ollamaBaseURL,
    ollamaModelId: opts.ollamaModelId,
    openaiCompatibleBaseURL: opts.openaiCompatibleBaseURL,
    openaiCompatibleModelId: opts.openaiCompatibleModelId,
    openrouterModelId: opts.openrouterModelId,
  });
  const provider = getModel(modelId).provider;

  const stableSystem = buildStableSystem(
    modelId,
    opts.agentPersona ?? null,
    opts.customInstructions,
    opts.projectMemory ?? null,
    opts.contextLedger?.projectSources,
  );

  const history = await convertToModelMessages(sanitizeToolParts(opts.uiMessages));
  const prunedHistory = pruneMessages({
    messages: history,
    reasoning: modelKeepsReasoning(modelId) ? "none" : "before-last-message",
    emptyMessages: "remove",
  });
  const compact = compactModelMessagesDetailed(
    prunedHistory,
    getModelContextLimit(getModel(modelId).id, opts.openaiCompatibleContextLimit),
  );
  const compactedHistory = compact.messages;
  if (compact.compacted) {
    opts.onCompact?.({ droppedCount: compact.droppedCount });
  }

  // Stable prefix first (cache target), then the volatile project/memory layer,
  // then plan-mode, then history. Only messages[0] is marked for prefix caching.
  const messages: ModelMessage[] = [
    { role: "system", content: stableSystem.stableText },
  ];
  if (stableSystem.volatileText) {
    messages.push({ role: "system", content: stableSystem.volatileText });
  }
  if (opts.planMode) {
    messages.push({ role: "system", content: PLAN_MODE_PROMPT });
  }
  messages.push(...compactedHistory);

  const finalMessages = applyCacheBreakpoints(messages, provider);
  const tools = wrapToolsWithLifecycle(
    buildTools(opts.toolContext, opts.toolMode ?? "full"),
    opts.onLifecycleEvent,
  );
  if (opts.contextLedger && opts.onContextPacked) {
    await buildPackedContextSnapshot({
      ...opts.contextLedger,
      modelId,
      contextLimit: getModelContextLimit(
        getModel(modelId).id,
        opts.openaiCompatibleContextLimit,
      ),
      stableSources: stableSystem.sources,
      planModePrompt: opts.planMode ? PLAN_MODE_PROMPT : null,
      compactedHistory,
      compacted: compact.compacted,
      droppedCount: compact.droppedCount,
      tools,
    })
      .then(opts.onContextPacked)
      .catch(() => {});
  }

  // Capability Gateway: in the product (`full`) toolbelt, gate the model to the
  // small core set plus whatever it has unlocked via `capability_search`. The
  // full `tools` object is still defined, so promoted tools are callable the
  // moment the model searches for them — we only narrow which schemas are sent
  // each step. Ablation modes already restrict their toolbelt and opt out.
  const gatewayActive =
    (opts.toolMode ?? "full") === "full" && !opts.gatewayDisabled;
  const sessionId = opts.toolContext.getSessionId() ?? "unknown";
  if (gatewayActive) {
    clearPromotedCapabilities(sessionId);
    // Lanes/tasks can pre-unlock capability families (e.g. repo_intel for a
    // repo-editing task) so the model has them from step 1 without spending a
    // capability_search turn discovering it needs to navigate.
    if (opts.prePromoteCapabilities?.length) {
      promoteCapabilities(sessionId, opts.prePromoteCapabilities);
    }
  }
  const allToolNames = new Set(Object.keys(tools));
  // Effective step cap. `stepBudgetOverride` wins absolutely (used by benchmarks
  // and lanes that genuinely need more runway than the model default — a
  // lite-model cap of 16 starves real repo-editing). Otherwise it's
  // min(model budget, lane ceiling): a lane can only tighten, never loosen.
  const effectiveMaxSteps =
    opts.stepBudgetOverride ??
    Math.min(
      modelStepBudget(getModel(modelId).id),
      opts.laneMaxSteps ?? Number.POSITIVE_INFINITY,
    );

  let stepsSeen = 0;
  return streamText({
    model,
    messages: finalMessages,
    tools,
    maxOutputTokens:
      opts.maxOutputTokens ?? modelOutputTokenBudget(getModel(modelId).id),
    stopWhen: stepCountIs(effectiveMaxSteps),
    // Weak models double-encode tool arguments (JSON string wrapping the JSON
    // object); unwrap instead of failing the call. Anything else stays an error.
    experimental_repairToolCall: async ({ toolCall, error }) => {
      if (error.name === "AI_NoSuchToolError") return null;
      const repaired = unwrapDoubleEncodedInput(toolCall.input);
      return repaired === null ? null : { ...toolCall, input: repaired };
    },
    prepareStep:
      opts.forceActiveTools?.length
        ? () => ({
            activeTools: opts.forceActiveTools!.filter((name) =>
              allToolNames.has(name),
            ) as (keyof typeof tools)[],
          })
        : gatewayActive
          ? () => ({
              activeTools: activeToolNames(sessionId, opts.blockCapabilities).filter(
                (name) => allToolNames.has(name),
              ) as (keyof typeof tools)[],
            })
          : undefined,
    abortSignal: opts.abortSignal,
    onStepFinish: (step) => {
      stepsSeen++;
      if (opts.onToolCall && step.toolCalls) {
        for (const call of step.toolCalls) {
          opts.onToolCall({
            toolName: call.toolName,
            input: (call.input ?? {}) as Record<string, unknown>,
            toolCallId: call.toolCallId,
          });
        }
      }
      if (opts.onToolResult && step.toolResults) {
        const calls = step.toolCalls ?? [];
        for (const result of step.toolResults) {
          const call = calls.find((c) => c.toolCallId === result.toolCallId);
          opts.onToolResult({
            toolName: result.toolName,
            input: (call?.input ?? {}) as Record<string, unknown>,
            output: (result as { output?: unknown }).output,
          });
        }
      }
      if (opts.onStep) {
        const last = step.toolCalls?.[step.toolCalls.length - 1];
        if (last) {
          const label = TOOL_LABELS[last.toolName];
          opts.onStep(
            label
              ? label((last.input ?? {}) as Record<string, unknown>)
              : `Calling ${last.toolName}`,
          );
        } else if (step.text) {
          opts.onStep("Writing");
        }
      }
      if (opts.onUsage && step.usage) {
        const u = step.usage;
        const stepInput = u.inputTokens ?? 0;
        const stepCached = u.inputTokenDetails?.cacheReadTokens ?? 0;
        opts.onUsage({
          inputTokens: stepInput,
          outputTokens: u.outputTokens ?? 0,
          cachedInputTokens: stepCached,
          lastInputTokens: stepInput,
          lastCachedTokens: stepCached,
        });
      }
    },
    onFinish: (result) => {
      opts.onStep?.(null);
      const finishReason =
        (result as { finishReason?: string } | undefined)?.finishReason ?? "";
      opts.onFinishMeta?.({
        hitStepCap: stepsSeen >= effectiveMaxSteps,
        finishReason,
      });
    },
  });
}

export { EMPTY_USAGE };
