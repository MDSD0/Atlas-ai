import type { RepoContextResponse } from "@/modules/ai/lib/native";
import {
  classifyRepoMapEdges,
  isolatedProjectionFiles,
  topModule,
  type ClassifiedRepoMapEdge,
} from "@/modules/ai/lib/repoMapInsights";

export const REPO_GRAPH_WIDTH = 2200;
export const REPO_GRAPH_HEIGHT = 1000;

export type RepoGraphForces = {
  cluster: number;
  repel: number;
  link: number;
  distance: number;
};

export const DEFAULT_REPO_GRAPH_FORCES: RepoGraphForces = {
  cluster: 0.9,
  repel: 1,
  link: 0.8,
  distance: 90,
};

export type RepoGraphNode = {
  id: string;
  label: string;
  module: string;
  colorIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  degree: number;
  degraded: boolean;
  isolated: boolean;
  fixed: boolean;
};

export type RepoGraphModule = {
  id: string;
  branchId: string;
  colorIndex: number;
  x: number;
  y: number;
  nodeIds: string[];
};

export type RepoGraphBranch = {
  id: string;
  label: string;
  parentId: string | null;
  depth: number;
  x: number;
  y: number;
  leaf: boolean;
  colorIndex: number;
};

export type RepoGraphModel = {
  nodes: RepoGraphNode[];
  edges: ClassifiedRepoMapEdge[];
  modules: RepoGraphModule[];
  branches: RepoGraphBranch[];
  byId: Map<string, RepoGraphNode>;
  moduleById: Map<string, RepoGraphModule>;
  branchById: Map<string, RepoGraphBranch>;
};

