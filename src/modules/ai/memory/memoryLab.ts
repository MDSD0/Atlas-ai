import type { LocalMemoryStats } from "@/modules/ai/memory/contracts";
import type { SimpleMemHealth } from "@/modules/ai/memory/simpleMem";

export const MEMORY_LAB_FIXTURE = [
  {
    id: "repo-truth-active",
    query: "greeting punctuation",
    expected: "recall an active project fact",
  },
  {
    id: "repo-truth-stale",
    query: "stale greeting punctuation",
    expected: "exclude a linked record after its source artifact changes",
  },
  {
    id: "project-isolation",
    query: "other workspace fact",
    expected: "never return records from another project",
  },
] as const;

export type MemoryLabReport = {
  defaultProvider: "local_records";
  fixtureCases: number;
  localRecords: LocalMemoryStats;
  simpleMem: SimpleMemHealth;
  mem0: {
    provider: "mem0";
    status: "benchmark_only";
    optional: true;
    detail: string;
  };
  measures: string[];
  dryRunConsolidation: {
    provider: "local_records";
    status: "not_applicable";
    detail: string;
  };
};

export function buildMemoryLabReport(
  localRecords: LocalMemoryStats,
  simpleMem: SimpleMemHealth,
): MemoryLabReport {
  return {
    defaultProvider: "local_records",
    fixtureCases: MEMORY_LAB_FIXTURE.length,
    localRecords,
    simpleMem,
    mem0: {
      provider: "mem0",
      status: "benchmark_only",
      optional: true,
      detail: "candidate is not installed or used by Atlas boot",
    },
    measures: [
      "retrieval_precision",
      "stale_fact_rejection",
      "token_cost",
      "latency",
      "local_disk_growth",
      "provider_dependency",
      "privacy_posture",
      "consolidation_false_merges",
    ],
    dryRunConsolidation: {
      provider: "local_records",
      status: "not_applicable",
      detail: "LocalRecords does not merge records; advanced consolidation remains optional",
    },
  };
}
