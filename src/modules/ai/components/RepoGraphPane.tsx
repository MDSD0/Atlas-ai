import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Crosshair as FocusIcon,
  ExternalLink as OpenIcon,
  FilePlus2 as AttachIcon,
  LocateFixed as FitIcon,
  MessageSquare as AskIcon,
  Network as GraphIcon,
  RefreshCw as RefreshIcon,
  RotateCcw as ResetIcon,
  Search as SearchIcon,
  SlidersHorizontal as SettingsIcon,
  X as ClearIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { useRealityStore } from "@/modules/ai/store/realityStore";
import { useWorkspaceStore } from "@/modules/workspace/workspaceStore";
import {
  advanceRepoGraph,
  buildRepoGraphModel,
  DEFAULT_REPO_GRAPH_FORCES,
  fitRepoGraphView,
  hitTestRepoGraph,
  type RepoGraphForces,
  type RepoGraphModel,
  type RepoGraphNode,
  type RepoGraphView,
} from "@/modules/ai/lib/repoGraphModel";
import { neighborhood, type RepoMapEdge } from "@/modules/ai/components/repoMap";
import {
  freshnessLabel,
  resolveRepoDisplayPath,
} from "@/modules/ai/components/CodeRealityPanel";

const MAX_NODES = 180;
const MIN_SCALE = 0.28;
const MAX_SCALE = 3.4;
const MODULE_COLORS = [
  "#9cff00",
  "#37d9b8",
  "#a78bfa",
  "#5ca7ff",
  "#f0a35b",
  "#eb6f92",
  "#d7d85b",
  "#62c4d6",
];

type Emphasis = "normal" | "highlight" | "faded";

export function nodeEmphasis(input: {
  id: string;
  hoverSet: Set<string> | null;
  searchSet: Set<string> | null;
  localSet: Set<string> | null;
}): Emphasis {
  const { id, hoverSet, searchSet, localSet } = input;
  if (hoverSet) return hoverSet.has(id) ? "highlight" : "faded";
  if (searchSet) return searchSet.has(id) ? "highlight" : "faded";
  if (localSet) return localSet.has(id) ? "normal" : "faded";
  return "normal";
}

type DisplayOptions = {
  labels: boolean;
  isolated: boolean;
  arrows: boolean;
};

export type RepoGraphDetail = "architecture" | "relationships" | "files";

export function repoGraphDetail(scale: number): RepoGraphDetail {
  if (scale < 0.78) return "architecture";
  if (scale < 1.28) return "relationships";
  return "files";
}

export function repoGraphModuleLabel(
  moduleId: string,
  detail: RepoGraphDetail,
): string {
  if (moduleId === "(root)" || detail === "files") return moduleId;
  const parts = moduleId.split("/");
  return parts.length <= 2 ? moduleId : parts.slice(-2).join("/");
}

type LabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function claimLabel(occupied: LabelBox[], box: LabelBox): boolean {
  if (
    occupied.some(
      (other) =>
        box.left < other.right &&
        box.right > other.left &&
        box.top < other.bottom &&
        box.bottom > other.top,
    )
  ) {
    return false;
  }
  occupied.push(box);
  return true;
}

type PointerState =
  | {
      kind: "pan";
      pointerId: number;
      x: number;
      y: number;
    }
  | {
      kind: "node";
      pointerId: number;
      nodeId: string;
      startX: number;
      startY: number;
      moved: boolean;
    };

type RenderState = {
  canvas: HTMLCanvasElement;
  model: RepoGraphModel;
  view: RepoGraphView;
  hovered: string | null;
  selected: string | null;
  hoverSet: Set<string> | null;
  searchSet: Set<string> | null;
  localSet: Set<string> | null;
  display: DisplayOptions;
};

