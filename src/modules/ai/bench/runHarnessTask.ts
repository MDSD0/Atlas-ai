/**
 * Run a single benchmark task through the REAL Atlas agent loop and collect
 * harness-honest metrics. Unlike scripts/local-agent-bug-bench.mjs (a parallel
 * mock with its own prompt/tools), this drives the production runAgentStream —
 * so the capability gateway, prompt layers, compaction, step budget, and memory
 * kernel are all exercised. Provide a Tauri invoke shim via setBenchInvoke.
 */
import type { UIMessage } from "@ai-sdk/react";
import { runAgentStream } from "../lib/agent";
import { EMPTY_PROVIDER_KEYS, type ProviderKeys } from "../lib/keyring";
import { CAPABILITIES, getPromotedCapabilities } from "../tools/capabilities";
import type { AblationMode, ToolContext } from "../tools/tools";
import type { AtlasToolProjectContext } from "../tools/context";
import type { ModelId } from "../config";

export type HarnessMetrics = {
  pass: boolean;
  wallMs: number;
  steps: number;
  toolCalls: number;
  toolCounts: Record<string, number>;
  toolErrors: number;
  repeatedToolFailures: number;
  toolErrorSamples: string[];
  unlockedCapabilities: string[];
  /** Promoted capability families whose tools were actually CALLED this run.
   * `promotedUnused` is the waste signal: unlocked but never used. */
  capabilitiesUsed: string[];
  promotedUnused: string[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  hitStepCap: boolean;
  finishReason: string;
  finalText: string;
  error?: string;
};

export type HarnessTask = {
  name: string;
  prompt: string;
  projectDir: string;
  /** Returns true if the task's first-pass success criteria are met. */
  check: () => boolean | Promise<boolean>;
};

function buildToolContext(projectDir: string, sessionId: string): ToolContext {
  const project: AtlasToolProjectContext = {
    projectId: projectDir,
    workspaceRoot: projectDir,
    projectName: "bench",
    activeFolder: projectDir,
    activeFile: null,
    activeSelection: null,
    activeTerminalId: null,
    activeTerminalCwd: null,
    executionCwd: projectDir,
    executionCwdMode: "workspace",
  };
  return {
    getCwd: () => projectDir,
    getWorkspaceRoot: () => projectDir,
    getProjectContext: () => project,
    getTerminalContext: () => null,
    isActiveTerminalPrivate: () => false,
    injectIntoActivePty: () => false,
    openPreview: () => true,
    spawnAgent: () => null,
    readAgentOutput: () => null,
    readCache: new Map(),
    getSessionId: () => sessionId,
    getApprovalMode: () => "full", // headless: auto-accept mutations + shell
  };
}

export async function runHarnessTask(
  task: HarnessTask,
  opts: {
    keys: ProviderKeys;
    modelId: ModelId;
    /** Concrete slug when modelId is "openrouter-custom" (e.g. "openai/gpt-5.4-mini"). */
    openrouterModelId?: string;
    toolMode?: AblationMode;
    /** Ablation: disable the capability gateway to measure the tool-tax delta. */
    gatewayDisabled?: boolean;
    /** Hard ceiling on agent steps (budget guardrail for paid runs). */
    maxSteps?: number;
    /** Hard ceiling on per-step output tokens (budget guardrail for paid runs). */
    maxOutputTokens?: number;
    /** Capability families to unlock up front (e.g. ["repo_intel"]). */
    prePromote?: string[];
    /** Ablation: capability families to remove entirely (grep-only arm). */
    blockCapabilities?: string[];
    /** Ablation: force exactly this toolbelt (the MINIMAL control arm). */
    forceActiveTools?: string[];
  },
): Promise<HarnessMetrics> {
  const sessionId = `bench-${task.name}-${Date.now()}`;
  const toolContext = buildToolContext(task.projectDir, sessionId);

  const toolCounts: Record<string, number> = {};
  let toolCalls = 0;
  let hitStepCap = false;
  let finishReason = "";
  let toolErrors = 0;
  let repeatedToolFailures = 0;
  const toolErrorSamples: string[] = [];
  const failedToolFingerprints = new Map<string, number>();
  const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

  const messages: UIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: task.prompt }] },
  ];

  const started = Date.now();
  let error: string | undefined;
  let steps = 0;
  let finalText = "";
  try {
    const result = await runAgentStream({
      keys: { ...EMPTY_PROVIDER_KEYS, ...opts.keys },
      modelId: opts.modelId,
      toolContext,
      toolMode: opts.toolMode ?? "full",
      gatewayDisabled: opts.gatewayDisabled,
      stepBudgetOverride: opts.maxSteps,
      maxOutputTokens: opts.maxOutputTokens,
      prePromoteCapabilities: opts.prePromote,
      blockCapabilities: opts.blockCapabilities,
      forceActiveTools: opts.forceActiveTools,
      openrouterModelId: opts.openrouterModelId,
      uiMessages: messages,
      onToolResult: (r) => {
        toolCalls++;
        toolCounts[r.toolName] = (toolCounts[r.toolName] ?? 0) + 1;
        const output = r.output as { error?: unknown; code?: unknown } | undefined;
        if (output && typeof output.error === "string") {
          toolErrors++;
          if (toolErrorSamples.length < 5) {
            toolErrorSamples.push(`${r.toolName}: ${output.error.slice(0, 180)}`);
          }
          const fingerprint = JSON.stringify({
            tool: r.toolName,
            input: r.input,
            error: output.error,
            code: output.code,
          });
          const seen = failedToolFingerprints.get(fingerprint) ?? 0;
          if (seen > 0) repeatedToolFailures++;
          failedToolFingerprints.set(fingerprint, seen + 1);
        }
      },
      onUsage: (d) => {
        usage.inputTokens += d.inputTokens;
        usage.outputTokens += d.outputTokens;
        usage.cachedInputTokens += d.cachedInputTokens;
      },
      onFinishMeta: (m) => {
        hitStepCap = m.hitStepCap;
        finishReason = m.finishReason;
      },
    });
    // Drive the stream to completion.
    await result.consumeStream();
    await Promise.resolve(result.finishReason)
      .then((reason) => {
        finishReason = reason;
      })
      .catch((finishError) => {
        finishReason = "error";
        error = String(finishError);
      });
    const stepList = await (result as unknown as { steps?: Promise<unknown[]> })
      .steps;
    if (Array.isArray(stepList)) steps = stepList.length;
    finalText = await Promise.resolve(
      (result as unknown as { text?: Promise<string> }).text ?? "",
    ).catch(() => "");
  } catch (e) {
    error = String(e);
  }

  const wallMs = Date.now() - started;
  let pass = false;
  try {
    pass = !error && (await task.check());
  } catch {
    pass = false;
  }

  const unlocked = getPromotedCapabilities(sessionId).filter(
    (id) => !(opts.blockCapabilities ?? []).includes(id),
  );
  // A promoted capability "was used" iff at least one of its tools got called.
  const usedTool = (id: string) =>
    (CAPABILITIES.find((c) => c.id === id)?.toolNames ?? []).some(
      (t) => (toolCounts[t] ?? 0) > 0,
    );
  const capabilitiesUsed = unlocked.filter(usedTool);
  const promotedUnused = unlocked.filter((id) => !usedTool(id));

  return {
    pass,
    wallMs,
    steps,
    toolCalls,
    toolCounts,
    toolErrors,
    repeatedToolFailures,
    toolErrorSamples,
    unlockedCapabilities: unlocked,
    capabilitiesUsed,
    promotedUnused,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    hitStepCap,
    finishReason,
    finalText,
    error,
  };
}