export type RepoGraphView = {
  x: number;
  y: number;
  scale: number;
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function hashPath(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function graphModule(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts[0] === "src" && parts[1] === "modules" && parts.length > 4) {
    return parts.slice(0, 4).join("/");
  }
  if (
    parts[0] === "src-tauri" &&
    parts[1] === "src" &&
    parts[2] === "modules" &&
    parts.length > 5
  ) {
    return parts.slice(0, 5).join("/");
  }
  return topModule(path);
}

function buildHierarchy(
  moduleEntries: readonly (readonly [string, string[]])[],
): {
  branches: RepoGraphBranch[];
  branchById: Map<string, RepoGraphBranch>;
  moduleBranchId: Map<string, string>;
} {
  const root: RepoGraphBranch = {
    id: "/",
    label: "repo",
    parentId: null,
    depth: 0,
    x: REPO_GRAPH_WIDTH / 2,
    y: 58,
    leaf: false,
    colorIndex: 0,
  };
  const branchById = new Map<string, RepoGraphBranch>([[root.id, root]]);
  const moduleColor = new Map(
    moduleEntries.map(([id], colorIndex) => [id, colorIndex]),
  );

  for (const [moduleId] of moduleEntries) {
    const parts = moduleId === "(root)" ? [moduleId] : moduleId.split("/");
    let parentId = root.id;
    for (let index = 0; index < parts.length; index += 1) {
      const id = parts.slice(0, index + 1).join("/");
      if (!branchById.has(id)) {
        branchById.set(id, {
          id,
          label: parts[index],
          parentId,
          depth: index + 1,
          x: 0,
          y: 0,
          leaf: false,
          colorIndex: moduleColor.get(moduleId) ?? 0,
        });
      }
      parentId = id;
    }
  }

  const children = new Map<string, RepoGraphBranch[]>();
  for (const branch of branchById.values()) {
    if (!branch.parentId) continue;
    const siblings = children.get(branch.parentId);
    if (siblings) siblings.push(branch);
    else children.set(branch.parentId, [branch]);
  }
  const moduleBranchId = new Map<string, string>();
  for (const [moduleId] of moduleEntries) {
    const branch = branchById.get(moduleId);
    if (!branch) continue;
    branch.colorIndex = moduleColor.get(moduleId) ?? 0;
    if ((children.get(moduleId)?.length ?? 0) === 0) {
      branch.leaf = true;
      moduleBranchId.set(moduleId, branch.id);
      continue;
    }
    const terminal: RepoGraphBranch = {
      id: `@module:${moduleId}`,
      label: branch.label,
      parentId: branch.id,
      depth: branch.depth + 1,
      x: 0,
      y: 0,
      leaf: true,
      colorIndex: moduleColor.get(moduleId) ?? 0,
    };
    branchById.set(terminal.id, terminal);
    children.set(branch.id, [...(children.get(branch.id) ?? []), terminal]);
    moduleBranchId.set(moduleId, terminal.id);
  }

  const leaves = [...branchById.values()]
    .filter((branch) => branch.leaf)
    .sort((left, right) => left.id.localeCompare(right.id));
  const left = 110;
  const right = REPO_GRAPH_WIDTH - 110;
  for (let index = 0; index < leaves.length; index += 1) {
    leaves[index].x =
      leaves.length <= 1
        ? REPO_GRAPH_WIDTH / 2
        : left + (index / (leaves.length - 1)) * (right - left);
    leaves[index].y = 420;
  }
  const maxDepth = Math.max(1, ...leaves.map((branch) => branch.depth));
  const placeBranch = (branch: RepoGraphBranch): number => {
    if (branch.leaf) return branch.x;
    const descendants = children.get(branch.id) ?? [];
    const positions = descendants.map(placeBranch);
    branch.x =
      positions.length > 0
        ? positions.reduce((sum, position) => sum + position, 0) / positions.length
        : REPO_GRAPH_WIDTH / 2;
    branch.y = 58 + (branch.depth / maxDepth) * 285;
    return branch.x;
  };
  placeBranch(root);

  const branches = [...branchById.values()].sort(
    (leftBranch, rightBranch) =>
      leftBranch.depth - rightBranch.depth || leftBranch.x - rightBranch.x,
  );
  return { branches, branchById, moduleBranchId };
}

export function buildRepoGraphModel(
  snapshot: RepoContextResponse,
  maxNodes = 180,
): RepoGraphModel {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    if (!path || seen.has(path) || ids.length >= maxNodes) return;
    seen.add(path);
    ids.push(path);
  };

  for (const edge of snapshot.graph_relations) {
    add(edge.source);
    add(edge.target);
  }
  for (const path of snapshot.included_files) add(path);

  const edges = classifyRepoMapEdges(
    snapshot.graph_relations.filter(
      (edge) => seen.has(edge.source) && seen.has(edge.target),
    ),
  );
  const isolated = isolatedProjectionFiles(ids, edges);
  const degraded = new Set(snapshot.degraded_files.map((file) => file.path));
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const grouped = new Map<string, string[]>();
  for (const id of ids) {
    const module = graphModule(id);
    const members = grouped.get(module);
    if (members) members.push(id);
    else grouped.set(module, [id]);
  }

  const moduleEntries = [...grouped.entries()].sort(
    ([aName, aFiles], [bName, bFiles]) =>
      bFiles.length - aFiles.length || aName.localeCompare(bName),
  );
  const { branches, branchById, moduleBranchId } = buildHierarchy(moduleEntries);
  const modules: RepoGraphModule[] = moduleEntries.map(
    ([id, nodeIds], index) => ({
      id,
      branchId: moduleBranchId.get(id) ?? id,
      colorIndex: index,
      x: branchById.get(moduleBranchId.get(id) ?? id)?.x ?? REPO_GRAPH_WIDTH / 2,
      y: branchById.get(moduleBranchId.get(id) ?? id)?.y ?? REPO_GRAPH_HEIGHT / 2,
      nodeIds,
    }),
  );
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const modulePosition = new Map<string, number>();

  const nodes = ids.map((id) => {
    const module = graphModule(id);
    const anchor = moduleById.get(module) ?? modules[0];
    const index = modulePosition.get(module) ?? 0;
    modulePosition.set(module, index + 1);
    const seed = hashPath(id);
    const angle = ((seed % 360) * Math.PI) / 180 + index * 2.399963229728653;
    const spread = 18 + Math.sqrt(index + 1) * 24;
    const nodeDegree = degree.get(id) ?? 0;
    return {
      id,
      label: basename(id),
      module,
      colorIndex: anchor?.colorIndex ?? 0,
      x: (anchor?.x ?? REPO_GRAPH_WIDTH / 2) + Math.cos(angle) * spread,
      y: (anchor?.y ?? REPO_GRAPH_HEIGHT / 2) + Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
      radius: 4.5 + Math.min(7.5, Math.sqrt(nodeDegree) * 1.8),
      degree: nodeDegree,
      degraded: degraded.has(id),
      isolated: isolated.has(id),
      fixed: false,
    } satisfies RepoGraphNode;
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const model = {
    nodes,
    edges,
    modules,
    branches,
    byId,
    moduleById,
    branchById,
  };

  for (let step = 0; step < 36; step += 1) {
    advanceRepoGraph(model, DEFAULT_REPO_GRAPH_FORCES, 0.85);
  }
  return model;
}

export function advanceRepoGraph(
  model: RepoGraphModel,
  forces: RepoGraphForces,
  alpha = 1,
): number {
  const { nodes } = model;

  for (const node of nodes) {
    if (node.fixed) continue;
    const anchor = model.moduleById.get(node.module);
    if (anchor) {
      node.vx += (anchor.x - node.x) * 0.0048 * forces.cluster * alpha;
      node.vy += (anchor.y - node.y) * 0.0048 * forces.cluster * alpha;
    }
    node.vx += (REPO_GRAPH_WIDTH / 2 - node.x) * 0.00008 * alpha;
    node.vy += (REPO_GRAPH_HEIGHT / 2 - node.y) * 0.00008 * alpha;
  }

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex];
      let dx = right.x - left.x;
      let dy = right.y - left.y;
      let distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 1) {
        dx = 0.5;
        dy = 0.5;
        distanceSquared = 0.5;
      }
      const distance = Math.sqrt(distanceSquared);
      const moduleFactor = left.module === right.module ? 1 : 0.24;
      const strength =
        (forces.repel * 620 * moduleFactor * alpha) / distanceSquared;
      const fx = (dx / distance) * strength;
      const fy = (dy / distance) * strength;
      if (!left.fixed) {
        left.vx -= fx;
        left.vy -= fy;
      }
      if (!right.fixed) {
        right.vx += fx;
        right.vy += fy;
      }
    }
  }

  for (const edge of model.edges) {
    const source = model.byId.get(edge.source);
    const target = model.byId.get(edge.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desired = forces.distance * (edge.kind === "cross" ? 1.45 : 1);
    const edgeFactor = edge.kind === "cross" ? 0.32 : 1;
    const strength =
      (distance - desired) * 0.0038 * edgeFactor * forces.link * alpha;
    const fx = (dx / distance) * strength;
    const fy = (dy / distance) * strength;
    if (!source.fixed) {
      source.vx += fx;
      source.vy += fy;
    }
    if (!target.fixed) {
      target.vx -= fx;
      target.vy -= fy;
    }
  }

  let energy = 0;
  for (const node of nodes) {
    if (node.fixed) continue;
    node.vx = Math.max(-10, Math.min(10, node.vx * 0.84));
    node.vy = Math.max(-10, Math.min(10, node.vy * 0.84));
    node.x = Math.max(30, Math.min(REPO_GRAPH_WIDTH - 30, node.x + node.vx));
    node.y = Math.max(30, Math.min(REPO_GRAPH_HEIGHT - 30, node.y + node.vy));
    energy += Math.abs(node.vx) + Math.abs(node.vy);
  }
  return nodes.length > 0 ? energy / nodes.length : 0;
}

