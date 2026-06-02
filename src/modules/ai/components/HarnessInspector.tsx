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
  { id: "extensions", label: "Extensions", Icon: ExtensionsIcon },
  { id: "reliability", label: "Reliability", Icon: ReliabilityIcon },
];

function when(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "not finished";
}

function empty(message: string) {
  return (
    <div className="border border-border/60 px-2 py-3 text-[11px] text-muted-foreground">
      {message}
    </div>
  );
}

function MapTab({
  snapshot,
  stats,
  query,
  setQuery,
  submit,
}: {
  snapshot: RepoContextResponse;
  stats: RealityStat[];
  query: string;
  setQuery: (query: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
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
          className="min-w-0 flex-1 border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
        />
        <button
          type="submit"
          title="Project task subgraph"
          className="flex size-7 items-center justify-center rounded border border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SearchIcon size={12} strokeWidth={1.5} />
        </button>
      </form>

      <RepoMapGraph
        snapshot={snapshot}
        focus={query}
        selectedPath={selectedPath}
        onSelectPath={setSelectedPath}
      />

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>{snapshot.graph_edge_count.toLocaleString()} weighted links</span>
        <span>{snapshot.rank_iterations} rank passes</span>
        <span>{snapshot.ranking_strategy}</span>
      </div>

      {selectedPath && (
        <div className="border-t border-border/60 pt-2">
          <div className="truncate text-[11px] font-medium text-foreground/90">
            {selectedPath}
          </div>
          {relations.length === 0 ? (
            <div className="mt-1 text-[10px] text-muted-foreground">
              No visible ranked links for this file.
            </div>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {relations.slice(0, 8).map((relation, index) => (
                <li
                  key={`${relation.source}:${relation.target}:${relation.symbol}:${index}`}
                  className="text-[10px] text-muted-foreground"
                >
                  <span className="text-foreground/80">{relation.symbol}</span>
                  {" - "}
                  {relation.source === selectedPath
                    ? relation.target
                    : relation.source}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="divide-y divide-border/50 border-y border-border/60">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-start gap-2 py-1.5">
            <span className="flex-1 text-[10px] text-muted-foreground">
              {stat.label}
              {stat.hint ? ` - ${stat.hint}` : ""}
            </span>
            <span className="text-[11px] font-medium tabular-nums text-foreground">
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextTab({
  snapshot,
  task,
}: {
  snapshot: RepoContextResponse;
  task: string;
}) {
  return (
    <div className="flex flex-col gap-3 text-[11px]">
      <div>
        <div className="font-medium text-foreground/90">Task subgraph</div>
        <div className="mt-1 break-words text-muted-foreground">{task}</div>
      </div>
      <div className="divide-y divide-border/50 border-y border-border/60">
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Projection budget</span>
          <span>{snapshot.projected_tokens.toLocaleString()} / {snapshot.max_tokens.toLocaleString()} tokens</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Naive repository load</span>
          <span>{snapshot.naive_tokens.toLocaleString()} tokens</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Files excluded</span>
          <span>{snapshot.excluded_files.toLocaleString()}</span>
        </div>
      </div>
      <div>
        <div className="font-medium text-foreground/90">
          Included files ({snapshot.included_files.length})
        </div>
        <ul className="mt-1 flex flex-col gap-0.5">
          {snapshot.included_files.map((path) => (
            <li key={path} className="truncate text-[10px] text-muted-foreground">
              {path}
            </li>
          ))}
        </ul>
      </div>
      <details className="border-t border-border/60 pt-2">
        <summary className="cursor-pointer text-[11px] font-medium text-foreground/90">
          Bounded context preview
        </summary>
        <pre className="mt-2 whitespace-pre-wrap break-words border border-border/60 bg-muted/20 p-2 text-[10px] text-muted-foreground">
          {snapshot.context || "No context emitted."}
        </pre>
      </details>
    </div>
  );
}

function ProofTab({ runs }: { runs: ProofRun[] }) {
  if (runs.length === 0) return empty("No proof runs recorded for this session.");
  return (
    <div className="flex flex-col gap-3">
      {runs.slice(0, 12).map((run) => (
        <details key={run.id} className="border-b border-border/60 pb-2">
          <summary className="cursor-pointer text-[11px] text-foreground/90">
            <span className="font-medium">{run.status}</span>
            {" - "}
            {run.events.length} events
            {" - "}
            {when(run.finishedAt)}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {run.events.map((event) => (
              <li key={event.id} className="border-l border-border/70 pl-2 text-[10px]">
                <div className="text-foreground/80">
                  {event.sequence}. {event.kind}
                </div>
                <div className="break-words text-muted-foreground">
                  {event.summary.preview}
                </div>
                {event.boundedPayload && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-muted-foreground">
                      payload
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words border border-border/60 bg-muted/20 p-1.5 text-[9px] text-muted-foreground">
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
  if (!data) return empty("Local memory has not been loaded.");
  return (
    <div className="flex flex-col gap-3 text-[11px]">
      <div className="divide-y divide-border/50 border-y border-border/60">
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Provider</span>
          <span>{data.stats.provider}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Active records</span>
          <span>{data.stats.active}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Stale records</span>
          <span>{data.stats.stale}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Filesystem surface</span>
          <span>{data.surface.enabled ? "enabled" : "disabled"}</span>
        </div>
      </div>
      {data.surface.enabled && (
        <div className="text-[10px] text-muted-foreground">
          index: {data.surface.indexPath}
        </div>
      )}
      <div>
        <div className="font-medium text-foreground/90">
          Work packets ({data.packets.length})
        </div>
        {data.packets.length === 0
          ? empty("No resumable work packets for this project.")
          : data.packets.slice(0, 20).map((packet) => (
              <details key={packet.id} className="mt-1 border-b border-border/60 pb-1.5">
                <summary className="cursor-pointer text-foreground/90">
                  {packet.status}
                  {" - "}
                  <span className="text-muted-foreground">
                    {packet.originalGoal}
                  </span>
                </summary>
                <div className="mt-1 break-words text-muted-foreground">
                  next: {packet.nextSuggestedAction}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  packet: {packet.id}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  proof refs: {packet.proofRunIds.length}
                </div>
              </details>
            ))}
      </div>
      {data.records.length === 0
        ? empty("No local memory records for this project.")
        : data.records.slice(0, 30).map((record) => (
            <details key={record.id} className="border-b border-border/60 pb-2">
              <summary className="cursor-pointer text-[11px] text-foreground/90">
                {record.kind}
                {" - "}
                <span className="text-muted-foreground">{record.status}</span>
              </summary>
              <div className="mt-1 break-words text-muted-foreground">
                {record.content}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                source run: {record.sourceRunId ?? "none"}
              </div>
              {record.sourceArtifacts.map((artifact) => (
                <div key={artifact} className="truncate text-[10px] text-muted-foreground">
                  artifact: {artifact}
                </div>
              ))}
              {record.staleReason && (
                <div className="mt-1 text-[10px] text-amber-500">
                  stale: {record.staleReason}
                </div>
              )}
            </details>
          ))}
    </div>
  );
}

function ExtensionsTab({ data }: { data: ExtensionsData | null }) {
  if (!data) return empty("Extension registries have not been loaded.");
  return (
    <div className="flex flex-col gap-4 text-[11px]">
      <div>
        <div className="font-medium text-foreground/90">
          Skills ({data.skills.length})
        </div>
        {data.skills.length === 0
          ? empty("No local skills installed.")
          : data.skills.map((skill) => (
              <details key={skill.id} className="mt-1 border-b border-border/60 pb-1.5">
                <summary className="cursor-pointer text-foreground/90">
                  {skill.name}
                  {" - "}
                  <span className="text-muted-foreground">
                    {skill.enabled ? "enabled" : "disabled"}
                  </span>
                </summary>
                <div className="mt-1 text-muted-foreground">{skill.description}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  prompt estimate: {Math.ceil(skill.prompt.length / 4)} tokens
                </div>
                <div className="text-[10px] text-muted-foreground">
                  tools: {skill.allowedTools.join(", ") || "none"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  hooks: {skill.hooks.join(", ") || "none"}
                </div>
              </details>
            ))}
      </div>
      <div>
        <div className="font-medium text-foreground/90">
          MCP ({data.mcp.state})
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {data.mcp.transport} - protocol {data.mcp.protocolVersion}
        </div>
        {data.servers.length === 0
          ? empty("No MCP servers configured.")
          : data.servers.map((server) => (
              <details key={server.id} className="mt-1 border-b border-border/60 pb-1.5">
                <summary className="cursor-pointer text-foreground/90">
                  {server.name}
                  {" - "}
                  <span className="text-muted-foreground">
                    {server.enabled ? "enabled" : "disabled"}
                  </span>
                </summary>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  transport: {server.transport}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  default tool policy: {server.defaultToolPolicy}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  configured tools: {Object.keys(server.tools).length}
                </div>
              </details>
            ))}
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
    <div className="flex flex-col gap-3 text-[11px]">
      <div className="divide-y divide-border/50 border-y border-border/60">
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Verified runs</span>
          <span>{summary.verifiedRuns} / {summary.finishedRuns} ({summary.verifiedRatio}%)</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Failed runs</span>
          <span>{summary.failedRuns}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Incomplete runs</span>
          <span>{summary.incompleteRuns}</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-muted-foreground">Tool failures</span>
          <span>{summary.toolFailures}</span>
        </div>
      </div>
      <div>
        <div className="font-medium text-foreground/90">
          Local measurements ({metrics.length})
        </div>
        <ul className="mt-1 flex flex-col gap-1">
          {metrics.slice(0, 30).map((metric) => (
            <li key={metric.id} className="flex gap-2 text-[10px]">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {metric.name}
              </span>
              <span className="tabular-nums text-foreground/80">
                {metric.value} {metric.unit}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function HarnessInspector({
  snapshot,
  stats,
  workspaceRoot,
  task,
  onFocusTask,
}: {
  snapshot: RepoContextResponse;
  stats: RealityStat[];
  workspaceRoot: string;
  task: string;
  onFocusTask: (task: string) => void;
}) {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
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
  }, [loadTab]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onFocusTask(query);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border-b border-border/60">
        <div className="flex min-w-max gap-3">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1 border-b-2 px-0.5 pb-1.5 text-[10px]",
                tab === id
                  ? "border-foreground/70 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={11} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-[11px] text-muted-foreground">Loading inspector...</div>
      )}
      {error && (
        <div className="border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
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
        />
      )}
      {tab === "context" && <ContextTab snapshot={snapshot} task={task} />}
      {tab === "proof" && !loading && <ProofTab runs={sessionRuns} />}
      {tab === "memory" && !loading && <MemoryTab data={memory} />}
      {tab === "extensions" && !loading && <ExtensionsTab data={extensions} />}
      {tab === "reliability" && !loading && (
        <ReliabilityTab metrics={metrics} runs={proofRuns} />
      )}
    </div>
  );
}
