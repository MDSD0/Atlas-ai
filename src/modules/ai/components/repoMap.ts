import type { RepoContextResponse } from "../lib/native";

export const MAX_REPO_MAP_NODES = 24;
export const MAX_REPO_MAP_EDGES = 40;

export type RepoMapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  degree: number;
  included: boolean;
  focused: boolean;
};

export type RepoMapEdge = {
  source: string;
  target: string;
  symbol: string;
  weight: number;
};

export type RepoMap = {
  nodes: RepoMapNode[];
  edges: RepoMapEdge[];
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function matchesFocus(path: string, focus: string): boolean {
  return focus.length > 0 && path.toLowerCase().includes(focus);
}

export function buildRepoMap(
  snapshot: RepoContextResponse,
  focus = "",
): RepoMap {
  const normalizedFocus = focus.trim().toLowerCase();
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    if (!path || seen.has(path) || candidates.length >= MAX_REPO_MAP_NODES) return;
    seen.add(path);
    candidates.push(path);
  };

  for (const path of snapshot.included_files) {
    if (matchesFocus(path, normalizedFocus)) add(path);
  }
  for (const relation of snapshot.graph_relations) {
    if (matchesFocus(relation.symbol, normalizedFocus)) {
      add(relation.source);
      add(relation.target);
    }
  }
  for (const path of snapshot.included_files) add(path);
  for (const relation of snapshot.graph_relations) {
    add(relation.source);
    add(relation.target);
  }

  const visible = new Set(candidates);
  const edges = snapshot.graph_relations
    .filter(
      (relation) =>
        visible.has(relation.source) && visible.has(relation.target),
    )
    .slice(0, MAX_REPO_MAP_EDGES);
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const centerX = 140;
  const centerY = 92;
  const radius = Math.min(72, Math.max(34, candidates.length * 4));
  const nodes = candidates.map((id, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, candidates.length) - Math.PI / 2;
    return {
      id,
      label: basename(id),
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      degree: degree.get(id) ?? 0,
      included: snapshot.included_files.includes(id),
      focused:
        matchesFocus(id, normalizedFocus) ||
        (normalizedFocus.length > 0 &&
          edges.some(
            (edge) =>
              edge.symbol.toLowerCase().includes(normalizedFocus) &&
              (edge.source === id || edge.target === id),
          )),
    };
  });

  return { nodes, edges };
}
