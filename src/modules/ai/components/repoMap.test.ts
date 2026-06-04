import { describe, expect, it } from "vitest";
import type { RepoContextResponse } from "../lib/native";
import type { LocalMetricRecord } from "../metrics/contracts";
import type { ProofRun } from "../proof/contracts";
import { summarizeReliability } from "./reliabilitySummary";
import {
  buildRepoMap,
  MAX_REPO_MAP_EDGES,
  MAX_REPO_MAP_NODES,
} from "./repoMap";

function snapshot(
  patch: Partial<RepoContextResponse> = {},
): RepoContextResponse {
  return {
    root: "/repo",
    indexed_at_ms: 1,
    cache_hit: false,
    watch_status: "snapshot_ttl",
    rescan_bound_ms: 4_000,
    file_count: 2,
    symbol_count: 2,
    definition_count: 1,
    reference_count: 1,
    parse_failures: 0,
    skipped_dirs: 0,
    truncated: false,
    max_tokens: 2000,
    projected_tokens: 10,
    naive_tokens: 100,
    ranking_strategy: "aider_weighted_pagerank",
    graph_edge_count: 1,
    rank_iterations: 24,
    graph_relations: [
      { source: "src/main.ts", target: "src/cart.ts", symbol: "calculateTotal", weight: 10 },
    ],
    included_files: ["src/cart.ts", "src/main.ts"],
    excluded_files: 0,
    degraded_files: [],
    matches: [],
    context: "",
    ...patch,
  };
}

function run(id: string, status: ProofRun["status"]): ProofRun {
  return {
    id,
    sessionId: "session",
    workspaceRoot: "/repo",
    startedAt: 1,
    finishedAt: status === "running" ? null : 2,
    status,
    nextSequence: 1,
    events: [],
    eventsDropped: 0,
    artifacts: [],
    artifactsDropped: 0,
    verdict: null,
  };
}

describe("buildRepoMap", () => {
  it("uses native weighted relationships and stable positions", () => {
    const first = buildRepoMap(snapshot(), "calculate");
    const second = buildRepoMap(snapshot(), "calculate");

    expect(first).toEqual(second);
    expect(first.edges).toHaveLength(1);
    expect(first.nodes.map((node) => node.id)).toEqual([
      "src/main.ts",
      "src/cart.ts",
    ]);
    expect(first.nodes.every((node) => node.focused)).toBe(true);
  });

  it("caps large overview projections", () => {
    const relations = Array.from({ length: 100 }, (_, index) => ({
      source: `src/${index}.ts`,
      target: `src/${index + 1}.ts`,
      symbol: `symbol${index}`,
      weight: 1,
    }));
    const map = buildRepoMap(snapshot({ included_files: [], graph_relations: relations }));

    expect(map.nodes.length).toBeLessThanOrEqual(MAX_REPO_MAP_NODES);
    expect(map.edges.length).toBeLessThanOrEqual(MAX_REPO_MAP_EDGES);
  });
});

describe("summarizeReliability", () => {
  it("reports verified ratio and failed tool measurements", () => {
    const metrics: LocalMetricRecord[] = [
      {
        id: "metric-1",
        name: "tool.completed",
        value: 2,
        unit: "count",
        attributes: { status: "failed" },
        recordedAt: 1,
      },
    ];

    expect(
      summarizeReliability(
        [run("verified", "verified"), run("failed", "failed"), run("live", "running")],
        metrics,
      ),
    ).toEqual({
      finishedRuns: 2,
      verifiedRuns: 1,
      softPassRuns: 0,
      failedRuns: 1,
      incompleteRuns: 0,
      verifiedRatio: 50,
      toolFailures: 2,
    });
  });
});
