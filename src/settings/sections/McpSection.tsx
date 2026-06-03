import { useCallback, useEffect, useState } from "react";
import { Plug as PlugIcon, Trash2 as TrashIcon, Plus as PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mcpRegistry } from "@/modules/ai/mcp";
import type { McpServerConfig, McpToolPolicy } from "@/modules/ai/mcp/contracts";

// MCP server management. The backend (registry + boundary + stdio transport)
// already exists; this is the missing "configure without complex steps"
// surface. Servers are disabled by default and tools deny-first — enabling a
// server never auto-trusts its tools.

const POLICIES: McpToolPolicy[] = ["deny", "ask", "allow"];

type DraftState = {
  id: string;
  name: string;
  command: string;
  args: string;
  defaultToolPolicy: McpToolPolicy;
};

const EMPTY_DRAFT: DraftState = {
  id: "",
  name: "",
  command: "",
  args: "",
  defaultToolPolicy: "deny",
};

export function McpSection() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    setServers(await mcpRegistry.list());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = useCallback(async () => {
    setError(null);
    try {
      await mcpRegistry.configure({
        id: draft.id.trim(),
        name: draft.name.trim(),
        command: draft.command.trim(),
        args: draft.args
          .split(/\s+/)
          .map((a) => a.trim())
          .filter(Boolean),
        defaultToolPolicy: draft.defaultToolPolicy,
      });
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [draft, reload]);

  const toggle = useCallback(
    async (id: string, enabled: boolean) => {
      await mcpRegistry.setEnabled(id, enabled);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await mcpRegistry.remove(id);
      await reload();
    },
    [reload],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">MCP servers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect Model Context Protocol servers (stdio). New servers start
            disabled and their tools are deny-first — you approve each tool call.
          </p>
        </div>
        {!adding && (
          <Button size="xs" onClick={() => setAdding(true)}>
            <PlusIcon size={13} strokeWidth={1.5} /> Add server
          </Button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID" value={draft.id} onChange={(id) => setDraft((d) => ({ ...d, id }))} placeholder="github" />
            <Field label="Name" value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} placeholder="GitHub" />
          </div>
          <Field label="Command" value={draft.command} onChange={(command) => setDraft((d) => ({ ...d, command }))} placeholder="npx" />
          <Field label="Args" value={draft.args} onChange={(args) => setDraft((d) => ({ ...d, args }))} placeholder="-y @modelcontextprotocol/server-github" />
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Default tool policy
            <select
              value={draft.defaultToolPolicy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, defaultToolPolicy: e.target.value as McpToolPolicy }))
              }
              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground"
            >
              {POLICIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          {error && <div className="text-[11px] text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); setError(null); }}>
              Cancel
            </Button>
            <Button size="xs" onClick={() => void submit()} disabled={!draft.id.trim() || !draft.command.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
          <PlugIcon size={20} strokeWidth={1.5} className="opacity-50" />
          No MCP servers configured.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {servers.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{s.name}</span>
                  <span className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                    s.enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                      : "border-border/50 bg-card/50 text-muted-foreground",
                  )}>
                    {s.enabled ? "enabled" : "disabled"}
                  </span>
                  <span className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    tools: {s.defaultToolPolicy}
                  </span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={`${s.command} ${s.args.join(" ")}`}>
                  {s.command} {s.args.join(" ")}
                </div>
              </div>
              <Button size="xs" variant="ghost" onClick={() => void toggle(s.id, !s.enabled)}>
                {s.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="xs" variant="ghost" aria-label="Remove" onClick={() => void remove(s.id)}>
                <TrashIcon size={13} strokeWidth={1.5} className="text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50"
      />
    </label>
  );
}
