import { tool } from "ai";
import { z } from "zod";
import { agentNative, type LspProviderInfo } from "../lib/native";
import {
  checkFileAccessAllowed,
  resolvePath,
  type ToolContext,
} from "./context";
import type { LspSemanticOperation } from "../lib/native";

export function summarizeSemanticAvailability(providers: LspProviderInfo[]) {
  return {
    status:
      providers.length === 0
        ? ("not_applicable" as const)
        : providers.some(
              (provider) =>
                provider.status === "available" ||
                provider.status === "connected",
            )
          ? ("available" as const)
          : ("unavailable" as const),
    providers,
    semantic_requests: "not_started" as const,
  };
}

async function semanticRequest(
  ctx: ToolContext,
  path: string,
  request: {
    operation: LspSemanticOperation;
    line?: number;
    character?: number;
    query?: string;
  },
) {
  const project = ctx.getProjectContext();
  const blocked = checkFileAccessAllowed(project);
  if (blocked) return blocked;
  const projectRoot = project.workspaceRoot as string;
  try {
    return await agentNative.lspSemantic(
      projectRoot,
      resolvePath(path, project),
      request,
    );
  } catch (e) {
    return { error: String(e), root: projectRoot };
  }
}

const positionSchema = {
  path: z.string().describe("Project-relative or absolute source path."),
  line: z.number().int().min(0).describe("Zero-based source line."),
  character: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Zero-based UTF-16 character offset."),
};

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
    lsp_diagnostics: tool({
      description:
        "Collect bounded diagnostics through an optional lazy language-server client. The result reports fresh, cached, pending, unavailable, or broken status explicitly. Repository tools remain available if semantics are unavailable.",
      inputSchema: z.object({
        path: z.string().describe("Project-relative or absolute TypeScript path."),
      }),
      execute: async ({ path }) => {
        const project = ctx.getProjectContext();
        const blocked = checkFileAccessAllowed(project);
        if (blocked) return blocked;
        const projectRoot = project.workspaceRoot as string;
        try {
          return await agentNative.lspDiagnostics(
            projectRoot,
            resolvePath(path, project),
          );
        } catch (e) {
          return { error: String(e), root: projectRoot };
        }
      },
    }),
    lsp_definition: tool({
      description:
        "Ask the optional lazy language server for bounded definition locations at one source position.",
      inputSchema: z.object(positionSchema),
      execute: ({ path, line, character }) =>
        semanticRequest(ctx, path, {
          operation: "definition",
          line,
          character,
        }),
    }),
    lsp_references: tool({
      description:
        "Ask the optional lazy language server for bounded reference locations at one source position, including declarations.",
      inputSchema: z.object(positionSchema),
      execute: ({ path, line, character }) =>
        semanticRequest(ctx, path, {
          operation: "references",
          line,
          character,
        }),
    }),
    lsp_hover: tool({
      description:
        "Ask the optional lazy language server for bounded hover information at one source position.",
      inputSchema: z.object(positionSchema),
      execute: ({ path, line, character }) =>
        semanticRequest(ctx, path, {
          operation: "hover",
          line,
          character,
        }),
    }),
    lsp_document_symbols: tool({
      description:
        "Ask the optional lazy language server for bounded symbols in one source document.",
      inputSchema: z.object({ path: z.string() }),
      execute: ({ path }) =>
        semanticRequest(ctx, path, { operation: "document_symbols" }),
    }),
    lsp_workspace_symbols: tool({
      description:
        "Ask the optional lazy language server selected by a source file for bounded workspace symbols matching a query.",
      inputSchema: z.object({
        path: z.string().describe("Source file used to select a language server."),
        query: z.string().max(1024).default(""),
      }),
      execute: ({ path, query }) =>
        semanticRequest(ctx, path, { operation: "workspace_symbols", query }),
    }),
  } as const;
}
