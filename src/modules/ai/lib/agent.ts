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
  MAX_AGENT_STEPS,
  MLX_DEFAULT_BASE_URL,
  modelKeepsReasoning,
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
import { buildTools, type ToolContext } from "../tools/tools";
import { wrapToolsWithLifecycle } from "../tools/lifecycle";
import type { AtlasLifecycleEvent } from "../skills";
import { compactModelMessagesDetailed } from "./compact";
import type { ProviderKeys } from "./keyring";
import { createProxyFetch } from "./proxyFetch";

const localProxyFetch = createProxyFetch({ allowPrivateNetwork: true });

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
      built = createOpenAI({ apiKey: key })(resolvedModelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      built = createAnthropic({ apiKey: key })(resolvedModelId);
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      built = createGoogleGenerativeAI({ apiKey: key })(resolvedModelId);
      break;
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      built = createXai({ apiKey: key })(resolvedModelId);
      break;
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      built = createCerebras({ apiKey: key })(resolvedModelId);
      break;
    }
    case "deepseek": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "deepseek",
        baseURL: "https://api.deepseek.com",
        apiKey: key,
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
      })(resolvedModelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      built = createGroq({ apiKey: key })(resolvedModelId);
      break;
    }
    case "openrouter": {
      const { createOpenAICompatible } =
        await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: key,
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

const PLAN_MODE_PROMPT = `## PLAN MODE — ACTIVE
Mutating tools (write_file, edit, multi_edit, create_directory) will queue their changes for the user to review as a single diff. Do NOT execute bash_run or bash_background while plan mode is active; restrict yourself to reads (repo_context, read_file, grep, glob, list_directory) and the queued mutations. After queueing the full set of edits, stop and return a brief summary; do not continue acting until the user has accepted/rejected.`;

function buildStableSystem(
  modelId: ModelId,
  persona: { name: string; instructions: string } | null,
  customInstructions: string | undefined,
  projectMemory: string | null,
  projectSources: readonly PackedContextSource[] = [],
): { text: string; sources: PackedContextSource[] } {
  const base = selectSystemPrompt(getModel(modelId).id);
  const personaBlock = persona?.instructions.trim()
    ? `\n\n## ACTIVE AGENT — ${persona.name}\n${persona.instructions.trim()}`
    : "";
  const customBlock = customInstructions?.trim()
    ? `\n\n## USER CUSTOM INSTRUCTIONS — follow unless they conflict with safety rules above\n${customInstructions.trim()}`
    : "";
  const memoryBlock =
    projectMemory && projectMemory.trim().length > 0
      ? `\n\n## PROJECT — ATLAS.md\n${projectMemory.trim()}`
      : "";
  const loadedProjectSources = projectSources.filter((source) =>
    source.content?.trim(),
  );
  return {
    text: `${base}${memoryBlock}${personaBlock}${customBlock}`,
    sources: [
      {
        id: "system_prompt",
        label: "System prompt",
        source: "Atlas selected system prompt",
        content: base,
      },
      {
        id: "project_context_overhead",
        label: "Project-context framing",
        source: "Atlas stable-system packer",
        content: memoryBlock
          ? `\n\n## PROJECT — ATLAS.md\n${"\n\n".repeat(
              Math.max(0, loadedProjectSources.length - 1),
            )}`
          : null,
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
  onStep?: (step: string | null) => void;
  onUsage?: (delta: AgentUsageDelta) => void;
  onCompact?: (info: { droppedCount: number }) => void;
  onFinishMeta?: (info: { hitStepCap: boolean; finishReason: string }) => void;
  /** Per-tool observation for the proof journal. Does not add a tool runtime. */
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

  const history = await convertToModelMessages(opts.uiMessages);
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

  const messages: ModelMessage[] = [
    { role: "system", content: stableSystem.text },
  ];
  if (opts.planMode) {
    messages.push({ role: "system", content: PLAN_MODE_PROMPT });
  }
  messages.push(...compactedHistory);

  const finalMessages = applyCacheBreakpoints(messages, provider);
  const tools = wrapToolsWithLifecycle(
    buildTools(opts.toolContext),
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

  let stepsSeen = 0;
  return streamText({
    model,
    messages: finalMessages,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    abortSignal: opts.abortSignal,
    onStepFinish: (step) => {
      stepsSeen++;
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
        hitStepCap: stepsSeen >= MAX_AGENT_STEPS,
        finishReason,
      });
    },
  });
}

export { EMPTY_USAGE };