export function fitRepoGraphView(
  model: RepoGraphModel,
  width: number,
  height: number,
): RepoGraphView {
  if (model.nodes.length === 0 || width <= 0 || height <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }
  const xs = [
    ...model.nodes.map((node) => node.x),
    ...model.branches.map((branch) => branch.x),
  ];
  const ys = [
    ...model.nodes.map((node) => node.y),
    ...model.branches.map((branch) => branch.y),
  ];
  const minX = Math.min(...xs) - 100;
  const maxX = Math.max(...xs) + 100;
  const minY = Math.min(...ys) - 80;
  const maxY = Math.max(...ys) + 80;
  const scale = Math.max(
    0.25,
    Math.min(1.35, width / (maxX - minX), height / (maxY - minY)),
  );
  return {
    x: (width - (minX + maxX) * scale) / 2,
    y: (height - (minY + maxY) * scale) / 2,
    scale,
  };
}

export function hitTestRepoGraph(
  model: RepoGraphModel,
  x: number,
  y: number,
  visible: ReadonlySet<string> | null,
  showIsolated: boolean,
): RepoGraphNode | null {
  let closest: RepoGraphNode | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const node of model.nodes) {
    if ((visible && !visible.has(node.id)) || (!showIsolated && node.isolated)) {
      continue;
    }
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance <= node.radius + 8 && distance < closestDistance) {
      closest = node;
      closestDistance = distance;
    }
  }
  return closest;
}
