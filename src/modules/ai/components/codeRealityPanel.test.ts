import { describe, expect, it } from "vitest";
import { formatRealityStats, freshnessLabel } from "./CodeRealityPanel";
import type { RepoContextResponse } from "../lib/native";

function snap(patch: Partial<RepoContextResponse> = {}): RepoContextResponse {
  return {
    root: "/repo",
    indexed_at_ms: Date.now(),
    cache_hit: false,
    watch_status: "watching",
    rescan_bound_ms: 4000,
    file_count: 1284,
    symbol_count: 9842,
    definition_count: 4000,
    reference_count: 5842,
    parse_failures: 0,
    skipped_dirs: 42,
    truncated: false,
    max_tokens: 2000,
    projected_tokens: 800,
    naive_tokens: 80000,
    ranking_strategy: "aider_weighted_pagerank",
    graph_edge_count: 2048,
    rank_iterations: 24,
    graph_relations: [],
    included_files: [],
    excluded_files: 3120,
    degraded_files: [],
    matches: [],
    context: "",
    ...patch,
  };
}

describe("formatRealityStats", () => {
  it("reports inventory counts with thousands separators", () => {
    const stats = formatRealityStats(snap());
    expect(stats[0]).toMatchObject({ label: "Files scanned", value: "1,284" });
    expect(stats[1]).toMatchObject({ label: "Symbols", value: "9,842" });
  });

  it("computes the context saving vs naive token loading", () => {
    // 800 projected vs 80000 naive => 99% saving.
    const saving = formatRealityStats(snap())[3];
    expect(saving.label).toBe("Context saving");
    expect(saving.value).toBe("99%");
  });

  it("never divides by zero when nothing was projected", () => {
    const saving = formatRealityStats(
      snap({ projected_tokens: 0, naive_tokens: 0 }),
    )[3];
    expect(saving.value).toBe("0%");
  });
});

describe("freshnessLabel", () => {
  it("reads as just-indexed when fresh", () => {
    expect(freshnessLabel(snap({ indexed_at_ms: Date.now() }))).toBe("just now");
  });

  it("reports minutes for older snapshots", () => {
    expect(
      freshnessLabel(snap({ indexed_at_ms: Date.now() - 120_000 })),
    ).toBe("2m ago");
  });
});
