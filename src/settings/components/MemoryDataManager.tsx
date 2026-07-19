import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pencil as EditIcon,
  Search as SearchIcon,
  Trash2 as DeleteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { localRecords } from "@/modules/ai/memory";
import {
  isMemoryEnabled,
  setMemoryEnabled,
} from "@/modules/ai/memory/enabled";
import type { MemoryRecord } from "@/modules/ai/memory/contracts";
import { native } from "@/modules/ai/lib/native";

export function MemoryDataManager() {
  const [root, setRoot] = useState<string | null>(null);
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [editing, setEditing] = useState<MemoryRecord | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (projectRoot: string) => {
    setRecords(await localRecords.list(projectRoot));
  }, []);

  useEffect(() => {
    void Promise.all([native.workspaceCurrentDir(), isMemoryEnabled()])
      .then(async ([projectRoot, memoryEnabled]) => {
        setRoot(projectRoot);
        setEnabled(memoryEnabled);
        await reload(projectRoot);
      })
      .catch((loadError) => setError(String(loadError)));
  }, [reload]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      `${record.kind} ${record.content} ${record.tags.join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, records]);

  const remove = async (record: MemoryRecord) => {
    if (!root) return;
    await localRecords.delete(root, record.id);
    await reload(root);
  };

  const saveCorrection = async () => {
    if (!root || !editing || !draft.trim()) return;
    await localRecords.remember({
      projectId: root,
      kind: editing.kind,
      content: draft,
      sourceRunId: editing.sourceRunId,
      sourceArtifacts: editing.sourceArtifacts,
      confidence: editing.confidence,
      tags: editing.tags,
    });
    await localRecords.delete(root, editing.id);
    setEditing(null);
    setDraft("");
    await reload(root);
  };

  return (
    <section className="border-t border-border/60 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium">Project memory</div>
          <p className="mt-1 max-w-lg text-[11.5px] text-muted-foreground">
            Advisory facts retained for the current project. Current files always override these records.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          Use memory
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              void setMemoryEnabled(checked);
            }}
          />
        </label>
      </div>

      {root ? (
        <div className="mt-3 text-[10px] text-muted-foreground" title={root}>
          Current project: <span className="font-mono">{root}</span>
        </div>
      ) : null}

      <div className="relative mt-3">
        <SearchIcon
          size={13}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stored memory"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[11px] outline-none focus:border-brand/60"
        />
      </div>

      {error ? <div className="mt-2 text-[11px] text-destructive">{error}</div> : null}

      <div className="mt-2 max-h-64 overflow-y-auto border border-border/60">
        {filtered.length === 0 ? (
          <div className="px-3 py-5 text-center text-[11px] text-muted-foreground">
            No matching memory records.
          </div>
        ) : (
          filtered.map((record) => (
            <div
              key={record.id}
              className="flex items-start gap-2 border-b border-border/50 px-3 py-2 last:border-b-0"
            >
              <span className="mt-0.5 w-16 shrink-0 text-[9px] font-medium uppercase text-muted-foreground/70">
                {record.kind}
              </span>
              <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground/85">
                {record.content}
                {record.status === "stale" ? (
                  <div className="mt-0.5 text-[10px] text-amber-500">Stale: {record.staleReason}</div>
                ) : null}
              </div>
              <button
                type="button"
                title="Correct memory"
                aria-label="Correct memory"
                onClick={() => {
                  setEditing(record);
                  setDraft(record.content);
                }}
                className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
              >
                <EditIcon size={11} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                title="Delete memory"
                aria-label="Delete memory"
                onClick={() => void remove(record)}
                className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:text-destructive"
              >
                <DeleteIcon size={11} strokeWidth={1.5} />
              </button>
            </div>
          ))
        )}
      </div>

      {editing ? (
        <div className="mt-2 border border-border/60 bg-card p-3">
          <label className="text-[11px] font-medium">Correct stored memory</label>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-2 min-h-20 w-full resize-y rounded-md border border-border bg-background p-2 text-[11px] outline-none focus:border-brand/60"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="xs" onClick={() => void saveCorrection()} disabled={!draft.trim()}>
              Save correction
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
