import { FolderOpen as FolderOpenIcon, RefreshCw as Refresh01Icon } from "lucide-react";
import { cn } from "@/lib/utils";



type Props = {
  workspaceRoot: string | null;
  onOpenFolder: () => void;
  onRefresh: () => void;
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function WorkspaceSidebarHeader({
  workspaceRoot,
  onOpenFolder,
  onRefresh,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-card/60 px-2 py-1.5">
      {/* Workspace name / status */}
      <button
        type="button"
        onClick={onOpenFolder}
        title={workspaceRoot ?? "Open a folder"}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
          "text-[11px] font-medium transition-colors",
          workspaceRoot
            ? "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <FolderOpenIcon
          size={13}
          strokeWidth={1.5}
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate">
          {workspaceRoot ? basename(workspaceRoot) : "Open Folder"}
        </span>
      </button>

      {/* Refresh — only useful when a workspace is open */}
      {workspaceRoot && (
        <button
          type="button"
          title="Refresh file tree"
          onClick={onRefresh}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Refresh01Icon size={13} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
