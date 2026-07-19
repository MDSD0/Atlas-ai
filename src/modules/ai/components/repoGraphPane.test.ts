import { describe, expect, it } from "vitest";
import type { RepoContextResponse } from "../lib/native";
import { neighborhood, type RepoMapEdge } from "./repoMap";
import {
  nodeEmphasis,
  repoGraphDetail,
  repoGraphModuleLabel,
} from "./RepoGraphPane";
import {
  classifyRepoMapEdges,
  isolatedProjectionFiles,
  topModule,
} from "@/modules/ai/lib/repoMapInsights";
import {
  advanceRepoGraph,
  buildRepoGraphModel,
  DEFAULT_REPO_GRAPH_FORCES,
  fitRepoGraphView,
  graphModule,
  hitTestRepoGraph,
} from "@/modules/ai/lib/repoGraphModel";

const edges: RepoMapEdge[] = [
  { source: "a.ts", target: "b.ts", symbol: "foo", weight: 1 },
  { source: "b.ts", target: "c.ts", symbol: "bar", weight: 1 },
  { source: "c.ts", target: "d.ts", symbol: "baz", weight: 1 },
];

describe("neighborhood (local map)", () => {
  it("depth 1 includes direct neighbors in both edge directions", () => {
    expect([...neighborhood(edges, "b.ts", 1)].sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("depth grows one hop at a time and stops when exhausted", () => {
    expect(neighborhood(edges, "a.ts", 2).has("c.ts")).toBe(true);
    expect(neighborhood(edges, "a.ts", 2).has("d.ts")).toBe(false);
    expect(neighborhood(edges, "a.ts", 9).has("d.ts")).toBe(true);
  });
});

describe("nodeEmphasis (hover > search > local priority)", () => {
  const sets = {
    hoverSet: new Set(["a.ts", "b.ts"]),
    searchSet: new Set(["c.ts"]),
    localSet: new Set(["d.ts"]),
  };

  it("hover wins: neighbors highlight, everything else fades", () => {
    expect(nodeEmphasis({ id: "a.ts", ...sets })).toBe("highlight");
    expect(nodeEmphasis({ id: "c.ts", ...sets })).toBe("faded");
  });

  it("search dims non-matches when not hovering", () => {
    expect(
      nodeEmphasis({ id: "c.ts", hoverSet: null, searchSet: sets.searchSet, localSet: null }),
    ).toBe("highlight");
    expect(
      nodeEmphasis({ id: "a.ts", hoverSet: null, searchSet: sets.searchSet, localSet: null }),
    ).toBe("faded");
  });

  it("no active sets renders everything normally", () => {
    expect(nodeEmphasis({ id: "a.ts", hoverSet: null, searchSet: null, localSet: null })).toBe(
      "normal",
    );
  });
});

describe("interactive graph model", () => {
  it("topModule groups by leading directories, root files together", () => {
    expect(topModule("src/modules/ai/agent.ts")).toBe("src/modules/ai");
    expect(topModule("src\\modules\\ai\\agent.ts")).toBe("src/modules/ai");
    expect(topModule("src-tauri/src/modules/reality/ranking.rs")).toBe(
      "src-tauri/src/modules/reality",
    );
    expect(topModule("README.md")).toBe("(root)");
  });

  it("splits dense feature folders without changing repository health semantics", () => {
    expect(graphModule("src/modules/ai/components/AiChat.tsx")).toBe(
      "src/modules/ai/components",
    );
    expect(graphModule("src/modules/ai/store/chatStore.ts")).toBe(
      "src/modules/ai/store",
    );
    expect(graphModule("src/modules/ai/agent.ts")).toBe("src/modules/ai");
    expect(graphModule("src/modules/editor/Editor.tsx")).toBe(
      "src/modules/editor",
    );
  });

  it("changes visible information density at stable zoom thresholds", () => {
    expect(repoGraphDetail(0.5)).toBe("architecture");
    expect(repoGraphDetail(0.9)).toBe("relationships");
    expect(repoGraphDetail(1.5)).toBe("files");
    expect(
      repoGraphModuleLabel("src/modules/ai/components", "architecture"),
    ).toBe("ai/components");
    expect(repoGraphModuleLabel("src/modules/ai/components", "files")).toBe(
      "src/modules/ai/components",
    );
  });

  it("classifyRepoMapEdges marks cross-module coupling distinctly", () => {
    const classified = classifyRepoMapEdges([
      { source: "src/app/x.ts", target: "src/app/y.ts", symbol: "s", weight: 1 },
      { source: "src/app/x.ts", target: "docs/guide/z.md", symbol: "s", weight: 1 },
    ]);
    expect(classified[0].kind).toBe("internal");
    expect(classified[1].kind).toBe("cross");
  });

  it("isolatedProjectionFiles finds files absent from visible relationships", () => {
    const isolated = isolatedProjectionFiles(
      ["a.ts", "b.ts", "lonely.ts"],
      edges.slice(0, 1),
    );
    expect(isolated.has("lonely.ts")).toBe(true);
    expect(isolated.has("a.ts")).toBe(false);
  });

  it("clusters files by module and carries degree and coverage state", () => {
    const snapshot = {
      included_files: ["src/app/main.ts", "src/app/util.ts", "docs/notes.md"],
      graph_relations: [
        { source: "src/app/main.ts", target: "src/app/util.ts", symbol: "helper", weight: 1 },
      ],
      degraded_files: [{ path: "docs/notes.md", status: "unsupported" }],
    } as unknown as RepoContextResponse;

    const map = buildRepoGraphModel(snapshot, 50);
    expect(map.modules.map((module) => module.id)).toEqual([
      "src/app",
      "docs",
    ]);
    const main = map.byId.get("src/app/main.ts")!;
    expect(main.degree).toBe(1);
    expect(main.radius).toBeGreaterThan(4.5);
    expect(map.byId.get("docs/notes.md")!.degraded).toBe(true);
    expect(map.byId.get("docs/notes.md")!.isolated).toBe(true);
    expect(main.isolated).toBe(false);
  });

  it("builds a fixed folder spine with separate leaves for parent modules", () => {
    const snapshot = {
      included_files: [
        "src/index.ts",
        "src/app/App.tsx",
        "src/modules/ai/agent.ts",
        "src/modules/editor/editor.ts",
      ],
      graph_relations: [],
      degraded_files: [],
    } as unknown as RepoContextResponse;

    const map = buildRepoGraphModel(snapshot, 20);
    expect(map.branchById.get("/")?.parentId).toBeNull();
    expect(map.branchById.get("src")?.parentId).toBe("/");
    expect(map.branchById.get("src/modules")?.parentId).toBe("src");
    expect(map.branchById.get("src/modules/ai")?.parentId).toBe("src/modules");

    const ai = map.branchById.get("src/modules/ai")!;
    const editor = map.branchById.get("src/modules/editor")!;
    const modules = map.branchById.get("src/modules")!;
    expect(modules.x).toBeCloseTo((ai.x + editor.x) / 2);
    expect(ai.y).toBeGreaterThan(modules.y);

    const srcModule = map.moduleById.get("src")!;
    const srcLeaf = map.branchById.get(srcModule.branchId)!;
    expect(srcLeaf.id).toBe("@module:src");
    expect(srcLeaf.parentId).toBe("src");
    expect(srcLeaf.y).toBeGreaterThan(map.branchById.get("src")!.y);
  });

  it("keeps dense AI subfolders in separate anchored clusters", () => {
    const snapshot = {
      included_files: [
        "src/modules/ai/agent.ts",
        "src/modules/ai/components/AiChat.tsx",
        "src/modules/ai/components/AiInputBar.tsx",
        "src/modules/ai/store/chatStore.ts",
        "src/modules/ai/tools/reality.ts",
      ],
      graph_relations: [],
      degraded_files: [],
    } as unknown as RepoContextResponse;

    const map = buildRepoGraphModel(snapshot, 20);
    expect(map.modules.map((module) => module.id)).toEqual([
      "src/modules/ai/components",
      "src/modules/ai",
      "src/modules/ai/store",
      "src/modules/ai/tools",
    ]);
    expect(map.byId.get("src/modules/ai/components/AiChat.tsx")?.module).toBe(
      "src/modules/ai/components",
    );
    for (const module of map.modules) {
      expect(map.branchById.has(module.branchId)).toBe(true);
    }
  });

  it("advances the force simulation and supports hit testing and fit", () => {
    const snapshot = {
      included_files: ["src/app/main.ts", "src/lib/util.ts"],
      graph_relations: [
        { source: "src/app/main.ts", target: "src/lib/util.ts", symbol: "util", weight: 1 },
      ],
      degraded_files: [],
    } as unknown as RepoContextResponse;
    const map = buildRepoGraphModel(snapshot, 20);
    const node = map.nodes[0];
    const before = { x: node.x, y: node.y };
    const energy = advanceRepoGraph(map, DEFAULT_REPO_GRAPH_FORCES);
    expect(Number.isFinite(energy)).toBe(true);
    expect(node.x === before.x && node.y === before.y).toBe(false);
    expect(hitTestRepoGraph(map, node.x, node.y, null, true)?.id).toBe(node.id);
    expect(fitRepoGraphView(map, 1000, 700).scale).toBeGreaterThan(0);
  });
});