function cssColor(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

function hexAlpha(color: string, alpha: number): string {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) return color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawArrow(
  context: CanvasRenderingContext2D,
  source: RepoGraphNode,
  target: RepoGraphNode,
) {
  const angle = Math.atan2(target.y - source.y, target.x - source.x);
  const x = target.x - Math.cos(angle) * (target.radius + 5);
  const y = target.y - Math.sin(angle) * (target.radius + 5);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x - Math.cos(angle - 0.48) * 6, y - Math.sin(angle - 0.48) * 6);
  context.lineTo(x - Math.cos(angle + 0.48) * 6, y - Math.sin(angle + 0.48) * 6);
  context.closePath();
  context.fill();
}

function renderRepoGraph(state: RenderState) {
  const { canvas, model, view, hovered, selected, hoverSet, searchSet, localSet, display } = state;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const targetWidth = Math.round(rect.width * pixelRatio);
  const targetHeight = Math.round(rect.height * pixelRatio);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;

  const background = cssColor(canvas, "--background", "#050807");
  const foreground = cssColor(canvas, "--foreground", "#e8ece8");
  const muted = cssColor(canvas, "--muted-foreground", "#7c857f");
  const border = cssColor(canvas, "--border", "#202722");
  const brand = cssColor(canvas, "--brand", "#9cff00");
  const visibleNodes = model.nodes.filter(
    (node) =>
      (!localSet || localSet.has(node.id)) && (display.isolated || !node.isolated),
  );
  const visibleIds = new Set(visibleNodes.map((node) => node.id));

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(
    pixelRatio * view.scale,
    0,
    0,
    pixelRatio * view.scale,
    pixelRatio * view.x,
    pixelRatio * view.y,
  );
  context.lineCap = "round";
  const detail = repoGraphDetail(view.scale);
  const occupied: LabelBox[] = [];

  const visibleModules = new Set(visibleNodes.map((node) => node.module));
  const visibleBranches = new Set<string>();
  for (const moduleId of visibleModules) {
    const module = model.moduleById.get(moduleId);
    let branch = module ? model.branchById.get(module.branchId) : undefined;
    while (branch) {
      visibleBranches.add(branch.id);
      branch = branch.parentId ? model.branchById.get(branch.parentId) : undefined;
    }
  }
  const activeNode = model.byId.get(hovered ?? selected ?? "");
  const activeBranches = new Set<string>();
  const activeModule = activeNode ? model.moduleById.get(activeNode.module) : undefined;
  let activeBranch = activeModule
    ? model.branchById.get(activeModule.branchId)
    : undefined;
  while (activeBranch) {
    activeBranches.add(activeBranch.id);
    activeBranch = activeBranch.parentId
      ? model.branchById.get(activeBranch.parentId)
      : undefined;
  }

  for (const branch of model.branches) {
    if (!branch.parentId || !visibleBranches.has(branch.id)) continue;
    const parent = model.branchById.get(branch.parentId);
    if (!parent || !visibleBranches.has(parent.id)) continue;
    const active = activeBranches.has(branch.id);
    const color = active
      ? MODULE_COLORS[
          (activeNode?.colorIndex ?? branch.colorIndex) % MODULE_COLORS.length
        ]
      : muted;
    const middleY = parent.y + (branch.y - parent.y) * 0.52;
    context.beginPath();
    context.moveTo(parent.x, parent.y);
    context.bezierCurveTo(parent.x, middleY, branch.x, middleY, branch.x, branch.y);
    context.strokeStyle = active
      ? hexAlpha(color, 0.64)
      : hexAlpha(color, detail === "architecture" ? 0.26 : 0.14);
    context.lineWidth = (active ? 1.6 : 0.9) / view.scale;
    context.stroke();
  }

  for (const branch of model.branches) {
    if (branch.leaf || !visibleBranches.has(branch.id)) continue;
    const active = activeBranches.has(branch.id);
    context.beginPath();
    context.arc(branch.x, branch.y, active ? 3.4 : 2.6, 0, Math.PI * 2);
    context.fillStyle = active ? brand : hexAlpha(muted, 0.72);
    context.fill();
    const showLabel =
      active || branch.depth <= (detail === "files" ? 4 : 2);
    if (showLabel) {
      context.font = `${Math.max(9, 9.5 / view.scale)}px "JetBrains Mono", monospace`;
      const width = context.measureText(branch.label).width;
      const box = {
        left: branch.x + 8,
        right: branch.x + 12 + width,
        top: branch.y - 18,
        bottom: branch.y - 3,
      };
      if (active || claimLabel(occupied, box)) {
        if (active) occupied.push(box);
        context.fillStyle = active
          ? hexAlpha(brand, 0.9)
          : hexAlpha(muted, 0.72);
        context.fillText(branch.label, box.left, branch.y - 7);
      }
    }
  }

  for (const module of model.modules) {
    const members = module.nodeIds
      .map((id) => model.byId.get(id))
      .filter((node): node is RepoGraphNode => Boolean(node && visibleIds.has(node.id)));
    if (members.length === 0) continue;
    const color = MODULE_COLORS[module.colorIndex % MODULE_COLORS.length];
    const centroidX =
      members.reduce((sum, node) => sum + node.x, 0) / members.length;
    const centroidY =
      members.reduce((sum, node) => sum + node.y, 0) / members.length;
    context.beginPath();
    context.moveTo(module.x, module.y);
    context.lineTo(centroidX, centroidY);
    context.strokeStyle = hexAlpha(color, 0.22);
    context.lineWidth = 1 / view.scale;
    context.stroke();
  }

  for (const edge of model.edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
    const source = model.byId.get(edge.source);
    const target = model.byId.get(edge.target);
    if (!source || !target) continue;
    const focusActive = hovered
      ? edge.source === hovered || edge.target === hovered
      : selected
        ? edge.source === selected || edge.target === selected
        : false;
    const searchFaded = Boolean(
      searchSet && (!searchSet.has(edge.source) || !searchSet.has(edge.target)),
    );
    const hoverFaded = Boolean(
      hoverSet && (!hoverSet.has(edge.source) || !hoverSet.has(edge.target)),
    );
    const faded = searchFaded || hoverFaded;
    if (detail === "architecture" && edge.kind === "internal" && !focusActive) {
      continue;
    }
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.strokeStyle =
      edge.kind === "cross"
        ? hexAlpha(
            "#a78bfa",
            faded
              ? 0.025
              : focusActive
                ? 0.9
                : detail === "architecture"
                  ? 0.16
                  : 0.28,
          )
        : faded
          ? "rgba(130, 142, 134, 0.02)"
          : focusActive
            ? "rgba(190, 202, 194, 0.7)"
            : detail === "files"
              ? "rgba(130, 142, 134, 0.14)"
              : "rgba(130, 142, 134, 0.09)";
    context.lineWidth = (focusActive ? 1.8 : edge.kind === "cross" ? 1.05 : 0.75) / view.scale;
    context.stroke();
    if (display.arrows && !faded && detail !== "architecture") {
      context.fillStyle = context.strokeStyle;
      drawArrow(context, source, target);
    }
  }

  for (const node of visibleNodes) {
    const emphasis = nodeEmphasis({ id: node.id, hoverSet, searchSet, localSet: null });
    const alpha = emphasis === "faded" ? 0.12 : 1;
    const color = node.degraded
      ? "#ff5f68"
      : node.isolated
        ? "#f0a83b"
        : MODULE_COLORS[node.colorIndex % MODULE_COLORS.length];
    context.globalAlpha = alpha;
    context.beginPath();
    const radius = node.radius * (detail === "architecture" ? 0.72 : 1);
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    if (node.id === selected || node.id === hovered) {
      context.beginPath();
      context.arc(
        node.x,
        node.y,
        radius + (node.id === selected ? 5 : 3),
        0,
        Math.PI * 2,
      );
      context.strokeStyle = node.id === selected ? brand : foreground;
      context.lineWidth = (node.id === selected ? 1.8 : 1) / view.scale;
      context.stroke();
    }
  }
  context.globalAlpha = 1;

  for (const module of model.modules) {
    if (!visibleModules.has(module.id)) continue;
    const active = activeModule?.id === module.id;
    const color = MODULE_COLORS[module.colorIndex % MODULE_COLORS.length];
    const anchorRadius = (active ? 4.2 : 3.2) / view.scale;
    context.beginPath();
    context.arc(module.x, module.y, anchorRadius, 0, Math.PI * 2);
    context.fillStyle = active ? color : hexAlpha(color, 0.86);
    context.fill();
    context.strokeStyle = background;
    context.lineWidth = 1.5 / view.scale;
    context.stroke();

    const label = repoGraphModuleLabel(
      module.id,
      active ? "files" : detail,
    );
    context.font = `${Math.max(9.5, 10 / view.scale)}px "JetBrains Mono", monospace`;
    const width = context.measureText(label).width;
    const box = {
      left: module.x + 8 / view.scale,
      right: module.x + 13 / view.scale + width,
      top: module.y - 16 / view.scale,
      bottom: module.y + 3 / view.scale,
    };
    if (active || claimLabel(occupied, box)) {
      if (active) occupied.push(box);
      context.fillStyle = hexAlpha(background, 0.9);
      context.fillRect(
        box.left - 3 / view.scale,
        box.top,
        box.right - box.left + 6 / view.scale,
        box.bottom - box.top,
      );
      context.fillStyle = active ? color : hexAlpha(color, 0.9);
      context.fillText(label, box.left, module.y - 3 / view.scale);
    }
  }

  const prioritized = [...visibleNodes].sort((left, right) => {
    const leftPriority = left.id === selected ? 1000 : left.id === hovered ? 900 : left.degree;
    const rightPriority = right.id === selected ? 1000 : right.id === hovered ? 900 : right.degree;
    return rightPriority - leftPriority;
  });
  for (const node of prioritized) {
    const emphasis = nodeEmphasis({ id: node.id, hoverSet, searchSet, localSet: null });
    const forced = node.id === selected || node.id === hovered || searchSet?.has(node.id);
    const threshold = detail === "architecture" ? Number.POSITIVE_INFINITY : detail === "files" ? 1 : 5;
    if (
      !forced &&
      (!display.labels || node.degree < threshold || emphasis === "faded")
    ) {
      continue;
    }
    context.font = `${Math.max(9.5, 10.5 / Math.max(0.78, view.scale))}px "JetBrains Mono", monospace`;
    const label = node.label.length > 25 ? `${node.label.slice(0, 23)}…` : node.label;
    const width = context.measureText(label).width;
    const box = {
      left: node.x + node.radius + 5,
      right: node.x + node.radius + 9 + width,
      top: node.y - 8,
      bottom: node.y + 7,
    };
    if (!forced && !claimLabel(occupied, box)) {
      continue;
    }
    if (forced) occupied.push(box);
    context.globalAlpha = emphasis === "faded" ? 0.12 : forced ? 1 : 0.7;
    context.fillStyle = forced ? foreground : muted;
    context.fillText(label, box.left, node.y + 3.5);
  }
  context.globalAlpha = 1;
  context.strokeStyle = border;
}

