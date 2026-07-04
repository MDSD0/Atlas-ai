import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { runSubagent } from "../agents/runSubagent";
import { SUBAGENTS, type SubagentType } from "../agents/registry";
import { useChatStore } from "../store/chatStore";
import type { ToolContext } from "./context";

const TYPE_KEYS = Object.keys(SUBAGENTS) as [SubagentType, ...SubagentType[]];

export function buildSubagentTools(ctx: ToolContext) {
  const runOne = async (
    type: SubagentType,
    prompt: string,
    description: string | undefined,
    options: ToolExecutionOptions,
  ) => {
    const { apiKeys, selectedModelId, patchAgentMeta } =
      useChatStore.getState();
    try {
      const r = await runSubagent({
        type,
        prompt,
        keys: apiKeys,
        modelId: selectedModelId,
        toolContext: ctx,
        abortSignal: options.abortSignal,
        onStep: (label) => {
          const sessionId = ctx.getSessionId();
          if (sessionId) patchAgentMeta(sessionId, { step: label });
        },
      });
      return {
        type,
        description,
        summary: r.summary,
        stepCount: r.stepCount,
        durationMs: r.durationMs,
      };
    } catch (error) {
      return {
        error:
          options.abortSignal?.aborted
            ? "subagent cancelled"
            : String(error),
        type,
        description,
      };
    }
  };

  return {
    run_subagent: tool({
      description: `Spawn an isolated subagent with its own restricted toolset and a fresh message history. Use when you need to delegate a self-contained read-only investigation (large search, code review, security audit) without polluting your own context. The subagent returns a single text summary; pick a 'type' that matches its job.

Types:
${TYPE_KEYS.map((k) => `- ${k}: ${SUBAGENTS[k].description}`).join("\n")}

Auto-executes (no approval) — subagents are read-only by design.`,
      inputSchema: z.object({
        type: z.enum(TYPE_KEYS),
        prompt: z
          .string()
          .describe(
            "Self-contained instruction. The subagent has no memory of prior conversation — include all relevant context.",
          ),
        description: z
          .string()
          .optional()
          .describe("Short label shown in the chat UI for the spawn card."),
      }),
      execute: ({ type, prompt, description }, options) =>
        runOne(type, prompt, description, options),
    }),
    run_subagents: tool({
      description: `Run two or three independent read-only investigations concurrently, each with isolated history and a restricted toolset. Use only when the jobs do not depend on each other's results. Returns every result in input order. Requires approval because it starts multiple model calls.`,
      inputSchema: z.object({
        jobs: z
          .array(
            z.object({
              type: z.enum(TYPE_KEYS),
              prompt: z.string().min(1).max(12_000),
              description: z.string().min(1).max(120).optional(),
            }),
          )
          .min(2)
          .max(3),
      }),
      needsApproval: true,
      execute: async ({ jobs }, options) => {
        const startedAt = Date.now();
        const results = await Promise.all(
          jobs.map((job) =>
            runOne(job.type, job.prompt, job.description, options),
          ),
        );
        return {
          parallel: true,
          count: results.length,
          durationMs: Date.now() - startedAt,
          results,
        };
      },
    }),
  } as const;
}
