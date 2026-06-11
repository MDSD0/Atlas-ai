import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Activity as ReliabilityIcon,
  Brain as MemoryIcon,
  ChevronDown as ChevronDownIcon,
  FileCode as ContextIcon,
  ListChecks as ProofIcon,
  Network as MapIcon,
  PlugZap as ExtensionsIcon,
  Search as SearchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { localRecords, memorySurface } from "../memory";
import type { LocalMetricRecord } from "../metrics/contracts";
import { localMetrics } from "../metrics";
import { mcpRegistry } from "../mcp";
import { workPacketRegistry } from "../workPackets";
import type { ProofRun } from "../proof/contracts";
import { proofJournal } from "../proof";
import { skillRegistry } from "../skills";
import { useChatStore } from "../store/chatStore";
import { useProofStore } from "../store/proofStore";
import {
  useContextLedgerStore,
  type PackedContextSnapshot,
} from "../contextLedger";
import type { RepoContextResponse } from "../lib/native";
import type { RealityStat } from "./CodeRealityPanel";
import { summarizeReliability } from "./reliabilitySummary";
import { RepoMapGraph } from "./RepoMapGraph";

type InspectorTab =
  | "map"
  | "context"
  | "proof"
  | "memory"
  | "extensions"
  | "reliability";

type MemoryData = {
  stats: Awaited<ReturnType<typeof localRecords.stats>>;
  records: Awaited<ReturnType<typeof localRecords.list>>;
  packets: Awaited<ReturnType<typeof workPacketRegistry.list>>;
  surface: Awaited<ReturnType<typeof memorySurface.status>>;
};

type ExtensionsData = {
  skills: Awaited<ReturnType<typeof skillRegistry.list>>;
  mcp: Awaited<ReturnType<typeof mcpRegistry.status>>;
  servers: Awaited<ReturnType<typeof mcpRegistry.list>>;
};

const TABS: Array<{
  id: InspectorTab;
  label: string;
  Icon: typeof MapIcon;
}> = [
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "context", label: "Context", Icon: ContextIcon },
  { id: "proof", label: "Proof", Icon: ProofIcon },
  { id: "memory", label: "Memory", Icon: MemoryIcon },
  { id: "extensions", label: "Ext", Icon: ExtensionsIcon },
  { id: "reliability", label: "Reliability", Icon: ReliabilityIcon },
];

function when(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "not finished";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
      {children}
    </div>
  );
}

function StatRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="flex-1 text-[11px] text-muted-foreground truncate" title={hint}>
        {label}
        {hint && (
          <span className="ml-1 text-[10px] text-muted-foreground/50">({hint})</span>
        )}
      </span>
      <span className="shrink-0 text-[11px] font-medium tabular-nums text-foreground/90">
        {value}
      </span>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-border/50 px-2.5 py-2 text-[11px] text-muted-foreground">
      {message}
    </div>
  );
}

