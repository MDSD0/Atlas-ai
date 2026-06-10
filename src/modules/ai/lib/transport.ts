import type { UIMessage } from "@ai-sdk/react";
import { getModel, type ModelId } from "../config";
import { runAgentStream, type AgentUsageDelta } from "./agent";
import type { ProviderKeys } from "./keyring";
import { agentNative } from "./native";
import {
  atlasContextBlock,
  type AtlasToolProjectContext,
  type ToolContext,
} from "../tools/tools";
import { proofJournal } from "../proof";
import { RunRecorder } from "../proof/recorder";
import { proofRunRegistry } from "../proof/runtime";
import { useProofStore } from "../store/proofStore";
import {
  buildPinnedMemoryContext,
  buildMemorySurfaceContext,
  mirrorProofRunToMemorySurface,
  SimpleMemRunObserver,
} from "../memory";
import { buildLocalSkillsContext, lifecycleHookRunner } from "../skills";
import { buildActiveWorkPacketContext } from "../workPackets";
import { contextLedger, type PackedContextSource } from "../contextLedger";
import { selectAgentRunPolicy } from "./lanePolicy";
import {
  beginRunResources,
  killRunResourcesForSignal,
  releaseRunResources,
} from "./runResources";
import {
  finishSessionTrace,
  recordSessionTraceEvent,
  recordSessionTraceUsage,
  startSessionTrace,
} from "../traces/sessionTrace";

const ATLAS_MD_MAX_BYTES = 32 * 1024;
type MemoryCacheEntry = { content: string | null; mtime: number };
const projectMemoryCache = new Map<string, MemoryCacheEntry>();

async function readAtlasMd(workspaceRoot: string | null): Promise<string | null> {
  if (!workspaceRoot) return null;
  const path = `${workspaceRoot.replace(/\/$/, "")}/ATLAS.md`;
  const cached = projectMemoryCache.get(workspaceRoot);
  if (cached && Date.now() - cached.mtime < 30_000) return cached.content;
  try {
    const r = await agentNative.readFile(path, workspaceRoot);
    if (r.kind !== "text") {
      projectMemoryCache.set(workspaceRoot, { content: null, mtime: Date.now() });
      return null;
    }
    const content =
      r.content.length > ATLAS_MD_MAX_BYTES
        ? r.content.slice(0, ATLAS_MD_MAX_BYTES)
        : r.content;
    projectMemoryCache.set(workspaceRoot, { content, mtime: Date.now() });
    return content;
  } catch {
    projectMemoryCache.set(workspaceRoot, { content: null, mtime: Date.now() });
    return null;
  }
}

type LiveSnapshot = {
  cwd: string | null;
  terminalPrivate: boolean;
  workspaceRoot: string | null;
  activeFile: string | null;
  project: AtlasToolProjectContext;
};

type Deps = {
  getKeys: () => ProviderKeys;
  toolContext: ToolContext;
  getModelId: () => ModelId;
  getCustomInstructions: () => string;
  getAgentPersona: () => { name: string; instructions: string } | null;
  getLive: () => LiveSnapshot;
  getLmstudioBaseURL?: () => string | undefined;
  getLmstudioModelId?: () => string | undefined;
  getMlxBaseURL?: () => string | undefined;
  getMlxModelId?: () => string | undefined;
  getOllamaBaseURL?: () => string | undefined;
  getOllamaModelId?: () => string | undefined;
  getOpenaiCompatibleBaseURL?: () => string | undefined;
  getOpenaiCompatibleModelId?: () => string | undefined;
  getOpenaiCompatibleContextLimit?: () => number | undefined;
  getOpenrouterModelId?: () => string | undefined;
  onStep?: (step: string | null) => void;
  onUsage?: (delta: AgentUsageDelta) => void;
  onCompact?: (info: { droppedCount: number }) => void;
  onFinishMeta?: (info: { hitStepCap: boolean; finishReason: string }) => void;
  onCancel?: () => void;
  getPlanMode?: () => boolean;
};

