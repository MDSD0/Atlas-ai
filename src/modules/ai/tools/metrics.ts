import { tool } from "ai";
import { z } from "zod";
import { inspectContext, localMetrics, recordLocalMetric } from "@/modules/ai/metrics";
import type { ToolContext } from "@/modules/ai/tools/context";

export function buildMetricsTools(ctx: ToolContext) {
  return {
    metrics_status: tool({
      description: "Inspect bounded Atlas-local runtime measurements. No telemetry is exported automatically.",
      inputSchema: z.object({}),
      execute: () => localMetrics.status(),
    }),
    metrics_export: tool({
      description: "Return a bounded local metric sample for explicit inspection. Detailed actions remain in proof receipts.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(500).optional() }),
      execute: async ({ limit }) => ({
        provider: "local_metrics",
        export: "explicit_local_only",
        records: await localMetrics.list(limit),
      }),
    }),
    context_inspector: tool({
      description: "Inspect compact on-demand status for repository reality, LSP, memory, skills, MCP, and the latest proof receipt.",
      inputSchema: z.object({ task: z.string().min(1).default("inspect current context") }),
      execute: async ({ task }) => {
        const startedAt = Date.now();
        const result = await inspectContext(ctx, task);
        recordLocalMetric({
          name: "context.inspect.duration",
          value: Date.now() - startedAt,
          unit: "ms",
          attributes: { status: "error" in result ? "blocked" : "ok" },
        });
        return result;
      },
    }),
  } as const;
}
