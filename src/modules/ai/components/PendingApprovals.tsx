import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight as ChevronRightIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ToolUIPart, UIMessage } from "ai";
import { AiToolApproval } from "./AiToolApproval";

type ApprovalPart = Extract<ToolUIPart, { state: "approval-requested" }>;

export type PendingApproval = { part: ApprovalPart; toolName: string };

/** All unanswered approval requests across the conversation, oldest first. */
export function collectPendingApprovals(
  messages: UIMessage[],
): PendingApproval[] {
  const out: PendingApproval[] = [];
  const seenRequests = new Set<string>();
  const settled = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const raw of m.parts) {
      const p = raw as {
        type?: string;
        state?: string;
        toolName?: string;
        approval?: { id?: string };
      };
      const approvalId = p.approval?.id;
      if (!approvalId) continue;
      if (
        p.state === "approval-responded" ||
        p.state === "output-available" ||
        p.state === "output-error" ||
        p.state === "output-denied"
      ) {
        settled.add(approvalId);
        continue;
      }
      if (p.state !== "approval-requested" || seenRequests.has(approvalId)) {
        continue;
      }
      seenRequests.add(approvalId);
      const type = p.type ?? "";
      const toolName =
        type === "dynamic-tool"
          ? (p.toolName ?? "tool")
          : type.replace(/^tool-/, "") || "tool";
      out.push({ part: raw as unknown as ApprovalPart, toolName });
    }
  }
  return out.filter((pending) => !settled.has(pending.part.approval.id));
}

/**
 * Approval dock pinned above the composer. Approvals must never live only in
 * the scrollback: if the user scrolls up to read context, the approve/deny
 * buttons stay reachable here.
 */
export const PendingApprovals = memo(function PendingApprovals({
  messages,
  onRespond,
}: {
  messages: UIMessage[];
  onRespond: (approvalId: string, approved: boolean) => void;
}) {
  const pending = useMemo(() => collectPendingApprovals(messages), [messages]);
  const [open, setOpen] = useState(false);
  if (pending.length === 0) return null;
  const first = pending[0];
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-testid="atlas-pending-approvals"
      className="relative z-30 mb-2 shrink-0 overflow-hidden rounded-xl border border-brand/25 bg-background/98 shadow-2xl shadow-black/25 backdrop-blur-xl"
    >
      <CollapsibleTrigger
        data-testid="atlas-pending-approvals-toggle"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-brand" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
          {pending.length === 1
            ? `${first.toolName} needs approval`
            : `${pending.length} approvals`}
        </span>
        <ChevronRightIcon
          size={12}
          strokeWidth={1.5}
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </CollapsibleTrigger>
      {!open ? (
        <div className="truncate px-3 pb-2 font-mono text-[10.5px] text-muted-foreground">
          {previewSummary(first)}
        </div>
      ) : null}
      <CollapsibleContent>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto p-2 pt-0">
          {pending.map(({ part, toolName }) => (
            <AiToolApproval
              key={part.approval.id}
              part={part}
              toolName={toolName}
              onRespond={(approved) => onRespond(part.approval.id, approved)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

function previewSummary({ part, toolName }: PendingApproval): string {
  const input = part.input as Record<string, unknown> | undefined;
  if (!input) return toolName;
  const path = typeof input.path === "string" ? input.path : null;
  const command = typeof input.command === "string" ? input.command : null;
  return path ?? command ?? toolName;
}
