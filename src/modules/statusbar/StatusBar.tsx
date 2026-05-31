import { EyeOff as IncognitoIcon, MessageSquare as Message01Icon } from "lucide-react";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";


import { CwdBreadcrumb } from "./CwdBreadcrumb";
import { WorkspaceEnvSelector } from "./WorkspaceEnvSelector";
import type { WorkspaceEnv } from "@/modules/workspace";

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  pathMode?: "terminal" | "agent" | "file";
  workspaceRoot?: string | null;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
  onOpenMini: () => void;
  privateActive: boolean;
  isWelcomeTab: boolean;
};

export function StatusBar({
  cwd,
  filePath,
  home,
  onCd,
  pathMode = "terminal",
  workspaceRoot = null,
  onWorkspaceChange,
  onOpenMini,
  privateActive,
  isWelcomeTab,
}: Props) {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-card/75 px-3 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-xl backdrop-saturate-150">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <WorkspaceEnvSelector onSelect={onWorkspaceChange} />
        <CwdBreadcrumb
          cwd={cwd}
          filePath={filePath}
          home={home}
          mode={pathMode}
          workspaceRoot={workspaceRoot}
          onCd={onCd}
        />
        {privateActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0 cursor-default items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
                <IncognitoIcon size={11} strokeWidth={1.5} />
                <span>Private: hidden from AI</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-[11px] leading-relaxed">
              AI can't see this terminal's output. Use it for secrets, SSH, or
              anything you don't want sent to the model.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <AgentStatusPill onClick={onOpenMini} />
        {!isWelcomeTab && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenMini}
            title="Open AI conversation"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Message01Icon size={14} strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </footer>
  );
}