type SendOptions = {
  messages: UIMessage[];
  abortSignal?: AbortSignal;
  [k: string]: unknown;
};

export function createContextAwareTransport(deps: Deps) {
  const run = async (options: SendOptions) => {
    const live = deps.getLive();
    const prompt = lastUserText(options.messages);
    const sessionId = deps.toolContext.getSessionId() ?? "unknown";
    beginRunResources(sessionId, options.abortSignal);
    const planMode = deps.getPlanMode?.() ?? false;
    const runPolicy = selectAgentRunPolicy({
      prompt: recentUserText(options.messages),
      planMode,
      activeFile: live.activeFile,
    });
    const modelId = deps.getModelId();
    const model = getModel(modelId);
    const trace = await startSessionTrace({
      sessionId,
      workspaceRoot: live.workspaceRoot,
      modelId,
      providerId: model.provider,
      prompt,
      lane: runPolicy.lane,
      toolMode: runPolicy.toolMode,
      planMode,
      reason: runPolicy.reason,
      activeFile: live.activeFile,
    });
    for (const observedTool of observedToolResults(options.messages)) {
      recordSessionTraceEvent(trace, "tool.finished", {
        ...observedTool,
        source: "ui-message-history",
      });
    }
    // Start the SimpleMem observer concurrently with the other context builders
    // instead of blocking the model call on its session round-trip first.
    const [atlasMd, fileMemory, localMemory, activeWorkPacket, localSkills, simpleMem] =
      await Promise.all([
        runPolicy.includeAtlasMd
          ? readAtlasMd(live.workspaceRoot)
          : Promise.resolve(null),
        runPolicy.includeMemoryIndex
          ? buildMemorySurfaceContext(live.workspaceRoot)
          : Promise.resolve(null),
        runPolicy.includeLocalMemory
          ? buildPinnedMemoryContext(live.workspaceRoot)
          : Promise.resolve(null),
        runPolicy.includeWorkPacket
          ? buildActiveWorkPacketContext(live.workspaceRoot)
          : Promise.resolve(null),
        runPolicy.includeSkills
          ? buildLocalSkillsContext()
          : Promise.resolve(null),
        runPolicy.includeSimpleMem
          ? SimpleMemRunObserver.start({
              workspaceRoot: live.workspaceRoot,
              contentSessionId: sessionId,
              userPrompt: prompt,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
    const projectSources: PackedContextSource[] = [
      {
        id: "atlas_md",
        label: "ATLAS.md",
        source: "workspace ATLAS.md",
        content: atlasMd,
      },
      {
        id: "memory_index",
        label: "MEMORY.md",
        source: ".atlas/memory/MEMORY.md",
        content: fileMemory,
      },
      {
        id: "local_memory",
        label: "Pinned memory",
        source: "app-local typed memory (top-confidence snapshot)",
        content: localMemory,
      },
      {
        id: "active_work_packet",
        label: "Active work packet",
        source: "app-local resumable packet",
        content: activeWorkPacket,
      },
      {
        id: "simplemem_context",
        label: "SimpleMem context",
        source: "optional loopback SimpleMem Cross sidecar",
        content: simpleMem?.context,
      },
      {
        id: "skill_prompts",
        label: "Skill prompts",
        source: "enabled app-local skill packages",
        content: localSkills,
      },
    ];
    const projectMemory =
      projectSources
        .map((source) => source.content)
        .filter(Boolean)
        .join("\n\n") || null;
    const contextBlock = atlasContextBlock(live.project);
    const messagesForRun = contextBlock
      ? injectEnvIntoLastUser(options.messages, contextBlock)
      : options.messages;

    // Hard hook: record one proof run around this agent turn. Journal failures
    // must never block the agent, so recorder creation and calls are guarded.
    const recorder = await RunRecorder.start(
      proofJournal,
      {
        sessionId,
        workspaceRoot: live.workspaceRoot,
      },
      { onUpdate: (summary) => useProofStore.getState().setSummary(summary) },
    ).catch(() => null);
    if (recorder) proofRunRegistry.register(recorder);
    const observeLifecycle = async (
      event: Parameters<typeof lifecycleHookRunner.run>[0],
      payload: Record<string, unknown> = {},
    ) => {
      if (recorder) {
        await recorder.recordLifecycle(event, payload).catch(() => {});
      } else {
        await lifecycleHookRunner.run(event, payload).catch(() => {});
      }
    };
    await observeLifecycle("run_start");
    await observeLifecycle("prompt_submit", {
      text: prompt,
      lane: runPolicy.lane,
      toolMode: runPolicy.toolMode,
      reason: runPolicy.reason,
    });

    const finishObservers = async (
      outcome: { cancelled?: boolean; errored?: boolean } = {},
    ) => {
      if (outcome.cancelled) {
        killRunResourcesForSignal(sessionId, options.abortSignal);
      } else {
        releaseRunResources(sessionId, options.abortSignal);
      }
      await finishSessionTrace(
        trace,
        outcome.cancelled ? "cancelled" : outcome.errored ? "errored" : "finished",
        {
          proofRunId: recorder?.runId ?? null,
          sessionId,
        },
      );
      await Promise.all([
        (async () => {
          await recorder?.finish(outcome).catch(() => {});
          if (!recorder) return;
          const run = await proofJournal.getRun(recorder.runId).catch(() => null);
          await mirrorProofRunToMemorySurface(live.workspaceRoot, run).catch(
            () => {},
          );
        })(),
        simpleMem?.finish().catch(() => {}),
      ]);
    };

    if (options.abortSignal) {
      options.abortSignal.addEventListener(
        "abort",
        () => {
          deps.onCancel?.();
          void finishObservers({ cancelled: true });
        },
        { once: true },
      );
    }

    try {
      const result = await runAgentStream({
        keys: deps.getKeys(),
        modelId: deps.getModelId(),
        customInstructions: deps.getCustomInstructions(),
        agentPersona: deps.getAgentPersona(),
        toolContext: deps.toolContext,
        toolMode: runPolicy.toolMode,
        laneMaxSteps: runPolicy.maxSteps,
        onStep: (step) => {
          deps.onStep?.(step);
          recordSessionTraceEvent(trace, "agent.step", { step });
        },
        onUsage: (delta) => {
          deps.onUsage?.(delta);
          recordSessionTraceUsage(trace, delta);
        },
        onCompact: (info) => {
          deps.onCompact?.(info);
          recordSessionTraceEvent(trace, "context.compacted", info);
        },
        onFinishMeta: (info) => {
          deps.onFinishMeta?.(info);
          recordSessionTraceEvent(trace, "agent.finish_meta", info);
        },
        onToolCall: (r) => {
          recordSessionTraceEvent(trace, "tool.called", r);
        },
        onToolResult: recorder || simpleMem || trace
          ? (r) => {
              recordSessionTraceEvent(trace, "tool.finished", r);
              void recorder?.recordTool(r).catch(() => {});
              void simpleMem?.recordTool(r).catch(() => {});
            }
          : undefined,
        onLifecycleEvent: observeLifecycle,
        lmstudioBaseURL: deps.getLmstudioBaseURL?.(),
        lmstudioModelId: deps.getLmstudioModelId?.(),
        mlxBaseURL: deps.getMlxBaseURL?.(),
        mlxModelId: deps.getMlxModelId?.(),
        ollamaBaseURL: deps.getOllamaBaseURL?.(),
        ollamaModelId: deps.getOllamaModelId?.(),
        openaiCompatibleBaseURL: deps.getOpenaiCompatibleBaseURL?.(),
        openaiCompatibleModelId: deps.getOpenaiCompatibleModelId?.(),
        openaiCompatibleContextLimit: deps.getOpenaiCompatibleContextLimit?.(),
        openrouterModelId: deps.getOpenrouterModelId?.(),
        planMode,
        projectMemory,
        contextLedger: live.workspaceRoot
          ? {
              projectId: live.workspaceRoot,
              sessionId,
              activeFile: live.activeFile,
              sessionBinding: contextBlock,
              projectSources,
            }
          : undefined,
        onContextPacked: (snapshot) => {
          contextLedger.capture(snapshot);
          recordSessionTraceEvent(trace, "context.packed", snapshot);
        },
        uiMessages: messagesForRun,
        abortSignal: options.abortSignal,
      });
      // Close the receipt and release run resources when the model stream
      // resolves. finish() and resource cleanup are idempotent, so an earlier
      // abort-driven close wins over this one.
      void result.finishReason.then(
        () => finishObservers(),
        () => finishObservers({ errored: true }),
      );
      return result.toUIMessageStream({
        originalMessages: options.messages,
      });
    } catch (e) {
      await finishObservers({ errored: true });
      throw e;
    }
  };

  return {
    sendMessages: run,
    async reconnectToStream(): Promise<null> {
      return null;
    },
  };
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    return (message.parts as ReadonlyArray<{ type: string; text?: string }>)
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .slice(0, 4096);
  }
  return "";
}

function recentUserText(messages: UIMessage[], maxMessages = 4): string {
  const chunks: string[] = [];
  for (let i = messages.length - 1; i >= 0 && chunks.length < maxMessages; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const text = (message.parts as ReadonlyArray<{ type: string; text?: string }>)
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
    if (text) chunks.unshift(text);
  }
  return chunks.join("\n\n").slice(-8192);
}

function observedToolResults(
  messages: UIMessage[],
): Array<{
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  state: string;
  toolCallId?: string;
}> {
  const out: Array<{
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    state: string;
    toolCallId?: string;
  }> = [];
  const terminalStates = new Set([
    "output-available",
    "output-denied",
    "output-error",
  ]);
  for (const message of messages) {
    const parts = message.parts as
      | Array<{
          type?: string;
          state?: string;
          toolName?: string;
          dynamicToolName?: string;
          input?: unknown;
          output?: unknown;
          result?: unknown;
          toolCallId?: string;
        }>
      | undefined;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const state = part.state ?? "";
      if (!terminalStates.has(state)) continue;
      const type = part.type ?? "";
      const toolName =
        part.toolName ??
        part.dynamicToolName ??
        (type.startsWith("tool-") ? type.slice("tool-".length) : "");
      if (!toolName) continue;
      const input =
        typeof part.input === "object" && part.input !== null
          ? (part.input as Record<string, unknown>)
          : {};
      out.push({
        toolName,
        input,
        output: part.output ?? part.result ?? null,
        state,
        toolCallId: part.toolCallId,
      });
    }
  }
  return out;
}

function injectEnvIntoLastUser(
  messages: UIMessage[],
  envBlock: string,
): UIMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = m.parts as ReadonlyArray<{ type: string; text?: string }>;
    let textIdx = -1;
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].type === "text") {
        textIdx = j;
        break;
      }
    }
    const nextParts =
      textIdx === -1
        ? [{ type: "text", text: envBlock }, ...parts]
        : parts.map((p, idx) =>
            idx === textIdx
              ? { ...p, text: `${envBlock}\n\n${p.text ?? ""}` }
              : p,
          );
    const out = messages.slice();
    out[i] = { ...m, parts: nextParts } as UIMessage;
    return out;
  }
  return messages;
}

export const CONTEXT_BLOCK_RE =
  /^(<terminal-context[^>]*>[\s\S]*?<\/terminal-context>|<atlas_context>[\s\S]*?<\/atlas_context>|<env>[\s\S]*?<\/env>)\n*/;

export function stripContextBlock(text: string): string {
  return text.replace(CONTEXT_BLOCK_RE, "");
}
