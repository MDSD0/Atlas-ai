import { memo, useMemo } from "react";
import type { ToolUIPart, UIMessage } from "ai";
import { AiToolApproval } from "./AiToolApproval";

type ApprovalPart = Extract<ToolUIPart, { state: "approval-requested" }>;

export type PendingApproval = { part: ApprovalPart; toolName: string };

/** All unanswered approval requests across the conversation, oldest first. */
export function collectPendingApprovals(
  messages: UIMessage[],
): PendingApproval[] {
  const out: PendingApproval[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const raw of m.parts) {
      const p = raw as { type?: string; state?: string; toolName?: string };
      if (p.state !== "approval-requested") continue;
      const type = p.type ?? "";
      const toolName =
        type === "dynamic-tool"
          ? (p.toolName ?? "tool")
          : type.replace(/^tool-/, "") || "tool";
      out.push({ part: raw as unknown as ApprovalPart, toolName });
    }
  }
  return out;
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
  if (pending.length === 0) return null;
  return (
    <div
      data-testid="atlas-pending-approvals"
      className="flex max-h-[45%] shrink-0 flex-col gap-2 overflow-y-auto border-t border-border/40 bg-background/95 px-3 py-2"
    >
      {pending.map(({ part, toolName }) => (
        <AiToolApproval
          key={part.approval.id}
          part={part}
          toolName={toolName}
          onRespond={(approved) => onRespond(part.approval.id, approved)}
        />
      ))}
    </div>
  );
});
