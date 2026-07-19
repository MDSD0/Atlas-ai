import type { RepoContextResponse } from "@/modules/ai/lib/native";

export type RepoMapEdge = RepoContextResponse["graph_relations"][number];

export type ClassifiedRepoMapEdge = RepoMapEdge & {
  kind: "internal" | "cross";
};

export type RepoMapHotspot = {
  module: string;
  incoming: number;
  outgoing: number;
  total: number;
};

export type RepoMapHealth = {
  basis: "bounded_symbol_reference_projection";
  visible_relation_count: number;
  reported_graph_edge_count: number;
  relationship_list_truncated: boolean;
  projection_truncated: boolean;
  cross_module_relation_count: number;
  cross_module_hotspots: RepoMapHotspot[];
  isolated_in_projection: string[];
  isolated_in_projection_count: number;
  degraded_file_count: number;
  interpretation: string;
};

const MAX_HOTSPOTS = 8;
const MAX_ISOLATED_FILES = 20;

export function topModule(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return "(root)";
  if (parts[0] === "src" && parts[1] === "modules" && parts.length > 3) {
    return parts.slice(0, 3).join("/");
  }
  if (
    parts[0] === "src-tauri" &&
    parts[1] === "src" &&
    parts[2] === "modules" &&
    parts.length > 4
  ) {
    return parts.slice(0, 4).join("/");
  }
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

export function classifyRepoMapEdges(
  edges: readonly RepoMapEdge[],
): ClassifiedRepoMapEdge[] {
  return edges.map((edge) => ({
    ...edge,
    kind: topModule(edge.source) === topModule(edge.target) ? "internal" : "cross",
  }));
}

export function isolatedProjectionFiles(
  ids: readonly string[],
  edges: readonly RepoMapEdge[],
): Set<string> {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return new Set(ids.filter((id) => !connected.has(id)));
}

export function buildRepoMapHealth(
  response: RepoContextResponse,
): RepoMapHealth {
  const classified = classifyRepoMapEdges(response.graph_relations);
  const crossModule = classified.filter((edge) => edge.kind === "cross");
  const counts = new Map<string, Omit<RepoMapHotspot, "module" | "total">>();

  for (const edge of crossModule) {
    const source = topModule(edge.source);
    const target = topModule(edge.target);
    const sourceCount = counts.get(source) ?? { incoming: 0, outgoing: 0 };
    const targetCount = counts.get(target) ?? { incoming: 0, outgoing: 0 };
    sourceCount.outgoing += 1;
    targetCount.incoming += 1;
    counts.set(source, sourceCount);
    counts.set(target, targetCount);
  }

  const isolated = [
    ...isolatedProjectionFiles(
      response.included_files,
      response.graph_relations,
    ),
  ].sort();

  return {
    basis: "bounded_symbol_reference_projection",
    visible_relation_count: response.graph_relations.length,
    reported_graph_edge_count: response.graph_edge_count,
    relationship_list_truncated:
      response.graph_edge_count > response.graph_relations.length,
    projection_truncated: response.truncated,
    cross_module_relation_count: crossModule.length,
    cross_module_hotspots: [...counts.entries()]
      .map(([module, count]) => ({
        module,
        ...count,
        total: count.incoming + count.outgoing,
      }))
      .sort((a, b) => b.total - a.total || a.module.localeCompare(b.module))
      .slice(0, MAX_HOTSPOTS),
    isolated_in_projection: isolated.slice(0, MAX_ISOLATED_FILES),
    isolated_in_projection_count: isolated.length,
    degraded_file_count: response.degraded_files.length,
    interpretation:
      "Isolated means no relation is visible in this bounded result. It is not proof of dead or uncalled code; truncated relations and parse failures can hide links.",
  };
}
