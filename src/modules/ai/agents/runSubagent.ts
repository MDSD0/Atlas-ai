import { generateText, stepCountIs } from "ai";
import { DEFAULT_MODEL_ID, getModel, type ModelId } from "../config";
import { buildLanguageModel } from "../lib/agent";
import type { ProviderKeys } from "../lib/keyring";
import type { ToolContext } from "../tools/context";
import { buildFsTools } from "../tools/fs";
import { buildReadOnlyMemoryTools } from "../tools/memory";
import { buildMetricsTools } from "../tools/metrics";
import { buildReadOnlyMcpTools } from "../tools/mcp";
import { buildReadOnlySkillTools } from "../tools/skills";
import { buildRealityTools } from "../tools/reality";
import { buildSearchTools } from "../tools/search";
import { buildSemanticTools } from "../tools/semantic";
import { buildVerificationTools } from "../tools/verification";
import { SUBAGENTS, type SubagentType } from "./registry";

const SUBAGENT_MAX_STEPS = 12;

type Args = {
  type: SubagentType;
  prompt: string;
  keys: ProviderKeys;
  modelId: ModelId;
  toolContext: ToolContext;
  lmstudioBaseURL?: string;
  onStep?: (label: string) => void;
};

type RunResult = {
  summary: string;
  stepCount: number;
  durationMs: number;
};

export async function runSubagent({
  type,
  prompt,
  keys,
  modelId,
  toolContext,
  lmstudioBaseURL,
  onStep,
}: Args): Promise<RunResult> {
  const def = SUBAGENTS[type];
  if (!def) throw new Error(`unknown subagent type: ${type}`);

  const baseReadOnly: Record<string, unknown> = {
    ...buildFsTools(toolContext),
    ...buildReadOnlyMemoryTools(toolContext),
    ...buildMetricsTools(toolContext),
    ...buildReadOnlyMcpTools(),
    ...buildRealityTools(toolContext),
    ...buildSearchTools(toolContext),
    ...buildSemanticTools(toolContext),
    ...buildVerificationTools(),
  };
  const readOnly: Record<string, unknown> = {
    ...baseReadOnly,
    ...buildReadOnlySkillTools(() => Object.keys(baseReadOnly)),
  };
  const tools: Record<string, unknown> = {};
  for (const t of def.tools) {
    if (t in readOnly) tools[t] = readOnly[t];
  }

  const model = await buildLanguageModel(
    getModel(modelId).provider,
    keys,
    getModel(modelId).id,
    { lmstudioBaseURL },
  );

  const start = Date.now();
  const result = await generateText({
    model,
    system: def.systemPrompt,
    prompt,
    tools: tools as Parameters<typeof generateText>[0]["tools"],
    stopWhen: stepCountIs(SUBAGENT_MAX_STEPS),
    onStepFinish: (step) => {
      if (!onStep) return;
      const last = step.toolCalls?.[step.toolCalls.length - 1];
      if (last) onStep(`${type}: ${last.toolName}`);
    },
  });

  return {
    summary: result.text || "(no output)",
    stepCount: result.steps?.length ?? 0,
    durationMs: Date.now() - start,
  };
}

export const DEFAULT_SUBAGENT_MODEL: ModelId = DEFAULT_MODEL_ID;