type Props = {
  onOpenFile?: (path: string) => void;
};

export const RepoGraphPane = memo(function RepoGraphPane({ onOpenFile }: Props) {
  const workspaceRoot = useWorkspaceStore((state) => state.workspaceRoot);
  const status = useRealityStore((state) => state.status);
  const snapshot = useRealityStore((state) => state.snapshot);
  const task = useRealityStore((state) => state.task);
  const error = useRealityStore((state) => state.error);
  const refresh = useRealityStore((state) => state.refresh);
  const focusInput = useChatStore((state) => state.focusInput);

  const [taskDraft, setTaskDraft] = useState(task);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [depth, setDepth] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [display, setDisplay] = useState<DisplayOptions>({
    labels: true,
    isolated: true,
    arrows: false,
  });
  const [forces, setForces] = useState<RepoGraphForces>(DEFAULT_REPO_GRAPH_FORCES);
  const [view, setView] = useState<RepoGraphView>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [simulationVersion, setSimulationVersion] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<PointerState | null>(null);
  const drawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    void refresh(workspaceRoot);
  }, [workspaceRoot, refresh]);

  useEffect(() => {
    setTaskDraft(task);
  }, [task]);

  const model = useMemo(
    () => (snapshot ? buildRepoGraphModel(snapshot, MAX_NODES) : null),
    [snapshot, layoutVersion],
  );

  const searchSet = useMemo(() => {
    if (!model || !query.trim()) return null;
    const normalized = query.trim().toLowerCase();
    const matches = new Set<string>();
    for (const node of model.nodes) {
      if (node.id.toLowerCase().includes(normalized)) matches.add(node.id);
    }
    for (const edge of model.edges) {
      if (edge.symbol.toLowerCase().includes(normalized)) {
        matches.add(edge.source);
        matches.add(edge.target);
      }
    }
    return matches;
  }, [model, query]);

  const hoverSet = useMemo(
    () => (model && hovered ? neighborhood(model.edges, hovered, 1) : null),
    [model, hovered],
  );

  const localSet = useMemo(
    () =>
      model && selected && localMode
        ? neighborhood(model.edges, selected, depth)
        : null,
    [model, selected, localMode, depth],
  );

  const selectedEdges = useMemo(
    () =>
      model && selected
        ? model.edges.filter(
            (edge) => edge.source === selected || edge.target === selected,
          )
        : [],
    [model, selected],
  );

  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas || !model) return;
    renderRepoGraph({
      canvas,
      model,
      view,
      hovered,
      selected,
      hoverSet,
      searchSet,
      localSet,
      display,
    });
  };

  useEffect(() => {
    drawRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
      requestAnimationFrame(() => drawRef.current());
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!model || viewport.width <= 0 || viewport.height <= 0) return;
    setView(fitRepoGraphView(model, viewport.width, viewport.height));
  }, [model, viewport.width, viewport.height]);

  useEffect(() => {
    if (!model) return;
    let frame = 0;
    let remaining = 180;
    let quietFrames = 0;
    const run = () => {
      const energy = advanceRepoGraph(model, forces, Math.max(0.18, remaining / 180));
      drawRef.current();
      remaining -= 1;
      quietFrames = energy < 0.025 ? quietFrames + 1 : 0;
      if (remaining > 0 && quietFrames < 12) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [model, forces, simulationVersion]);

  const absolutePath = useCallback(
    (path: string) =>
      workspaceRoot ? resolveRepoDisplayPath(workspaceRoot, path) : path,
    [workspaceRoot],
  );

  const openPath = useCallback(
    (path: string) => onOpenFile?.(absolutePath(path)),
    [onOpenFile, absolutePath],
  );

  const attachPath = useCallback(
    (path: string) => {
      window.dispatchEvent(
        new CustomEvent<string>("atlas:ai-attach-file", {
          detail: absolutePath(path),
        }),
      );
      focusInput(null);
    },
    [absolutePath, focusInput],
  );

  const askAtlas = useCallback(
    (path: string, edges: readonly RepoMapEdge[]) => {
      attachPath(path);
      const symbols = [...new Set(edges.map((edge) => edge.symbol))].slice(0, 8);
      const suffix = symbols.length > 0 ? ` Related symbols: ${symbols.join(", ")}.` : "";
      focusInput(
        `Analyze the architectural role and change impact of ${path}. Identify callers, dependencies, affected tests, and risks.${suffix}`,
      );
    },
    [attachPath, focusInput],
  );

  const focusTask = useCallback(() => {
    const nextTask = taskDraft.trim();
    if (!workspaceRoot || !nextTask) return;
    setSelected(null);
    setLocalMode(false);
    void refresh(workspaceRoot, nextTask);
  }, [taskDraft, workspaceRoot, refresh]);

  const screenPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const worldPoint = (clientX: number, clientY: number) => {
    const point = screenPoint(clientX, clientY);
    return {
      x: (point.x - view.x) / view.scale,
      y: (point.y - view.y) / view.scale,
    };
  };

  const visibleForHitTest = localMode ? localSet : null;

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!model) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = screenPoint(event.clientX, event.clientY);
    const world = worldPoint(event.clientX, event.clientY);
    const node = hitTestRepoGraph(
      model,
      world.x,
      world.y,
      visibleForHitTest,
      display.isolated,
    );
    if (node) {
      node.fixed = true;
      node.vx = 0;
      node.vy = 0;
      pointerRef.current = {
        kind: "node",
        pointerId: event.pointerId,
        nodeId: node.id,
        startX: screen.x,
        startY: screen.y,
        moved: false,
      };
      return;
    }
    pointerRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      x: screen.x,
      y: screen.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!model) return;
    const screen = screenPoint(event.clientX, event.clientY);
    const world = worldPoint(event.clientX, event.clientY);
    const pointer = pointerRef.current;
    if (pointer?.pointerId === event.pointerId && pointer.kind === "node") {
      const node = model.byId.get(pointer.nodeId);
      if (node) {
        node.x = world.x;
        node.y = world.y;
        pointer.moved ||=
          Math.hypot(screen.x - pointer.startX, screen.y - pointer.startY) > 3;
        setHovered(node.id);
        setHoverPoint({ x: screen.x, y: screen.y });
        drawRef.current();
      }
      return;
    }
    if (pointer?.pointerId === event.pointerId && pointer.kind === "pan") {
      const dx = screen.x - pointer.x;
      const dy = screen.y - pointer.y;
      pointer.x = screen.x;
      pointer.y = screen.y;
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      return;
    }
    const node = hitTestRepoGraph(
      model,
      world.x,
      world.y,
      visibleForHitTest,
      display.isolated,
    );
    setHovered((current) => (current === node?.id ? current : node?.id ?? null));
    setHoverPoint({ x: screen.x, y: screen.y });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (pointer.kind === "node" && model) {
      const node = model.byId.get(pointer.nodeId);
      if (node) node.fixed = false;
      if (!pointer.moved) setSelected(pointer.nodeId);
      setSimulationVersion((version) => version + 1);
    }
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onDoubleClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!model) return;
    const world = worldPoint(event.clientX, event.clientY);
    const node = hitTestRepoGraph(
      model,
      world.x,
      world.y,
      visibleForHitTest,
      display.isolated,
    );
    if (node) openPath(node.id);
  };

  const zoomAt = (x: number, y: number, factor: number) => {
    setView((current) => {
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor));
      const worldX = (x - current.x) / current.scale;
      const worldY = (y - current.y) / current.scale;
      return {
        scale,
        x: x - worldX * scale,
        y: y - worldY * scale,
      };
    });
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = screenPoint(event.clientX, event.clientY);
    zoomAt(point.x, point.y, event.deltaY > 0 ? 0.88 : 1.14);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "Escape") {
      setSelected(null);
      setLocalMode(false);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      zoomAt(viewport.width / 2, viewport.height / 2, 1.14);
      return;
    }
    if (event.key === "-") {
      zoomAt(viewport.width / 2, viewport.height / 2, 0.88);
      return;
    }
    const distance = event.shiftKey ? 70 : 24;
    if (event.key === "ArrowLeft") setView((current) => ({ ...current, x: current.x + distance }));
    if (event.key === "ArrowRight") setView((current) => ({ ...current, x: current.x - distance }));
    if (event.key === "ArrowUp") setView((current) => ({ ...current, y: current.y + distance }));
    if (event.key === "ArrowDown") setView((current) => ({ ...current, y: current.y - distance }));
  };

  const fitView = () => {
    if (!model) return;
    setView(fitRepoGraphView(model, viewport.width, viewport.height));
  };

  const resetGraph = () => {
    setForces(DEFAULT_REPO_GRAPH_FORCES);
    setLayoutVersion((version) => version + 1);
  };

  if (!workspaceRoot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background text-[12px] text-muted-foreground">
        <GraphIcon size={25} strokeWidth={1.4} className="opacity-50" />
        Open a project to build its map.
      </div>
    );
  }

  const selectedNode = selected && model ? model.byId.get(selected) : null;
  const incoming = selectedEdges.filter((edge) => edge.target === selected).length;
  const outgoing = selectedEdges.filter((edge) => edge.source === selected).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <GraphIcon size={13} strokeWidth={1.6} className="text-brand" />
        <span className="text-[11.5px] font-semibold">Map</span>
        {snapshot ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {Math.min(model?.nodes.length ?? 0, MAX_NODES)} shown / {snapshot.file_count.toLocaleString()} files · {snapshot.graph_relations.length} links · {freshnessLabel(snapshot)}
          </span>
        ) : null}
        <div className="flex-1" />
        <FocusIcon size={11} strokeWidth={1.5} className="text-muted-foreground" />
        <input
          value={taskDraft}
          onChange={(event) => setTaskDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") focusTask();
          }}
          placeholder='Focus a task, e.g. "session persistence"'
          className="h-6 w-60 border border-border/70 bg-card px-2 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <button
          type="button"
          onClick={() => void refresh(workspaceRoot)}
          title="Refresh repository index"
          className="grid size-6 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshIcon size={12} strokeWidth={1.5} className={cn(status === "loading" && "animate-spin")} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Interactive repository relationship graph"
          className="h-full w-full cursor-grab touch-none bg-background outline-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            if (!pointerRef.current) setHovered(null);
          }}
          onDoubleClick={onDoubleClick}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        />

        {status === "loading" && !snapshot ? (
          <div className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">
            Building repository graph…
          </div>
        ) : null}
        {status === "unavailable" ? (
          <div className="absolute left-3 top-3 border border-destructive/40 bg-background px-3 py-2 text-[11px] text-destructive">
            {error ?? "Repository graph unavailable."}
          </div>
        ) : null}

        <div className="absolute left-3 top-3 flex h-8 items-center border border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
          <SearchIcon size={12} strokeWidth={1.5} className="ml-2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find file or symbol"
            className="h-full w-44 bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground/60"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
            >
              <ClearIcon size={11} strokeWidth={1.5} />
            </button>
          ) : null}
          <span className="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => setLocalMode(false)}
            className={cn(
              "h-full px-2.5 text-[10.5px] text-muted-foreground hover:text-foreground",
              !localMode && "bg-accent text-foreground",
            )}
          >
            All
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && setLocalMode(true)}
            title={selected ? "Show only the selected file neighborhood" : "Select a file first"}
            className={cn(
              "h-full border-l border-border px-2.5 text-[10.5px] text-muted-foreground hover:text-foreground disabled:opacity-35",
              localMode && "bg-accent text-foreground",
            )}
          >
            Local
          </button>
          {localMode ? (
            <label className="flex h-full items-center gap-1.5 border-l border-border px-2 text-[10px] text-muted-foreground">
              Depth
              <input
                type="range"
                min={1}
                max={3}
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
                className="w-14"
              />
              {depth}
            </label>
          ) : null}
        </div>

        <div className="absolute right-3 top-3 flex border border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={fitView}
            title="Fit graph"
            className="grid size-8 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FitIcon size={13} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            title="Graph settings"
            className={cn(
              "grid size-8 place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              settingsOpen && "bg-accent text-foreground",
            )}
          >
            <SettingsIcon size={13} strokeWidth={1.5} />
          </button>
        </div>

        {settingsOpen ? (
          <div className="absolute right-3 top-12 w-64 border border-border/75 bg-card/98 p-3 shadow-md backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-medium">Graph settings</span>
              <button
                type="button"
                onClick={resetGraph}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <ResetIcon size={10} strokeWidth={1.5} />
                Reset
              </button>
            </div>
            <div className="space-y-2 border-b border-border/70 pb-3">
              <ToggleRow
                label="File labels"
                checked={display.labels}
                onChange={(labels) => setDisplay((current) => ({ ...current, labels }))}
              />
              <ToggleRow
                label="Isolated files"
                checked={display.isolated}
                onChange={(isolated) => setDisplay((current) => ({ ...current, isolated }))}
              />
              <ToggleRow
                label="Direction arrows"
                checked={display.arrows}
                onChange={(arrows) => setDisplay((current) => ({ ...current, arrows }))}
              />
            </div>
            <div className="space-y-3 pt-3">
              <RangeRow
                label="Module pull"
                min={0.2}
                max={1.8}
                step={0.1}
                value={forces.cluster}
                onChange={(cluster) => setForces((current) => ({ ...current, cluster }))}
              />
              <RangeRow
                label="Repel"
                min={0.2}
                max={2}
                step={0.1}
                value={forces.repel}
                onChange={(repel) => setForces((current) => ({ ...current, repel }))}
              />
              <RangeRow
                label="Link pull"
                min={0.2}
                max={1.8}
                step={0.1}
                value={forces.link}
                onChange={(link) => setForces((current) => ({ ...current, link }))}
              />
              <RangeRow
                label="Link distance"
                min={50}
                max={180}
                step={5}
                value={forces.distance}
                onChange={(distance) => setForces((current) => ({ ...current, distance }))}
              />
            </div>
          </div>
        ) : null}

        {hovered && hovered !== selected && model ? (
          <div
            className="pointer-events-none absolute max-w-80 border border-border/75 bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-sm"
            style={{
              left: Math.min(viewport.width - 260, hoverPoint.x + 14),
              top: Math.min(viewport.height - 70, hoverPoint.y + 14),
            }}
          >
            <div className="truncate font-mono text-[10.5px] text-foreground">{hovered}</div>
            <div className="mt-0.5 text-[9.5px] text-muted-foreground">
              {model.byId.get(hovered)?.degree ?? 0} visible relations · drag to reposition · double-click to open
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 flex items-center gap-3 border border-border/65 bg-card/92 px-2.5 py-1.5 text-[9.5px] text-muted-foreground shadow-sm backdrop-blur-sm">
          <Legend swatch="#9cff00" label="module" />
          <Legend swatch="#a78bfa" label="cross-module" line />
          <Legend swatch="#ff5f68" label="unparsed" />
          <Legend swatch="#f0a83b" label="isolated here" />
        </div>

        {selectedNode ? (
          <div className="absolute bottom-3 right-3 w-[380px] max-w-[calc(100%-24px)] border border-border/75 bg-card/96 p-2.5 shadow-md backdrop-blur-md">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10.5px] text-foreground" title={selectedNode.id}>
                  {selectedNode.id}
                </div>
                <div className="mt-1 text-[9.5px] text-muted-foreground">
                  {selectedNode.module} · {incoming} incoming · {outgoing} outgoing
                  {selectedNode.degraded ? " · unparsed" : selectedNode.isolated ? " · isolated in projection" : ""}
                </div>
              </div>
              <button
                type="button"
                aria-label="Clear selection"
                onClick={() => {
                  setSelected(null);
                  setLocalMode(false);
                }}
                className="grid size-5 place-items-center text-muted-foreground hover:text-foreground"
              >
                <ClearIcon size={11} strokeWidth={1.5} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <SelectionAction Icon={OpenIcon} label="Open" onClick={() => openPath(selectedNode.id)} />
              <SelectionAction Icon={AttachIcon} label="Add to context" onClick={() => attachPath(selectedNode.id)} />
              <SelectionAction Icon={AskIcon} label="Ask Atlas" onClick={() => askAtlas(selectedNode.id, selectedEdges)} />
              <button
                type="button"
                onClick={() => setLocalMode((local) => !local)}
                className={cn(
                  "ml-auto border border-border/70 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground",
                  localMode && "bg-accent text-foreground",
                )}
              >
                {localMode ? "Show all" : "Explore local"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-[10.5px] text-muted-foreground">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-brand"
      />
    </label>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[10px] text-muted-foreground">
      <span className="mb-1 flex items-center justify-between">
        {label}
        <span className="tabular-nums text-foreground/70">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="block w-full accent-brand"
      />
    </label>
  );
}

function Legend({ swatch, label, line = false }: { swatch: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={line ? "h-px w-4" : "size-1.5 rounded-full"}
        style={{ backgroundColor: swatch }}
      />
      {label}
    </span>
  );
}

function SelectionAction({
  Icon,
  label,
  onClick,
}: {
  Icon: typeof OpenIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 border border-border/70 bg-background px-2 py-1 text-[10px] text-foreground/85 hover:bg-accent"
    >
      <Icon size={10.5} strokeWidth={1.5} />
      {label}
    </button>
  );
}
