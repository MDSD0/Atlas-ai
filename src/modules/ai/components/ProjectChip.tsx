import { Folder as FolderIcon, FolderOpen as FolderOpenIcon, Plus as PlusIcon, Check as CheckIcon } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  listKnownProjects,
  openProjectFromDialog,
  startUnboundSession,
  switchToProject,
} from "@/modules/workspace/projectFlow";
import {
  useWorkspaceStore,
  workspaceBindingErrorMessage,
} from "@/modules/workspace/workspaceStore";

// Composer project chip: existing projects, add new (from scratch / existing
// folder), and explicit unbound. All actions route through the shared
// projectFlow so the composer, sidebar, and welcome screen stay consistent.
export function ProjectChip() {
  const projectName = useWorkspaceStore((s) => s.projectName);
  const workspaceRoot = useWorkspaceStore((s) => s.workspaceRoot);
  const [open, setOpen] = useState(false);
  const projects = open ? listKnownProjects() : [];

  const pick = async () => {
    try {
      await openProjectFromDialog();
    } catch (error) {
      window.alert(workspaceBindingErrorMessage(error));
    }
    setOpen(false);
  };

  const toProject = async (root: string) => {
    try {
      await switchToProject(root);
    } catch (error) {
      window.alert(workspaceBindingErrorMessage(error));
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={workspaceRoot ?? "Unbound — no project"}
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {workspaceRoot ? (
            <FolderIcon size={12} strokeWidth={1.5} className="shrink-0" />
          ) : (
            <FolderOpenIcon size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
          )}
          <span className="max-w-32 truncate">{projectName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-panel min-w-56 text-xs">
        {projects.length > 0 && (
          <>
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.workspaceRoot ?? "unbound"}
                onSelect={() => void toProject(p.workspaceRoot as string)}
              >
                <FolderIcon size={12} strokeWidth={1.5} className="mr-2 shrink-0" />
                <span className="flex-1 truncate" title={p.workspaceRoot ?? undefined}>
                  {p.name}
                </span>
                {p.workspaceRoot === workspaceRoot && (
                  <CheckIcon size={12} strokeWidth={2} className="ml-2 shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => void pick()}>
          <PlusIcon size={12} strokeWidth={1.5} className="mr-2 shrink-0" />
          Add project (open folder)…
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            startUnboundSession();
            setOpen(false);
          }}
        >
          <FolderOpenIcon size={12} strokeWidth={1.5} className="mr-2 shrink-0 opacity-60" />
          <span className="flex-1">Don&apos;t work in a project</span>
          {!workspaceRoot && (
            <CheckIcon size={12} strokeWidth={2} className="ml-2 shrink-0" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
