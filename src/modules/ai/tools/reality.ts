import { tool } from "ai";
import { z } from "zod";
import { agentNative } from "../lib/native";
import { checkFileAccessAllowed, type ToolContext } from "./context";

export function buildRealityTools(ctx: ToolContext) {
  return {
    repo_context: tool({
      description:
        "Build a fresh, bounded repository map for the current task. Use this before broad code changes or when file ownership is unclear. Returns relevant files and symbol snippets under a strict token budget, plus freshness, omissions, ignored-directory counts, and degraded parse states. Current repository evidence outranks memory.",
      inputSchema: z.object({
        task: z
          .string()
          .min(1)
          .describe("The concrete coding question or change to map against."),
        max_tokens: z.number().int().min(128).max(4000).optional(),
      }),
      execute: async ({ task, max_tokens }) => {
        const project = ctx.getProjectContext();
        const blocked = checkFileAccessAllowed(project);
        if (blocked) return blocked;
        const projectRoot = project.workspaceRoot as string;
        try {
          return await agentNative.repoContext(task, projectRoot, max_tokens);
        } catch (e) {
          return { error: String(e), root: projectRoot };
        }
      },
    }),
  } as const;
}
