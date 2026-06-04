import { useMemo } from "react";
import type { RepoContextResponse } from "../lib/native";
import { buildRepoMap } from "./repoMap";

type Props = {
  snapshot: RepoContextResponse;
  focus: string;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  /** Open the file in the editor (double-click / Enter on a focused node). */
  onOpenPath?: (path: string) => void;
};

function trimLabel(label: string): string {
  return label.length > 18 ? `${label.slice(0, 15)}...` : label;
}

export function RepoMapGraph({
  snapshot,
  focus,
  selectedPath,
  onSelectPath,
  onOpenPath,
}: Props) {
  const graph = useMemo(() => buildRepoMap(snapshot, focus), [focus, snapshot]);
  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="border border-border/60 px-2 py-5 text-center text-[11px] text-muted-foreground">
        No ranked file relationships in this projection yet.
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 280 184"
      role="img"
      aria-label="Bounded repository file relationship map"
      className="h-[184px] w-full border border-border/60 bg-muted/15"
    >
      {graph.edges.map((edge, index) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        const active =
          edge.source === selectedPath || edge.target === selectedPath;
        return (
          <line
            key={`${edge.source}:${edge.target}:${edge.symbol}:${index}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke="currentColor"
            strokeWidth={active ? 1.8 : 1}
            strokeOpacity={active ? 0.7 : 0.22}
            className={active ? "text-emerald-500" : "text-muted-foreground"}
          >
            <title>{`${edge.source} -> ${edge.target} - ${edge.symbol}`}</title>
          </line>
        );
      })}
      {graph.nodes.map((node) => {
        const active = node.id === selectedPath;
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`Inspect ${node.id}. Double-click or press Enter to open.`}
            onClick={() => onSelectPath(node.id)}
            onDoubleClick={() => onOpenPath?.(node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onOpenPath ? onOpenPath(node.id) : onSelectPath(node.id);
              } else if (event.key === " ") {
                event.preventDefault();
                onSelectPath(node.id);
              }
            }}
            className="cursor-pointer outline-none"
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={active ? 6 : 4.5}
              fill="currentColor"
              stroke="var(--background)"
              strokeWidth={1.5}
              className={
                active || node.focused
                  ? "text-emerald-500"
                  : node.included
                    ? "text-foreground/70"
                    : "text-muted-foreground/60"
              }
            />
            <text
              x={node.x}
              y={node.y + 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[7px]"
            >
              {trimLabel(node.label)}
            </text>
            <title>{`${node.id} - ${node.degree} visible links${onOpenPath ? " (double-click to open)" : ""}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
