import { Folder as FolderGitTwoIcon, FolderTree as FolderTreeIcon, MessageSquare as MessageMultiple01Icon, Boxes as RealityIcon } from "lucide-react";
import { cn } from "@/lib/utils";


import type { SidebarViewId } from "./types";


export const SIDEBAR_RAIL_HEIGHT = 36;

type RailItem = {
  id: SidebarViewId;
  label: string;
  icon: any;
  badge?: number;
  requiresWorkspace?: boolean;
};

type Props = {
  activeView: SidebarViewId;
  onSelectView: (view: SidebarViewId) => void;
  changedCount: number;
  workspaceRoot: string | null;
};

export function SidebarRail({ activeView, onSelectView, changedCount, workspaceRoot }: Props) {
  const items: RailItem[] = [
    { id: "explorer", label: "Files", icon: FolderTreeIcon, requiresWorkspace: true },
    { id: "reality", label: "Reality", icon: RealityIcon, requiresWorkspace: true },
    {
      id: "source-control",
      label: "Source Control",
      icon: FolderGitTwoIcon,
      badge: changedCount,
      requiresWorkspace: true,
    },
    { id: "sessions", label: "Sessions", icon: MessageMultiple01Icon },
  ];


  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-stretch gap-1 border-t border-border/60 bg-card/85 px-1.5 py-1 backdrop-blur"
    >
      {items.map((item) => {
        const isActive = item.id === activeView;
        const disabled = item.requiresWorkspace && !workspaceRoot;
        const showBadge = !!item.badge && item.badge > 0;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={isActive}
            disabled={disabled}
            title={disabled ? "Open a folder to use this" : item.label}
            onClick={() => !disabled && onSelectView(item.id)}
            className={cn(
              "group relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[11px] font-medium outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-primary/40",
              disabled
                ? "cursor-not-allowed opacity-35 text-muted-foreground"
                : isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {(() => { const I = item.icon; return I ? <I size={15} strokeWidth={1.5} /> : null; })()}
            <span>{item.label}</span>
            {showBadge ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 bg-card px-1 text-[9px] font-semibold leading-none tabular-nums text-muted-foreground/95">
                {item.badge! > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
