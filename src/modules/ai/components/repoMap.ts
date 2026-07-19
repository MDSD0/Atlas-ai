/**
 * Shared edge model + traversal for the repository Map. The old
 * The interactive graph model lives in repoGraphModel.ts. This module keeps
 * the edge shape and depth-bounded traversal used by the UI.
 */

import type { RepoMapEdge } from "@/modules/ai/lib/repoMapInsights";

export type { RepoMapEdge } from "@/modules/ai/lib/repoMapInsights";

/**
 * Local map: the set of node ids within `depth` edge hops of `centerId`.
 * Depth 0 is just the center; each hop follows edges in both directions
 * (a caller and a callee are both "one step away").
 */
export function neighborhood(
  edges: readonly RepoMapEdge[],
  centerId: string,
  depth: number,
): Set<string> {
  const reached = new Set<string>([centerId]);
  let frontier = new Set<string>([centerId]);
  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !reached.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !reached.has(edge.source)) next.add(edge.source);
    }
    if (next.size === 0) break;
    for (const id of next) reached.add(id);
    frontier = next;
  }
  return reached;
}
