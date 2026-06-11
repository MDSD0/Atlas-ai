import { FolderOpen as FolderOpenIcon, History as HistoryIcon, X as Cancel01Icon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useCallback, useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { openProjectFromDialog, openProjectFromPath } from "./projectFlow";
import { PendingApprovals } from "@/modules/ai/components/PendingApprovals";
import { PlanReviewDock } from "@/modules/ai/components/PlanReviewDock";
import {
  useWorkspaceStore,
  workspaceBindingErrorMessage,
  type RecentWorkspace,
} from "./workspaceStore";
import { currentWorkspaceEnv } from "./env";
import { getOrCreateChat, useChatStore } from "@/modules/ai/store/chatStore";
import { AiChatView } from "@/modules/ai/components/AiChat";
import { AiInput } from "@/modules/ai/components/AiInputBar";
import { SessionsList } from "@/modules/ai/components/SessionsPanel";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";


function truncatePath(path: string, maxLen = 52): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.length <= maxLen) return normalized;
  const mid = Math.floor(maxLen / 2) - 2;
  return normalized.slice(0, mid) + "..." + normalized.slice(-mid);
}

function RecentItem({
  recent,
  onOpen,
  onRemove,
}: {
  recent: RecentWorkspace;
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    invoke<{ kind: string }>("fs_stat", {
      path: recent.path,
      workspace: currentWorkspaceEnv(),
    }).catch(() => {
      if (alive) setStale(true);
    });
    return () => {
      alive = false;
    };
  }, [recent.path]);

  return (
    <div
      data-testid="atlas-recent-workspace"
      data-path={recent.path}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        stale
          ? "opacity-50"
          : "cursor-pointer hover:bg-accent hover:text-accent-foreground",
      )}
      onClick={() => !stale && onOpen(recent.path)}
      role={stale ? undefined : "button"}
      tabIndex={stale ? undefined : 0}
      onKeyDown={(e) => {
        if (!stale && (e.key === "Enter" || e.key === " ")) onOpen(recent.path);
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground/90">
          {recent.name}
        </span>
        <span
          className={cn(
            "truncate text-[11px]",
            stale ? "text-destructive/80" : "text-muted-foreground",
          )}
          title={recent.path}
        >
          {stale ? "Folder unavailable" : truncatePath(recent.path)}
        </span>
      </div>
      <button
        type="button"
        aria-label="Remove from recent"
              className={cn(
            "rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(recent.path);
          }}
        >
          <Cancel01Icon size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function WelcomeScreen() {
  const sessionId = useChatStore((s) => s.activeSessionId);

  if (!sessionId) return null;

  return <WelcomeScreenContent sessionId={sessionId} />;
}

function WelcomeScreenContent({ sessionId }: { sessionId: string }) {
  const { recentWorkspaces, removeRecent, workspaceRoot } = useWorkspaceStore();
  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat });
  const sessions = useChatStore((s) => s.sessions);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const firstSession = sessions[0] ?? null;
  const historyTitle = firstSession
    ? `${firstSession.projectName ?? "Unbound"} / ${firstSession.title || "New chat"}`
    : "Session history";

  const handleOpenFolder = useCallback(async () => {
    try {
      await openProjectFromDialog();
    } catch (error) {
      window.alert(workspaceBindingErrorMessage(error));
    }
  }, []);

  const handleOpenRecent = useCallback(async (path: string) => {
    try {
      await openProjectFromPath(path);
    } catch (error) {
      window.alert(workspaceBindingErrorMessage(error));
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="absolute right-5 top-4 z-20">
        <DropdownMenu
          modal={false}
          open={sessionsOpen}
          onOpenChange={setSessionsOpen}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md border border-border/60 bg-card/75 text-muted-foreground shadow-sm backdrop-blur-xl backdrop-saturate-150 hover:bg-accent hover:text-accent-foreground"
              title={historyTitle}
            >
              <HistoryIcon size={15} strokeWidth={1.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="overflow-hidden rounded-xl border-border/60 bg-popover/80 p-0 shadow-xl shadow-black/25 backdrop-blur-2xl backdrop-saturate-150"
          >
            <SessionsList
              compact
              onSelectSession={() => setSessionsOpen(false)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar-deep">
        {helpers.messages.length > 0 ? (
          <div className="mx-auto w-full max-w-4xl py-6 px-4">
            <AiChatView
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              stop={helpers.stop}
              scrollKey={`home:${sessionId}`}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-10">
            <div className="flex w-full max-w-2xl flex-col gap-6">
              {/* Wordmark */}
              <div className="flex flex-col gap-1 items-center text-center mb-4">
                <img src="/logo-transparent.png" alt="Atlas Logo" className="w-12 h-12 mb-1 object-contain opacity-90" style={{ filter: "hue-rotate(70deg) saturate(1.2)" }} />
                <h1 
                  className="text-5xl tracking-tighter text-brand drop-shadow-[0_2px_15px_color-mix(in_srgb,var(--brand)_20%,transparent)] pb-1 pr-2"
                  style={{ fontFamily: "'Good Times', sans-serif" }}
                >
                  ATLAS
                </h1>
                <p className="text-base text-muted-foreground">
                  What do you want to build?
                </p>
              </div>

              {/* Secondary action: Open Folder */}
              {!workspaceRoot && (
                <div className="flex gap-4 justify-center">
                  <button
                    id="welcome-open-folder"
                    type="button"
                    onClick={handleOpenFolder}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium",
                      "text-brand shadow-sm transition-colors hover:bg-brand/15",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                    )}
                  >
                    <FolderOpenIcon
                      size={16}
                      strokeWidth={1.5}
                      className="shrink-0 text-brand/80"
                    />
                    Open Folder
                  </button>
                </div>
              )}

              {/* Recent workspaces */}
              {!workspaceRoot && recentWorkspaces.length > 0 && (
                <div className="flex flex-col gap-2 mt-4 max-w-md mx-auto w-full">
                  <span className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 text-center">
                    Recent Workspaces
                  </span>
                  <div className="flex flex-col border border-border/40 bg-card/30 rounded-xl overflow-hidden shadow-sm">
                    {recentWorkspaces.map((r) => (
                      <div key={r.path} className={cn("border-b border-border/40 last:border-0")}>
                        <RecentItem
                          recent={r}
                          onOpen={handleOpenRecent}
                          onRemove={removeRecent}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="mx-auto w-full max-w-4xl shrink-0 px-4">
        <PlanReviewDock sessionId={sessionId} messages={helpers.messages} />
        <PendingApprovals
          messages={helpers.messages}
          onRespond={(id, approved) =>
            helpers.addToolApprovalResponse({ id, approved })
          }
        />
      </div>

      {/* Integrated Composer */}
      <div className="shrink-0 mx-auto w-full max-w-4xl px-4 pb-6 pt-2">
        <AiInput />
      </div>
    </div>
  );
}
