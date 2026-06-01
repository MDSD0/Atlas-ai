import { tool } from "ai";
import { z } from "zod";
import { agentNative, type RepoContextResponse } from "../lib/native";
import { checkFileAccessAllowed, type ToolContext } from "./context";

type RepoContextError = { error: string; root?: string };

async function fetchRepoContext(
  ctx: ToolContext,
  task: string,
  maxTokens?: number,
): Promise<RepoContextResponse | RepoContextError> {
  const project = ctx.getProjectContext();
  const blocked = checkFileAccessAllowed(project);
  if (blocked) return blocked;
  const projectRoot = project.workspaceRoot as string;
  try {
    return await agentNative.repoContext(task, projectRoot, maxTokens);
  } catch (e) {
    return { error: String(e), root: projectRoot };
  }
}

function isRepoContextError(
  response: RepoContextResponse | RepoContextError,
): response is RepoContextError {
  return "error" in response;
}

export function exactSymbolMatches(
  response: RepoContextResponse,
  symbol: string,
) {
  const normalized = symbol.trim().toLowerCase();
  return response.matches
    .filter((match) => match.name.toLowerCase() === normalized)
    .slice(0, 100);
}

export function impactCandidateFiles(
  response: RepoContextResponse,
  symbol: string,
) {
  return [
    ...new Set([
      ...exactSymbolMatches(response, symbol).map((match) => match.path),
      ...response.included_files,
    ]),
  ].slice(0, 50);
}

export function summarizeRepoStatus(response: RepoContextResponse) {
  return {
    root: response.root,
    indexed_at_ms: response.indexed_at_ms,
    cache_hit: response.cache_hit,
    watch_status: response.watch_status,
    rescan_bound_ms: response.rescan_bound_ms,
    file_count: response.file_count,
    symbol_count: response.symbol_count,
    definition_count: response.definition_count,
    reference_count: response.reference_count,
    parse_failures: response.parse_failures,
    skipped_dirs: response.skipped_dirs,
    truncated: response.truncated,
    excluded_files: response.excluded_files,
    degraded_files: response.degraded_files,
  };
}

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
      execute: async ({ task, max_tokens }) =>
        fetchRepoContext(ctx, task, max_tokens),
    }),
    repo_status: tool({
      description:
        "Report repository inventory freshness, omissions, ignored directories, and parse degradation without returning broad file contents.",
      inputSchema: z.object({}),
      execute: async () => {
        const response = await fetchRepoContext(
          ctx,
          "repository inventory status",
          128,
        );
        return isRepoContextError(response)
          ? response
          : summarizeRepoStatus(response);
      },
    }),
    repo_map: tool({
      description:
        "Build a bounded task-specific repository map. Prefer this before edits when ownership is unclear.",
      inputSchema: z.object({
        task: z.string().min(1),
        max_tokens: z.number().int().min(128).max(4000).optional(),
      }),
      execute: async ({ task, max_tokens }) =>
        fetchRepoContext(ctx, task, max_tokens),
    }),
    find_symbol: tool({
      description:
        "Find exact repository symbol definitions and references from the fresh bounded repository projection.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        max_tokens: z.number().int().min(128).max(4000).optional(),
      }),
      execute: async ({ symbol, max_tokens }) => {
        const response = await fetchRepoContext(ctx, symbol, max_tokens);
        return isRepoContextError(response)
          ? response
          : {
              symbol,
              matches: exactSymbolMatches(response, symbol),
              repo_status: summarizeRepoStatus(response),
            };
      },
    }),
    find_references: tool({
      description:
        "Find exact repository references for a symbol from the fresh bounded repository projection.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        max_tokens: z.number().int().min(128).max(4000).optional(),
      }),
      execute: async ({ symbol, max_tokens }) => {
        const response = await fetchRepoContext(ctx, symbol, max_tokens);
        return isRepoContextError(response)
          ? response
          : {
              symbol,
              references: exactSymbolMatches(response, symbol).filter(
                (match) => !match.is_definition,
              ),
              repo_status: summarizeRepoStatus(response),
            };
      },
    }),
    impact_candidates: tool({
      description:
        "Suggest bounded files that may be affected by changing a repository symbol. This is evidence for planning, not a guarantee of completeness.",
      inputSchema: z.object({
        symbol: z.string().min(1),
        max_tokens: z.number().int().min(128).max(4000).optional(),
      }),
      execute: async ({ symbol, max_tokens }) => {
        const response = await fetchRepoContext(ctx, symbol, max_tokens);
        return isRepoContextError(response)
          ? response
          : {
              symbol,
              files: impactCandidateFiles(response, symbol),
              repo_status: summarizeRepoStatus(response),
            };
      },
    }),
  } as const;
}
