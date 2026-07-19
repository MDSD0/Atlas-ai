import { tool } from "ai";
import { z } from "zod";
import {
  localRecords,
  memorySurface,
  simpleMemConfig,
  type MemoryRecordKind,
} from "@/modules/ai/memory";
import { agentNative } from "@/modules/ai/lib/native";
import {
  checkFileAccessAllowed,
  resolvePath,
  validateWithinWorkspace,
  type ToolContext,
} from "@/modules/ai/tools/context";

const memoryKind = z.enum([
  "fact",
  "instruction",
  "preference",
  "decision",
  "run_summary",
]);

function projectRoot(ctx: ToolContext): string | { error: string } {
  const project = ctx.getProjectContext();
  const blocked = checkFileAccessAllowed(project);
  return blocked ?? (project.workspaceRoot as string);
}

async function sourceArtifacts(
  ctx: ToolContext,
  paths: readonly string[],
): Promise<string[]> {
  const project = ctx.getProjectContext();
  const root = project.workspaceRoot as string;
  const canonicalize = (path: string) => agentNative.canonicalize(path, root);
  const resolved: string[] = [];
  for (const path of paths) {
    const abs = resolvePath(path, project);
    const boundary = await validateWithinWorkspace(abs, project, canonicalize, ctx.getApprovalMode());
    if (!boundary.ok) throw new Error(boundary.reason);
    resolved.push(await canonicalize(abs));
  }
  return resolved;
}

async function simpleMemAdapter(forceEnabled = false) {
  return simpleMemConfig.adapter({
    forceEnabled: forceEnabled ? true : undefined,
  });
}

export function buildMemoryTools(ctx: ToolContext) {
  return {
    memory_status: tool({
      description:
        "Inspect project-memory health in one call: local record stats, the .atlas/memory filesystem surface, and SimpleMem sidecar status. Set probe_simplemem only when the sidecar should be actively health-checked.",
      inputSchema: z.object({
        probe_simplemem: z.boolean().optional(),
      }),
      execute: async ({ probe_simplemem }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        const [stats, adapter, config, surface] = await Promise.all([
          localRecords.stats(root),
          simpleMemAdapter(probe_simplemem),
          simpleMemConfig.get(),
          memorySurface.status(root).catch(() => null),
        ]);
        return {
          default_provider: "local_records",
          local_records: stats,
          memory_surface: surface,
          simplemem_config: config,
          simplemem: await adapter.health(),
        };
      },
    }),

    memory_surface_enable: tool({
      description:
        "Create and enable the managed .atlas/memory filesystem surface after explicit user approval. Initializes a small editable MEMORY.md index plus topics/, sessions/, and work-packets/ directories. Existing readable MEMORY.md content is preserved.",
      // Plain z.boolean() rather than z.literal(true): some providers (Gemini)
      // reject a boolean-valued JSON Schema enum outright. `confirm` must
      // still be explicitly true to proceed — enforced in execute() below.
      inputSchema: z.object({ confirm: z.boolean() }),
      needsApproval: true,
      execute: async ({ confirm }) => {
        if (!confirm) return { error: "confirm must be true to proceed" };
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        try {
          return await memorySurface.enable(root);
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    memory_recall: tool({
      description:
        "Recall project memory: typed local records, past-session summaries, and (when the SimpleMem sidecar is enabled) semantic matches — merged in one call with sources labeled. Recalled memory is advisory only; current repository evidence always wins.",
      inputSchema: z.object({
        query: z.string().default(""),
        scope: z
          .enum(["facts", "sessions", "all"])
          .optional()
          .describe("facts = typed records only; sessions = past-run summaries; all (default) = both."),
        include_stale: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ query, scope, include_stale, limit }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        const effScope = scope ?? "all";
        const [records, sessions, simplemem] = await Promise.all([
          effScope !== "sessions"
            ? localRecords.recall({
                projectId: root,
                query,
                includeStale: include_stale,
                limit,
              })
            : Promise.resolve(null),
          effScope !== "facts" && query.trim()
            ? memorySurface
                .searchSessions(root, query, Math.min(limit ?? 5, 10))
                .catch(() => null)
            : Promise.resolve(null),
          effScope !== "sessions" && query.trim()
            ? (async () => {
                const config = await simpleMemConfig.get();
                if (!config.enabled) return null;
                const adapter = await simpleMemAdapter();
                return adapter.search({ query, topK: Math.min(limit ?? 5, 10) });
              })().catch(() => null)
            : Promise.resolve(null),
        ]);
        return {
          advisory:
            "Memory is advisory. Verify against current repository state before acting on it.",
          ...(records !== null ? { records } : {}),
          ...(sessions !== null ? { session_matches: sessions } : {}),
          ...(simplemem !== null ? { simplemem_matches: simplemem } : {}),
        };
      },
    }),

    memory_forget: tool({
      description:
        "Forget project memory: soft-delete one record by id, or clear all records for this project with all=true.",
      inputSchema: z.object({
        id: z.string().optional().describe("Record id to delete."),
        all: z
          .boolean()
          .optional()
          .describe("Set true to clear every record for this project."),
      }),
      needsApproval: true,
      execute: async ({ id, all }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        if (all) {
          return { provider: "local_records", cleared: await localRecords.clearProject(root) };
        }
        if (!id) return { error: "Provide a record id, or all=true." };
        return { provider: "local_records", id, deleted: await localRecords.delete(root, id) };
      },
    }),

    memory_remember: tool({
      description:
        "Persist one explicit durable project fact, accepted user instruction, preference, decision, or successful run summary. Never store secrets, raw tool output, or guesses. Linked source artifacts become stale automatically after Atlas edits.",
      inputSchema: z.object({
        kind: memoryKind,
        content: z.string().min(1),
        source_run_id: z.string().optional(),
        source_artifacts: z.array(z.string()).max(20).optional(),
        confidence: z.number().min(0).max(1).optional(),
        tags: z.array(z.string()).max(12).optional(),
      }),
      needsApproval: true,
      execute: async ({
        kind,
        content,
        source_run_id,
        source_artifacts,
        confidence,
        tags,
      }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        try {
          return await localRecords.remember({
            projectId: root,
            kind: kind as MemoryRecordKind,
            content,
            sourceRunId: source_run_id,
            sourceArtifacts: await sourceArtifacts(ctx, source_artifacts ?? []),
            confidence,
            tags,
          });
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    memory_list: tool({
      description:
        "List inspectable Atlas project-memory records, including provenance and stale labels.",
      inputSchema: z.object({
        include_deleted: z.boolean().optional(),
      }),
      execute: async ({ include_deleted }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return { provider: "local_records", records: await localRecords.list(root, include_deleted) };
      },
    }),

  } as const;
}

export function buildReadOnlyMemoryTools(ctx: ToolContext) {
  const tools = buildMemoryTools(ctx);
  return {
    memory_status: tools.memory_status,
    memory_recall: tools.memory_recall,
    memory_list: tools.memory_list,
  } as const;
}
