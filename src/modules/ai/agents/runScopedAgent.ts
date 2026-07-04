import { generateText, stepCountIs, type Tool } from "ai";
import { getModel, type ModelId } from "../config";
import { buildLanguageModel } from "../lib/agent";
import type { ProviderKeys } from "../lib/keyring";

export type ScopedAgentResult = {
  summary: string;
  stepCount: number;
  durationMs: number;
};

export type ScopedAgentArgs = {
  systemPrompt: string;
  prompt: string;
  tools: Record<string, Tool>;
  keys: ProviderKeys;
  modelId: ModelId;
  maxSteps: number;
  lmstudioBaseURL?: string;
  abortSignal?: AbortSignal;
  /** Prefixes each step label, e.g. the subagent type or "worktree". */
  stepLabelPrefix?: string;
  onStep?: (label: string) => void;
};

/**
 * Shared body for every "scoped generateText loop with a restricted toolset"
 * agent runner (subagents, worktree coding workers). Callers own tool
 * assembly and ToolContext binding; this only owns the model call.
 */
export async function runScopedAgent({
  systemPrompt,
  prompt,
  tools,
  keys,
  modelId,
  maxSteps,
  lmstudioBaseURL,
  abortSignal,
  stepLabelPrefix,
  onStep,
}: ScopedAgentArgs): Promise<ScopedAgentResult> {
  const model = await buildLanguageModel(
    getModel(modelId).provider,
    keys,
    getModel(modelId).id,
    { lmstudioBaseURL },
  );

  const startedAt = Date.now();
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    tools: tools as Parameters<typeof generateText>[0]["tools"],
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    onStepFinish: (step) => {
      if (!onStep) return;
      const last = step.toolCalls?.[step.toolCalls.length - 1];
      if (last) {
        onStep(
          stepLabelPrefix ? `${stepLabelPrefix}: ${last.toolName}` : last.toolName,
        );
      }
    },
  });

  return {
    summary: result.text || "(no output)",
    stepCount: result.steps?.length ?? 0,
    durationMs: Date.now() - startedAt,
  };
}
