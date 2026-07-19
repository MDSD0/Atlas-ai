import { describe, expect, it } from "vitest";
import type { RepoContextResponse } from "../lib/native";
import {
  exactSymbolMatches,
  impactCandidateFiles,
  summarizeRepoStatus,
} from "./reality";
import { buildRepoMapHealth } from "@/modules/ai/lib/repoMapInsights";

const RESPONSE: RepoContextResponse = {
  root: "/repo",
  indexed_at_ms: 1,
  cache_hit: true,
  watch_status: "snapshot_ttl",
  rescan_bound_ms: 4_000,
  file_count: 3,
  symbol_count: 4,
  definition_count: 2,
  reference_count: 2,
  parse_failures: 1,
  skipped_dirs: 2,
  truncated: false,
  max_tokens: 256,
  projected_tokens: 40,
  naive_tokens: 100,
  ranking_strategy: "aider_weighted_pagerank",
  graph_edge_count: 3,
  rank_iterations: 24,
  graph_relations: [
    { source: "/repo/b.ts", target: "/repo/a.ts", symbol: "Widget", weight: 10 },
  ],
  included_files: ["/repo/a.ts", "/repo/b.ts"],
  excluded_files: 1,
  degraded_files: [{ path: "/repo/c.ts", status: "parse_failed" }],
  matches: [
    {
      path: "/repo/a.ts",
      name: "Widget",
      kind: "function",
      line: 1,
      is_definition: true,
    },
    {
      path: "/repo/b.ts",
      name: "widget",
      kind: "reference",
      line: 3,
      is_definition: false,
    },
    {
      path: "/repo/c.ts",
      name: "WidgetFactory",
      kind: "function",
      line: 5,
      is_definition: true,
    },
  ],
  context: "bounded projection",
};

describe("repo reality helpers", () => {
  it("keeps exact case-insensitive symbol matches only", () => {
    expect(exactSymbolMatches(RESPONSE, "Widget")).toHaveLength(2);
  });

  it("returns bounded unique impact files", () => {
    expect(impactCandidateFiles(RESPONSE, "Widget")).toEqual([
      "/repo/a.ts",
      "/repo/b.ts",
    ]);
  });

  it("summarizes freshness without returning broad context", () => {
    const summary = summarizeRepoStatus(RESPONSE);
    expect(summary.watch_status).toBe("snapshot_ttl");
    expect(summary.degraded_files).toHaveLength(1);
    expect(summary.ranking_strategy).toBe("aider_weighted_pagerank");
    expect(summary.map_health.visible_relation_count).toBe(1);
    expect(summary).not.toHaveProperty("context");
  });

  it("gives the agent bounded coupling and coverage signals", () => {
    const health = buildRepoMapHealth({
      ...RESPONSE,
      graph_edge_count: 4,
      included_files: [
        "src/modules/ai/tool.ts",
        "src/app/pane.ts",
        "src/app/isolated.ts",
      ],
      graph_relations: [
        {
          source: "src/modules/ai/tool.ts",
          target: "src/app/pane.ts",
          symbol: "openPane",
          weight: 10,
        },
      ],
    });

    expect(health.cross_module_relation_count).toBe(1);
    expect(health.cross_module_hotspots.map((entry) => entry.module)).toEqual([
      "src/app",
      "src/modules/ai",
    ]);
    expect(health.isolated_in_projection).toEqual(["src/app/isolated.ts"]);
    expect(health.relationship_list_truncated).toBe(true);
    expect(health.interpretation).toContain("not proof");
  });
});
