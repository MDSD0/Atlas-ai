import type { UIMessage } from "@ai-sdk/react";
import { type ModelId } from "../config";
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
import { useProofStore } from "../store/proofStore";

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
    const projectMemory = await readAtlasMd(live.workspaceRoot);
    const contextBlock = atlasContextBlock(live.project);
    const messagesForRun = contextBlock
      ? injectEnvIntoLastUser(options.messages, contextBlock)
      : options.messages;

    // Hard hook: record one proof run around this agent turn. Journal failures
    // must never block the agent, so recorder creation and calls are guarded.
    const recorder = await RunRecorder.start(
      proofJournal,
      {
        sessionId: deps.toolContext.getSessionId() ?? "unknown",
        workspaceRoot: live.workspaceRoot,
      },
      { onUpdate: (summary) => useProofStore.getState().setSummary(summary) },
    ).catch(() => null);

    if (options.abortSignal && recorder) {
      options.abortSignal.addEventListener(
        "abort",
        () => void recorder.finish({ cancelled: true }).catch(() => {}),
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
        onStep: deps.onStep,
        onUsage: deps.onUsage,
        onCompact: deps.onCompact,
        onFinishMeta: deps.onFinishMeta,
        onToolResult: recorder
          ? (r) => void recorder.recordTool(r).catch(() => {})
          : undefined,
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
        planMode: deps.getPlanMode?.(),
        projectMemory,
        uiMessages: messagesForRun,
        abortSignal: options.abortSignal,
      });
      if (recorder) {
        // Close the receipt when the model stream resolves. finish() is
        // idempotent, so an earlier abort-driven close wins over this one.
        void result.finishReason.then(
          () => recorder.finish(),
          () => recorder.finish({ errored: true }),
        );
      }
      return result.toUIMessageStream({
        originalMessages: options.messages,
      });
    } catch (e) {
      if (recorder) await recorder.finish({ errored: true }).catch(() => {});
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