function Collapsible({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 text-left"
      >
        <ChevronDownIcon
          size={11}
          strokeWidth={1.5}
          className={cn(
            "shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          {label}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function MapTab({
  snapshot,
  stats,
  query,
  setQuery,
  submit,
  onOpenFile,
}: {
  snapshot: RepoContextResponse;
  stats: RealityStat[];
  query: string;
  setQuery: (query: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenFile?: (path: string) => void;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(
    snapshot.included_files[0] ?? null,
  );
  const relations = snapshot.graph_relations.filter(
    (relation) =>
      relation.source === selectedPath || relation.target === selectedPath,
  );

  useEffect(() => {
    if (
      selectedPath &&
      (snapshot.included_files.includes(selectedPath) ||
        snapshot.graph_relations.some(
          (relation) =>
            relation.source === selectedPath || relation.target === selectedPath,
        ))
    ) {
      return;
    }
    setSelectedPath(snapshot.included_files[0] ?? null);
  }, [selectedPath, snapshot]);

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex gap-1">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Focus task or symbol"
          className="min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <button
          type="submit"
          title="Project task subgraph"
          className="flex size-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SearchIcon size={12} strokeWidth={1.5} />
        </button>
      </form>

      <RepoMapGraph
        snapshot={snapshot}
        focus={query}
        selectedPath={selectedPath}
        onSelectPath={setSelectedPath}
        onOpenPath={onOpenFile}
      />

      {/* Graph meta */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
        <span>{snapshot.graph_edge_count.toLocaleString()} links</span>
        <span>{snapshot.rank_iterations} passes</span>
        <span>{snapshot.ranking_strategy}</span>
      </div>

      {/* Selected file detail */}
      {selectedPath && (
        <div className="rounded-md border border-border/50 bg-card/60 px-2.5 py-2">
          {onOpenFile ? (
            <button
              type="button"
              onClick={() => onOpenFile(selectedPath)}
              title={`Open ${selectedPath}`}
              className="w-full truncate text-left text-[11px] font-medium text-foreground/90 hover:text-emerald-500 hover:underline"
            >
              {selectedPath}
            </button>
          ) : (
            <div className="truncate text-[11px] font-medium text-foreground/90">
              {selectedPath}
            </div>
          )}
          {relations.length === 0 ? (
            <div className="mt-1 text-[10px] text-muted-foreground">
              No visible ranked links for this file.
            </div>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {relations.slice(0, 8).map((relation, index) => (
                <li
                  key={`${relation.source}:${relation.target}:${relation.symbol}:${index}`}
                  className="text-[10px] text-muted-foreground"
                >
                  <span className="text-foreground/70">{relation.symbol}</span>
                  {" — "}
                  {relation.source === selectedPath
                    ? relation.target
                    : relation.source}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5">
        {stats.map((stat) => (
          <StatRow key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </div>
    </div>
  );
}

function ContextTab({
  snapshot,
  task,
  packed,
}: {
  snapshot: RepoContextResponse;
  task: string;
  packed: PackedContextSnapshot | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <SectionLabel>Last packed model input</SectionLabel>
        {packed ? (
          <>
            <div className="rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5">
              <StatRow
                label="Estimated input"
                value={`${packed.estimatedTokens.toLocaleString()} / ${packed.contextLimit.toLocaleString()} tok`}
              />
              <StatRow label="Pressure" value={packed.pressure} />
              <StatRow label="Model" value={packed.modelId} />
              <StatRow
                label="Compaction"
                value={packed.compacted ? `${packed.droppedCount} elided` : "—"}
              />
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {packed.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border/40 px-2 py-1.5 text-[10px]"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-foreground/85 font-medium">{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {item.status === "loaded"
                        ? `${item.tokenEstimate.toLocaleString()} tok`
                        : "not loaded"}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words text-muted-foreground">
                    {item.source}
                    {item.detail ? ` — ${item.detail}` : ""}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-[10px] text-muted-foreground/60">
              captured {when(packed.capturedAt)} — estimates use UTF-8 bytes / 4
            </div>
          </>
        ) : (
          <Empty message="No packed request recorded yet. Send an Atlas message to capture one." />
        )}
      </div>

      <div className="rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5">
        <StatRow
          label="Projection budget"
          value={`${snapshot.projected_tokens.toLocaleString()} / ${snapshot.max_tokens.toLocaleString()} tok`}
        />
        <StatRow label="Naive load" value={`${snapshot.naive_tokens.toLocaleString()} tok`} />
        <StatRow label="Files excluded" value={snapshot.excluded_files.toLocaleString()} />
      </div>

      <Collapsible label={`Included files (${snapshot.included_files.length})`}>
        <ul className="flex flex-col gap-0.5">
          {snapshot.included_files.map((path) => (
            <li key={path} className="truncate text-[10px] text-muted-foreground">
              {path}
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible label="Bounded context preview">
        <pre className="whitespace-pre-wrap break-words rounded-md border border-border/50 bg-muted/20 p-2 text-[10px] text-muted-foreground">
          {snapshot.context || "No context emitted."}
        </pre>
      </Collapsible>

      <div className="border-t border-border/50 pt-2">
        <SectionLabel>Task subgraph preview</SectionLabel>
        <div className="break-words text-[11px] text-muted-foreground">{task}</div>
      </div>
    </div>
  );
}

function ProofTab({ runs }: { runs: ProofRun[] }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Flight recorder timeline</SectionLabel>
      <div className="mb-1 text-[10px] text-muted-foreground/60">
        Expandable payloads contain bounded redacted metadata, not raw prompts or file bodies.
      </div>
      {runs.length === 0 && <Empty message="No proof runs recorded for this session." />}
      {runs.slice(0, 12).map((run) => (
        <details key={run.id} className="rounded-md border border-border/50 bg-card/40">
          <summary className="cursor-pointer px-2.5 py-2 text-[11px] text-foreground/90">
            <span className="font-medium">{run.status}</span>
            <span className="text-muted-foreground">
              {" — "}
              {run.events.length} events
              {" — "}
              {when(run.finishedAt)}
              {run.eventsDropped > 0 ? ` — ${run.eventsDropped} older dropped` : ""}
            </span>
          </summary>
          <ul className="flex flex-col gap-1 border-t border-border/40 px-2.5 py-2">
            {run.events.map((event) => (
              <li key={event.id} className="border-l-2 border-border/60 pl-2 text-[10px]">
                <div className="text-foreground/80">
                  {event.sequence}. {event.kind}
                </div>
                <div className="break-words text-muted-foreground">
                  {event.summary.preview}
                </div>
                {event.boundedPayload && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-muted-foreground/70">
                      payload
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-border/50 bg-muted/20 p-1.5 text-[10px] text-muted-foreground">
                      {event.boundedPayload.preview}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function MemoryTab({ data }: { data: MemoryData | null }) {
  if (!data) return <Empty message="Local memory has not been loaded." />;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <SectionLabel>Storage</SectionLabel>
        <div className="rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5">
          <StatRow label="Provider" value={data.stats.provider} />
          <StatRow label="Active records" value={data.stats.active} />
          <StatRow label="Stale records" value={data.stats.stale} />
          <StatRow label="Filesystem surface" value={data.surface.enabled ? "enabled" : "disabled"} />
        </div>
        {data.surface.enabled && (
          <div className="mt-1.5 truncate text-[10px] text-muted-foreground/60" title={data.surface.indexPath}>
            index: {data.surface.indexPath}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Work packets ({data.packets.length})</SectionLabel>
        {data.packets.length === 0 ? (
          <Empty message="No resumable work packets for this project." />
        ) : (
          <div className="flex flex-col gap-1">
            {data.packets.slice(0, 20).map((packet) => (
              <details key={packet.id} className="rounded-md border border-border/50 bg-card/40">
                <summary className="cursor-pointer px-2.5 py-2 text-[11px] text-foreground/90">
                  <span className="font-medium">{packet.status}</span>
                  <span className="ml-1 text-muted-foreground">— {packet.originalGoal}</span>
                </summary>
                <div className="border-t border-border/40 px-2.5 py-2 text-[10px] text-muted-foreground">
                  <div>next: {packet.nextSuggestedAction}</div>
                  <div className="mt-0.5 text-muted-foreground/60">
                    {packet.id} · {packet.proofRunIds.length} proof refs
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <Collapsible label={`Memory records (${data.records.length})`}>
        {data.records.length === 0 ? (
          <Empty message="No local memory records for this project." />
        ) : (
          <div className="flex flex-col gap-1">
            {data.records.slice(0, 30).map((record) => (
              <details key={record.id} className="rounded-md border border-border/50 bg-card/40">
                <summary className="cursor-pointer px-2.5 py-2 text-[11px] text-foreground/90">
                  <span className="font-medium">{record.kind}</span>
                  <span className="ml-1 text-muted-foreground">— {record.status}</span>
                </summary>
                <div className="border-t border-border/40 px-2.5 py-2 text-[10px] text-muted-foreground">
                  <div className="break-words">{record.content}</div>
                  <div className="mt-1 text-muted-foreground/60">
                    source run: {record.sourceRunId ?? "none"}
                  </div>
                  {record.sourceArtifacts.map((artifact) => (
                    <div key={artifact} className="truncate text-muted-foreground/60">
                      artifact: {artifact}
                    </div>
                  ))}
                  {record.staleReason && (
                    <div className="mt-1 text-amber-500">stale: {record.staleReason}</div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Collapsible>
    </div>
  );
}

function ExtensionsTab({ data }: { data: ExtensionsData | null }) {
  if (!data) return <Empty message="Extension registries have not been loaded." />;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <SectionLabel>Skills ({data.skills.length})</SectionLabel>
        {data.skills.length === 0 ? (
          <Empty message="No local skills installed." />
        ) : (
          <div className="flex flex-col gap-1">
            {data.skills.map((skill) => (
              <details key={skill.id} className="rounded-md border border-border/50 bg-card/40">
                <summary className="cursor-pointer px-2.5 py-2 text-[11px] text-foreground/90">
                  <span className="font-medium">{skill.name}</span>
                  <span className="ml-1 text-muted-foreground">
                    — {skill.enabled ? "enabled" : "disabled"}
                  </span>
                </summary>
                <div className="border-t border-border/40 px-2.5 py-2 text-[10px] text-muted-foreground">
                  <div>{skill.description}</div>
                  <div className="mt-1 text-muted-foreground/60">
                    ~{Math.ceil(skill.prompt.length / 4)} tok · tools: {skill.allowedTools.join(", ") || "none"} · hooks: {skill.hooks.join(", ") || "none"}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>MCP ({data.mcp.state})</SectionLabel>
        <div className="mb-1.5 text-[10px] text-muted-foreground">
          {data.mcp.transport} — protocol {data.mcp.protocolVersion}
        </div>
        {data.servers.length === 0 ? (
          <Empty message="No MCP servers configured." />
        ) : (
          <div className="flex flex-col gap-1">
            {data.servers.map((server) => (
              <details key={server.id} className="rounded-md border border-border/50 bg-card/40">
                <summary className="cursor-pointer px-2.5 py-2 text-[11px] text-foreground/90">
                  <span className="font-medium">{server.name}</span>
                  <span className="ml-1 text-muted-foreground">
                    — {server.enabled ? "enabled" : "disabled"}
                  </span>
                </summary>
                <div className="border-t border-border/40 px-2.5 py-2 text-[10px] text-muted-foreground">
                  <div>transport: {server.transport}</div>
                  <div>policy: {server.defaultToolPolicy}</div>
                  <div>tools: {Object.keys(server.tools).length} configured</div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReliabilityTab({
  metrics,
  runs,
}: {
  metrics: LocalMetricRecord[];
  runs: ProofRun[];
}) {
  const summary = summarizeReliability(runs, metrics);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <SectionLabel>Run summary</SectionLabel>
        <div className="rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5">
          <StatRow
            label="Verified"
            value={`${summary.verifiedRuns} / ${summary.finishedRuns} (${summary.verifiedRatio}%)`}
          />
          <StatRow label="Failed" value={summary.failedRuns} />
          <StatRow label="Incomplete" value={summary.incompleteRuns} />
          <StatRow label="Tool failures" value={summary.toolFailures} />
        </div>
      </div>

      <Collapsible label={`Local measurements (${metrics.length})`} defaultOpen={metrics.length > 0}>
        {metrics.length === 0 ? (
          <Empty message="No measurements recorded." />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {metrics.slice(0, 30).map((metric) => (
              <li key={metric.id} className="flex gap-2 py-0.5 text-[10px]">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {metric.name}
                </span>
                <span className="tabular-nums text-foreground/80">
                  {metric.value} {metric.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </div>
  );
}

export function HarnessInspector({
  snapshot,
  stats,
  workspaceRoot,
  task,
  onFocusTask,
  onOpenFile,
}: {
  snapshot: RepoContextResponse;
  stats: RealityStat[];
  workspaceRoot: string;
  task: string;
  onFocusTask: (task: string) => void;
  /** Open a repository file in the editor from the map/symbol surfaces. */
  onOpenFile?: (path: string) => void;
}) {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const packedContext = useContextLedgerStore(
    (state) => state.latestByProject[workspaceRoot] ?? null,
  );
  const proofPulse = useProofStore((state) =>
    activeSessionId
      ? (state.latestBySession[activeSessionId]?.eventCount ?? 0)
      : 0,
  );
  const [tab, setTab] = useState<InspectorTab>("map");
  const [query, setQuery] = useState("");
  const [proofRuns, setProofRuns] = useState<ProofRun[]>([]);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [extensions, setExtensions] = useState<ExtensionsData | null>(null);
  const [metrics, setMetrics] = useState<LocalMetricRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRuns = useMemo(
    () =>
      activeSessionId
        ? proofRuns.filter((run) => run.sessionId === activeSessionId)
        : proofRuns,
    [activeSessionId, proofRuns],
  );

  const loadTab = useCallback(async () => {
    if (tab === "map" || tab === "context") return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "proof") {
        setProofRuns(await proofJournal.restore());
      } else if (tab === "memory") {
        const [stats, records, packets, surface] = await Promise.all([
          localRecords.stats(workspaceRoot),
          localRecords.list(workspaceRoot, true),
          workPacketRegistry.list(workspaceRoot),
          memorySurface.status(workspaceRoot),
        ]);
        setMemory({ stats, records, packets, surface });
      } else if (tab === "extensions") {
        const [skills, mcp, servers] = await Promise.all([
          skillRegistry.list(),
          mcpRegistry.status(),
          mcpRegistry.list(),
        ]);
        setExtensions({ skills, mcp, servers });
      } else if (tab === "reliability") {
        const [records, runs] = await Promise.all([
          localMetrics.list(100),
          proofJournal.restore(),
        ]);
        setMetrics(records);
        setProofRuns(runs);
      }
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [tab, workspaceRoot]);

  useEffect(() => {
    void loadTab();
  }, [loadTab, proofPulse]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onFocusTask(query);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
              tab === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon size={10} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {tab === "map" && (
        <MapTab
          snapshot={snapshot}
          stats={stats}
          query={query}
          setQuery={setQuery}
          submit={submit}
          onOpenFile={onOpenFile}
        />
      )}
      {tab === "context" && (
        <ContextTab snapshot={snapshot} task={task} packed={packedContext} />
      )}
      {tab === "proof" && !loading && <ProofTab runs={sessionRuns} />}
      {tab === "memory" && !loading && <MemoryTab data={memory} />}
      {tab === "extensions" && !loading && <ExtensionsTab data={extensions} />}
      {tab === "reliability" && !loading && (
        <ReliabilityTab metrics={metrics} runs={proofRuns} />
      )}
    </div>
  );
}
