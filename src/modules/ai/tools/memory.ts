import { tool } from "ai";
import { z } from "zod";
import {
  buildMemoryLabReport,
  localRecords,
  probeSimpleMem,
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
    const boundary = await validateWithinWorkspace(abs, project, canonicalize);
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
        "Inspect Atlas project-memory status and provider health. LocalRecords is always the default. Set probe_simplemem only when the optional local SimpleMem sidecar should be health-checked.",
      inputSchema: z.object({
        probe_simplemem: z.boolean().optional(),
      }),
      execute: async ({ probe_simplemem }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        const [stats, adapter, config] = await Promise.all([
          localRecords.stats(root),
          simpleMemAdapter(probe_simplemem),
          simpleMemConfig.get(),
        ]);
        return {
          default_provider: "local_records",
          local_records: stats,
          simplemem_config: config,
          simplemem: await adapter.health(),
        };
      },
    }),

    memory_simplemem_configure: tool({
      description:
        "Configure the optional loopback-only SimpleMem Cross sidecar. This never installs or starts a provider. LocalRecords remains the offline default.",
      inputSchema: z.object({
        enabled: z.boolean().optional(),
        inject_context: z.boolean().optional(),
        base_url: z.string().optional(),
      }),
      needsApproval: true,
      execute: async ({ base_url, inject_context, ...input }) => {
        try {
          return await simpleMemConfig.configure({
            ...input,
            baseUrl: base_url,
            injectContext: inject_context,
          });
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    memory_simplemem_search: tool({
      description:
        "Search the explicitly enabled local SimpleMem Cross sidecar. Returned memory is advisory and current repository evidence still wins.",
      inputSchema: z.object({
        query: z.string().min(1),
        top_k: z.number().int().min(1).max(100).optional(),
        tenant_id: z.string().optional(),
      }),
      needsApproval: true,
      execute: async ({ top_k, tenant_id, ...input }) => {
        try {
          return await (await simpleMemAdapter()).search({
            ...input,
            topK: top_k,
            tenantId: tenant_id,
          });
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    memory_simplemem_stats: tool({
      description:
        "Inspect aggregate statistics from the explicitly enabled local SimpleMem Cross sidecar.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await (await simpleMemAdapter()).stats();
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    memory_simplemem_probe: tool({
      description:
        "Run an explicit write-and-retrieve MemoryLab sample against the enabled local SimpleMem Cross sidecar. This records a marker session and reports unsupported gates honestly.",
      inputSchema: z.object({}),
      needsApproval: true,
      execute: async () => {
        try {
          return await probeSimpleMem(await simpleMemAdapter());
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    memory_recall: tool({
      description:
        "Recall bounded Atlas project-memory hints. Recalled records are advisory only; inspect current repository evidence before using them for code answers.",
      inputSchema: z.object({
        query: z.string().default(""),
        include_stale: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ query, include_stale, limit }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return localRecords.recall({
          projectId: root,
          query,
          includeStale: include_stale,
          limit,
        });
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

    memory_delete: tool({
      description: "Soft-delete one Atlas project-memory record by id.",
      inputSchema: z.object({ id: z.string().min(1) }),
      needsApproval: true,
      execute: async ({ id }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return { provider: "local_records", id, deleted: await localRecords.delete(root, id) };
      },
    }),

    memory_clear_project: tool({
      description: "Clear all Atlas memory records for the bound project.",
      inputSchema: z.object({ confirm: z.literal(true) }),
      needsApproval: true,
      execute: async () => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        return { provider: "local_records", cleared: await localRecords.clearProject(root) };
      },
    }),

    memory_lab: tool({
      description:
        "Inspect the deterministic MemoryLab candidate report. Set probe_simplemem only to health-check the optional loopback SimpleMem sidecar.",
      inputSchema: z.object({
        probe_simplemem: z.boolean().optional(),
      }),
      execute: async ({ probe_simplemem }) => {
        const root = projectRoot(ctx);
        if (typeof root !== "string") return root;
        const [stats, adapter] = await Promise.all([
          localRecords.stats(root),
          simpleMemAdapter(probe_simplemem),
        ]);
        return buildMemoryLabReport(stats, await adapter.health());
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
    memory_simplemem_stats: tools.memory_simplemem_stats,
    memory_lab: tools.memory_lab,
  } as const;
}
