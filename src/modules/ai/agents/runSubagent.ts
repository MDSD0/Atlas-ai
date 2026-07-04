import type { Tool } from "ai";
import { DEFAULT_MODEL_ID, type ModelId } from "../config";
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
import { buildReadOnlyWorkPacketTools } from "../tools/workPackets";
import { runScopedAgent, type ScopedAgentResult } from "./runScopedAgent";
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
  abortSignal?: AbortSignal;
};

export async function runSubagent({
  type,
  prompt,
  keys,
  modelId,
  toolContext,
  lmstudioBaseURL,
  onStep,
  abortSignal,
}: Args): Promise<ScopedAgentResult> {
  const def = SUBAGENTS[type];
  if (!def) throw new Error(`unknown subagent type: ${type}`);

  const baseReadOnly: Record<string, Tool> = {
    ...buildFsTools(toolContext),
    ...buildReadOnlyMemoryTools(toolContext),
    ...buildMetricsTools(toolContext),
    ...buildReadOnlyMcpTools(),
    ...buildRealityTools(toolContext),
    ...buildSearchTools(toolContext),
    ...buildSemanticTools(toolContext),
    ...buildVerificationTools(),
    ...buildReadOnlyWorkPacketTools(toolContext),
  };
  const readOnly: Record<string, Tool> = {
    ...baseReadOnly,
    ...buildReadOnlySkillTools(() => Object.keys(baseReadOnly)),
  };
  const tools: Record<string, Tool> = {};
  for (const t of def.tools) {
    if (t in readOnly) tools[t] = readOnly[t];
  }

  return runScopedAgent({
    systemPrompt: def.systemPrompt,
    prompt,
    tools,
    keys,
    modelId,
    maxSteps: SUBAGENT_MAX_STEPS,
    lmstudioBaseURL,
    abortSignal,
    stepLabelPrefix: type,
    onStep,
  });
}

export const DEFAULT_SUBAGENT_MODEL: ModelId = DEFAULT_MODEL_ID;
