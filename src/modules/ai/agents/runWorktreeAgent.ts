import type { Tool } from "ai";
import type { ModelId } from "../config";
import type { ProviderKeys } from "../lib/keyring";
import type { ToolContext } from "../tools/context";
import { buildEditTools } from "../tools/edit";
import { buildFsTools } from "../tools/fs";
import { buildRealityTools } from "../tools/reality";
import { buildSearchTools } from "../tools/search";
import { buildSemanticTools } from "../tools/semantic";
import { runScopedAgent, type ScopedAgentResult } from "./runScopedAgent";

const WORKTREE_AGENT_MAX_STEPS = 20;

const SYSTEM_PROMPT = `You are an isolated coding worker operating inside an Atlas-managed Git worktree.

Complete the requested code change using the provided read, search, semantic, and file mutation tools. Every file path must stay inside the bound worktree. Read a file before editing it. Do not claim tests passed because this restricted worker has no shell; the parent agent will inspect and verify the patch. Return a concise summary of changes and any unresolved risk.`;

type Args = {
  prompt: string;
  worktreePath: string;
  keys: ProviderKeys;
  modelId: ModelId;
  parentContext: ToolContext;
  abortSignal?: AbortSignal;
  onStep?: (label: string) => void;
};

export function bindWorktreeContext(
  parentContext: ToolContext,
  worktreePath: string,
): ToolContext {
  const parentProject = parentContext.getProjectContext();
  return {
    ...parentContext,
    getWorkspaceRoot: () => worktreePath,
    getCwd: () => worktreePath,
    getProjectContext: () => ({
      ...parentProject,
      projectId: worktreePath,
      workspaceRoot: worktreePath,
      projectName: `${parentProject.projectName} worktree`,
      activeFolder: worktreePath,
      activeFile: null,
      activeSelection: null,
      activeTerminalId: null,
      activeTerminalCwd: null,
      executionCwd: worktreePath,
      executionCwdMode: "workspace",
    }),
    readCache: new Map(),
    getApprovalMode: () => "full",
  };
}

export async function runWorktreeAgent({
  prompt,
  worktreePath,
  keys,
  modelId,
  parentContext,
  abortSignal,
  onStep,
}: Args): Promise<ScopedAgentResult> {
  const context = bindWorktreeContext(parentContext, worktreePath);
  const tools: Record<string, Tool> = {
    ...buildFsTools(context),
    ...buildEditTools(context),
    ...buildSearchTools(context),
    ...buildRealityTools(context),
    ...buildSemanticTools(context),
  };
  return runScopedAgent({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    tools,
    keys,
    modelId,
    maxSteps: WORKTREE_AGENT_MAX_STEPS,
    abortSignal,
    stepLabelPrefix: "worktree",
    onStep,
  });
}
