import { tool } from "ai";
import { z } from "zod";
import { agentNative, type LspProviderInfo } from "../lib/native";
import {
  checkFileAccessAllowed,
  resolvePath,
  type ToolContext,
} from "./context";

export function summarizeSemanticAvailability(providers: LspProviderInfo[]) {
  return {
    status:
      providers.length === 0
        ? ("not_applicable" as const)
        : providers.some((provider) => provider.status === "available")
          ? ("available" as const)
          : ("unavailable" as const),
    providers,
    semantic_requests: "not_started" as const,
  };
}

export function buildSemanticTools(ctx: ToolContext) {
  return {
    lsp_status: tool({
      description:
        "Report whether an optional language-server provider is installed for a file. This does not start a server or claim semantic coverage.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe("Optional project-relative path used to select a provider."),
      }),
      execute: async ({ path }) => {
        const project = ctx.getProjectContext();
        const blocked = checkFileAccessAllowed(project);
        if (blocked) return blocked;
        const projectRoot = project.workspaceRoot as string;
        const file = path
          ? resolvePath(path, project)
          : (project.activeFile ?? undefined);
        try {
          const providers = await agentNative.lspStatus(projectRoot, file);
          return summarizeSemanticAvailability(providers);
        } catch (e) {
          return { error: String(e), root: projectRoot };
        }
      },
    }),
  } as const;
}
