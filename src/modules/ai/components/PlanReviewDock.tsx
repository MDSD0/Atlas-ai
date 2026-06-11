import { useEffect, useMemo, useState } from "react";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "../store/chatStore";
import { usePlanStore } from "../store/planStore";

function latestAssistantPlan(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n\n")
      .trim();
    if (text) return text;
  }
  return "";
}

export function PlanReviewDock({
  sessionId,
  messages,
}: {
  sessionId: string;
  messages: UIMessage[];
}) {
  const active = usePlanStore((s) => s.isActive(sessionId));
  const queueLen = usePlanStore((s) => s.queueFor(sessionId).length);
  const disable = usePlanStore((s) => s.disable);
  const plan = useMemo(() => latestAssistantPlan(messages), [messages]);
  const [draft, setDraft] = useState(plan);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setDraft(plan);
    setComment("");
  }, [plan]);

  if (!active || queueLen > 0 || !plan) return null;

  const proceed = () => {
    const body = [
      '<atlas-control hidden="true" action="plan-proceed" />',
      "",
      "Proceed with this approved plan. Execute it now.",
      "",
      "<approved_plan>",
      draft.trim(),
      "</approved_plan>",
      comment.trim()
        ? `<user_comment>\n${comment.trim()}\n</user_comment>`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    disable(sessionId);
    void sendMessage(body);
  };

  const revise = () => {
    const body = [
      '<atlas-control hidden="true" action="plan-revise" />',
      "",
      "Revise the plan using this feedback. Do not edit files yet.",
      "",
      "<current_plan>",
      draft.trim(),
      "</current_plan>",
      "<feedback>",
      comment.trim() || "Make the plan clearer and more complete.",
      "</feedback>",
    ].join("\n");
    void sendMessage(body);
  };

  return (
    <div className="shrink-0 border-t border-border/40 bg-background/95 px-3 py-2">
      <div className="rounded-lg border border-brand/30 bg-card/90 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-[12px] font-semibold text-foreground">
              Plan review
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              Edit the plan, add a comment, then proceed.
            </span>
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => disable(sessionId)}
            className="shrink-0"
          >
            Cancel plan
          </Button>
        </div>
        <div className="flex flex-col gap-2 p-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="max-h-56 min-h-28 resize-y bg-background/70 font-mono text-[11.5px] leading-relaxed"
          />
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Optional comment before proceeding"
            className="h-8 rounded-md border border-border bg-background/70 px-2.5 text-[12px] outline-none focus:border-foreground/40"
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!comment.trim()}
              onClick={revise}
              className="h-7 text-[11px]"
            >
              Revise
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={proceed}
              className="h-7 text-[11px]"
            >
              Proceed
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
