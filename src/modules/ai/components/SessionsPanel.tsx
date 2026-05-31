import { Trash2 as Delete02Icon, Folder as FolderIcon, FolderOpen as FolderOpenIcon, MoreVertical as MoreVerticalIcon, Pencil as PencilEdit01Icon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";


import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/modules/workspace";

import { useChatStore } from "@/modules/ai";
import type { SessionMeta } from "@/modules/ai/lib/sessions";

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function workspaceLabel(path: string | null): string {
  return path ? basename(path) : "Unbound";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

type WorkspaceGroup = {
  workspaceRoot: string | null; // null = unassigned
  sessions: SessionMeta[];
  stale: boolean;
};

function groupByWorkspace(sessions: SessionMeta[]): WorkspaceGroup[] {
  const map = new Map<string | null, SessionMeta[]>();
  for (const s of sessions) {
    const key = s.workspaceRoot ?? null;
    const existing = map.get(key) ?? [];
    existing.push(s);
    map.set(key, existing);
  }

  const groups: WorkspaceGroup[] = [];
  // Named workspaces first, then unassigned
  for (const [root, sess] of map) {
    if (root !== null) {
      groups.push({ workspaceRoot: root, sessions: sess, stale: false });
    }
  }
  // Sort named groups by most recently updated session
  groups.sort((a, b) => {
    const aTs = Math.max(...a.sessions.map((s) => s.updatedAt));
    const bTs = Math.max(...b.sessions.map((s) => s.updatedAt));
    return bTs - aTs;
  });
  if (map.has(null)) {
    groups.push({ workspaceRoot: null, sessions: map.get(null)!, stale: false });
  }
  return groups;
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  session: SessionMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setRenameValue(session.title);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [renaming, session.title]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(session.id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="min-w-0 flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-[12px] text-foreground outline-none"
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect(session.id)}
          title={session.title}
        >
          {session.title}
        </button>
      )}

      <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/60">
        {relativeTime(session.updatedAt)}
      </span>

      {/* Three-dot menu */}
      <div className="relative">
        <button
          type="button"
          aria-label="Session options"
          className={cn(
            "rounded p-0.5 text-muted-foreground transition-opacity",
            menuOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreVerticalIcon size={12} strokeWidth={1.5} />
        </button>

        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
              >
                <PencilEdit01Icon size={12} strokeWidth={1.5} />
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-destructive hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(session.id);
                }}
              >
                <Delete02Icon size={12} strokeWidth={1.5} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WorkspaceGroupSection({
  group,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  onOpenWorkspace,
  onRemoveStale,
}: {
  group: WorkspaceGroup;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenWorkspace: (path: string) => void;
  onRemoveStale: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const label = workspaceLabel(group.workspaceRoot);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setCollapsed((v) => !v)}
        >
          <span
            className={cn(
              "shrink-0 text-[9px] text-muted-foreground/60 transition-transform",
              collapsed ? "-rotate-90" : "rotate-0",
            )}
          >
            ▾
          </span>
          <FolderIcon
            size={14}
            strokeWidth={1.5}
            className="shrink-0 text-muted-foreground/80"
          />
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              group.stale
                ? "text-destructive/70"
                : "text-muted-foreground/80",
            )}
            title={group.workspaceRoot ?? undefined}
          >
            {label}
          </span>
          {group.stale && (
            <span className="shrink-0 rounded bg-destructive/15 px-1 text-[9px] font-medium text-destructive/80">
              missing
            </span>
          )}
        </button>

        {group.workspaceRoot !== null && !group.stale && (
          <button
            type="button"
            aria-label="Open workspace folder"
            className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
            onClick={() => onOpenWorkspace(group.workspaceRoot!)}
          >
            <FolderOpenIcon size={11} strokeWidth={1.5} />
          </button>
        )}
        {group.stale && group.workspaceRoot !== null && (
          <button
            type="button"
            aria-label="Remove stale workspace"
            className="shrink-0 rounded p-0.5 text-[10px] text-muted-foreground/50 hover:text-foreground"
            onClick={() => onRemoveStale(group.workspaceRoot!)}
            title="Remove stale workspace reference"
          >
            remove
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex flex-col px-1 pb-1">
          {group.sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionsList({
  compact = false,
  onSelectSession,
}: {
  compact?: boolean;
  onSelectSession?: () => void;
}) {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const openPanel = useChatStore((s) => s.openPanel);
  const focusInput = useChatStore((s) => s.focusInput);
  const { setWorkspaceRoot, removeRecent } = useWorkspaceStore();

  const [staleMap, setStaleMap] = useState<Map<string, boolean>>(new Map());

  // Batch-check stale workspace paths once on mount
  useEffect(() => {
    const uniqueRoots = [
      ...new Set(sessions.map((s) => s.workspaceRoot).filter(Boolean) as string[]),
    ];
    if (uniqueRoots.length === 0) return;

    let alive = true;
    Promise.all(
      uniqueRoots.map(async (root) => {
        try {
          await invoke("fs_stat", { path: root });
          return [root, false] as const;
        } catch {
          return [root, true] as const;
        }
      }),
    ).then((results) => {
      if (!alive) return;
      setStaleMap(new Map(results));
    });

    return () => {
      alive = false;
    };
  }, []); // only on mount

  const groups = useMemo(() => {
    const raw = groupByWorkspace(sessions);
    return raw.map((g) => ({
      ...g,
      stale: g.workspaceRoot !== null ? (staleMap.get(g.workspaceRoot) ?? false) : false,
    }));
  }, [sessions, staleMap]);

  const handleSelect = useCallback(
    (id: string) => {
      switchSession(id);
      if (!compact) openPanel();
      focusInput(null);
      onSelectSession?.();
    },
    [switchSession, compact, openPanel, focusInput, onSelectSession],
  );

  const handleOpenWorkspace = useCallback(
    async (path: string) => {
      await setWorkspaceRoot(path);
    },
    [setWorkspaceRoot],
  );

  const handleRemoveStale = useCallback(
    async (path: string) => {
      removeRecent(path);
      // Delete sessions associated with this stale workspace
      for (const s of sessions) {
        if (s.workspaceRoot === path) {
          deleteSession(s.id);
        }
      }
    },
    [sessions, removeRecent, deleteSession],
  );



  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-xs text-muted-foreground">No sessions yet.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-y-auto px-2 py-1",
        compact && "max-h-[min(70vh,620px)] w-[min(92vw,400px)] py-2",
      )}
    >
      <div className="px-3 pb-2 pt-1 text-[13px] font-medium text-muted-foreground">
        Projects
      </div>
      {groups.map((group) => (
        <WorkspaceGroupSection
          key={group.workspaceRoot ?? "__unassigned__"}
          group={group}
          activeSessionId={activeSessionId}
          onSelect={handleSelect}
          onRename={renameSession}
          onDelete={deleteSession}
          onOpenWorkspace={handleOpenWorkspace}
          onRemoveStale={handleRemoveStale}
        />
      ))}
    </div>
  );
}

export function SessionsPanel() {
  return <SessionsList />;
}
