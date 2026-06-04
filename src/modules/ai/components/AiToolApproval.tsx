import { X as Cancel01Icon, Edit as Edit02Icon, FileEdit as FileEditIcon, FilePlus as FilePlusIcon, FolderPlus as FolderAddIcon, Terminal as TerminalIcon, Check as Tick02Icon, Wrench as ToolsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


import type { ToolUIPart } from "ai";
import { memo } from "react";
import { useChatStore } from "../store/chatStore";

type Props = {
  part: Extract<ToolUIPart, { state: "approval-requested" }>;
  toolName: string;
  onRespond: (approved: boolean) => void;
};

const TOOL_META: Record<string, { label: string; icon: typeof FilePlusIcon }> =
  {
    write_file: { label: "Write file", icon: FilePlusIcon },
    edit: { label: "Edit file", icon: FileEditIcon },
    multi_edit: { label: "Edit file (batch)", icon: Edit02Icon },
    create_directory: { label: "Create directory", icon: FolderAddIcon },
    bash_run: { label: "Run shell command", icon: TerminalIcon },
    bash_background: { label: "Spawn background process", icon: TerminalIcon },
  };

function AiToolApprovalImpl({ part, toolName, onRespond }: Props) {
  const meta = TOOL_META[toolName];
  const label = meta?.label ?? toolName;
  const Icon = meta?.icon ?? ToolsIcon;
  const input = part.input as Record<string, unknown>;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="size-1.5 shrink-0 rounded-full bg-[#A5E605] animate-pulse" />
        <Icon
          size={13}
          strokeWidth={1.5}
          className="shrink-0 text-muted-foreground"
        />
        <span className="text-[12px] font-medium text-foreground">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          needs approval
        </span>
      </div>

      <div className="px-3 py-2.5">
        <PreviewBlock toolName={toolName} input={input} />
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond(false)}
          className="h-7 gap-1.5 text-[11px]"
        >
          <Cancel01Icon size={12} strokeWidth={1.5} />
          Deny
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => onRespond(true)}
          className="h-7 gap-1.5 text-[11px]"
        >
          <Tick02Icon size={12} strokeWidth={1.5} />
          Approve
        </Button>
      </div>
    </div>
  );
}

export const AiToolApproval = memo(AiToolApprovalImpl, (a, b) => {
  // The approval card never changes content for a given approvalId — once
  // the model has emitted the approval-requested part with its input, we
  // don't want to re-render on every downstream token.
  return (
    a.toolName === b.toolName &&
    a.part.approval.id === b.part.approval.id &&
    a.onRespond === b.onRespond
  );
});

function PreviewBlock({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  if (toolName === "bash_run" || toolName === "bash_background") {
    const project = useChatStore.getState().live.getProjectContext();
    const cwd =
      typeof input.cwd === "string" ? input.cwd : project.executionCwd;
    return (
      <div className="space-y-1.5">
        {cwd && (
          <div className="font-mono text-[10.5px] text-muted-foreground">
            execution cwd: {cwd}
          </div>
        )}
        <pre
          className={cn(
            "max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed",
          )}
        >
          {String(input.command ?? "")}
        </pre>
      </div>
    );
  }
  // For file mutations we deliberately do NOT preview content here —
  // streamed write/edit content thrashes the UI and the AI diff tab is the
  // authoritative place to review the change. Show just the path + a
  // one-line size hint so the user knows what's being touched.
  if (toolName === "write_file") {
    const content = typeof input.content === "string" ? input.content : "";
    const lines = content ? content.split("\n").length : 0;
    return (
      <div className="space-y-0.5 font-mono text-[11px]">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        <div className="text-[10.5px] text-muted-foreground/80">
          {lines} line{lines === 1 ? "" : "s"} · review in the diff tab
        </div>
      </div>
    );
  }
  if (toolName === "edit") {
    const oldStr = typeof input.old_string === "string" ? input.old_string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string : "";
    const removed = oldStr ? oldStr.split("\n").length : 0;
    const added = newStr ? newStr.split("\n").length : 0;
    return (
      <div className="space-y-1 font-mono text-[11px]">
        <div className="text-muted-foreground">
          {String(input.path ?? "")}
          {input.replace_all ? " · replace all" : ""}
        </div>
        <InlineMiniDiff oldStr={oldStr} newStr={newStr} />
        <div className="text-[10.5px] text-muted-foreground/80">
          −{removed} / +{added} line{added === 1 && removed === 1 ? "" : "s"} ·
          full review in the diff tab
        </div>
      </div>
    );
  }
  if (toolName === "multi_edit") {
    const edits = Array.isArray(input.edits)
      ? (input.edits as Array<{ old_string?: string; new_string?: string }>)
      : [];
    return (
      <div className="space-y-0.5 font-mono text-[11px]">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        <div className="text-[10.5px] text-muted-foreground/80">
          {edits.length} edit{edits.length === 1 ? "" : "s"} · review in the
          diff tab
        </div>
      </div>
    );
  }
  if (toolName === "create_directory") {
    return (
      <div className="font-mono text-[11px] text-muted-foreground">
        {String(input.path ?? "")}
      </div>
    );
  }
  return (
    <pre className="overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

// Compact removed/added preview for an `edit` approval, so the change is
// visible in chat without opening the diff tab. Bounded so a large edit can
// never thrash the card.
const MINI_DIFF_MAX_LINES = 6;

function InlineMiniDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  if (!oldStr && !newStr) return null;
  const clip = (s: string) => {
    const lines = s.split("\n");
    const shown = lines.slice(0, MINI_DIFF_MAX_LINES);
    return { shown, more: lines.length - shown.length };
  };
  const removed = clip(oldStr);
  const added = clip(newStr);
  return (
    <div className="overflow-hidden rounded-md border border-border/50 text-[10.5px] leading-relaxed">
      {removed.shown.map((line, i) => (
        <div key={`r${i}`} className="flex bg-destructive/10 text-destructive">
          <span className="w-4 shrink-0 select-none text-center opacity-70">−</span>
          <span className="min-w-0 flex-1 overflow-x-auto whitespace-pre pr-2">{line || " "}</span>
        </div>
      ))}
      {removed.more > 0 && (
        <div className="px-2 text-[10px] italic text-muted-foreground">…{removed.more} more removed</div>
      )}
      {added.shown.map((line, i) => (
        <div key={`a${i}`} className="flex bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <span className="w-4 shrink-0 select-none text-center opacity-70">+</span>
          <span className="min-w-0 flex-1 overflow-x-auto whitespace-pre pr-2">{line || " "}</span>
        </div>
      ))}
      {added.more > 0 && (
        <div className="px-2 text-[10px] italic text-muted-foreground">…{added.more} more added</div>
      )}
    </div>
  );
}
