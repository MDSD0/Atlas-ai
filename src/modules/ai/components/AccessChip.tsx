import { ShieldCheck as ShieldIcon, Check as CheckIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { APPROVAL_MODES } from "../lib/permissions";
import { useChatStore } from "../store/chatStore";

// Composer access-mode chip. Resets to default on new or switched sessions.
// Modes only suppress approval prompts for otherwise-permitted calls. The
// dangerous-command, secret-path, and workspace-boundary guards always apply.
export function AccessChip() {
  const mode = useChatStore((s) => s.approvalMode);
  const setMode = useChatStore((s) => s.setApprovalMode);
  const active = APPROVAL_MODES.find((m) => m.id === mode) ?? APPROVAL_MODES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={active.hint}
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <ShieldIcon size={12} strokeWidth={1.5} className="shrink-0" />
          <span className="max-w-28 truncate">{active.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-panel min-w-64 text-xs">
        <DropdownMenuLabel>Access (this session)</DropdownMenuLabel>
        {APPROVAL_MODES.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => setMode(m.id)}
            className="flex flex-col items-start gap-0.5 py-1.5"
          >
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "flex-1 font-medium",
                  m.risky && "text-amber-500",
                )}
              >
                {m.label}
              </span>
              {m.id === mode && (
                <CheckIcon size={12} strokeWidth={2} className="ml-2 shrink-0" />
              )}
            </div>
            <span className="text-[10px] leading-snug text-muted-foreground">
              {m.hint}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
