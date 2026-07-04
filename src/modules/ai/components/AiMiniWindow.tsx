import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { X as Cancel01Icon, CheckCircle2 as CheckmarkCircle02Icon, ChevronDown as ChevronDownIcon, FileText as File01Icon, GitCompare as GitCompareIcon, PanelRightClose as PanelRightCloseIcon, PanelRightOpen as PanelRightOpenIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { estimateCost, getModel, getModelContextLimit } from "../config";
import type { ResizeDir } from "../lib/miniWindowGeometry";

import { useMiniWindowGeometry } from "../lib/useMiniWindowGeometry";
import { useAgentsStore } from "../store/agentsStore";
import { getOrCreateChat, useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { usePlanStore } from "../store/planStore";
import { AiChatView } from "./AiChat";
import { PlanDiffReview } from "./PlanDiffReview";
import { SessionsList } from "./SessionsPanel";
import { TodoStrip } from "./TodoStrip";
import { ReceiptStrip } from "./ReceiptStrip";
import { AiInput } from "./AiInputBar";
import { PendingApprovals } from "./PendingApprovals";
import { PlanReviewDock } from "./PlanReviewDock";

const SUGGESTIONS = [
  {
    label: "Explain this file",
    hint: "Summarize what the current file does",
    icon: File01Icon,
    text: "Explain what this file does and how it fits into the project.",
  },
  {
    label: "Review my changes",
    hint: "Check recent edits for issues",
    icon: GitCompareIcon,
    text: "Review my recent changes and point out potential issues or improvements.",
  },
  {
    label: "Help me write a test",
    hint: "Generate tests for selected code",
    icon: CheckmarkCircle02Icon,
    text: "Help me write tests for the current file or selected function.",
  },
];

export function AiMiniWindow() {
  const closeMini = useChatStore((s) => s.closeMini);
  const sessionId = useChatStore((s) => s.activeSessionId);
  const openPanel = useChatStore((s) => s.openPanel);
  const dock = useChatStore((s) => s.mini.dock);
  const setMiniDock = useChatStore((s) => s.setMiniDock);
  const expandToPanel = () => {
    closeMini();
    openPanel();
  };

  const { ref, onHeaderPointerDown, startResize } = useMiniWindowGeometry(dock);
  const toggleDock = () => {
    setMiniDock(dock === "right" ? "floating" : "right");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        closeMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMini]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      data-ai-mini-window
      className={cn(
        "no-scrollbar-deep fixed z-40 flex flex-col overflow-hidden",
        "rounded-xl border border-border/55 bg-card/80 text-[12px] backdrop-blur-2xl backdrop-saturate-150",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_-18px_rgba(0,0,0,0.72)]",
        "ring-1 ring-black/5 dark:ring-white/5",
      )}
    >
      {RESIZE_DIRS.map((dir) => (
        <ResizeHandle key={dir} dir={dir} onPointerDown={startResize(dir)} />
      ))}
      {sessionId ? (
        <Body
          sessionId={sessionId}
          onClose={closeMini}
          onExpand={expandToPanel}
          dock={dock}
          onToggleDock={toggleDock}
          onHeaderPointerDown={onHeaderPointerDown}
        />
      ) : (
        <EmptyShell
          onClose={closeMini}
          onExpand={expandToPanel}
          dock={dock}
          onToggleDock={toggleDock}
          onHeaderPointerDown={onHeaderPointerDown}
        />
      )}
      <PlanDiffReview />
    </motion.div>
  );
}

export function AiDockedPanel() {
  const closeMini = useChatStore((s) => s.closeMini);
  const sessionId = useChatStore((s) => s.activeSessionId);
  const setMiniDock = useChatStore((s) => s.setMiniDock);
  const floatPanel = () => setMiniDock("floating");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        closeMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMini]);

  return (
    <div
      data-ai-mini-window
      className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border/60 bg-card/80 text-[12px] shadow-[inset_1px_0_0_rgba(255,255,255,0.035)] backdrop-blur-2xl backdrop-saturate-150"
    >
      {sessionId ? (
        <Body
          sessionId={sessionId}
          onClose={closeMini}
          onExpand={() => {}}
          dock="right"
          onToggleDock={floatPanel}
          onHeaderPointerDown={() => {}}
        />
      ) : (
        <EmptyShell
          onClose={closeMini}
          onExpand={() => {}}
          dock="right"
          onToggleDock={floatPanel}
          onHeaderPointerDown={() => {}}
        />
      )}
      <PlanDiffReview />
    </div>
  );
}

const RESIZE_HANDLE_CLASS: Record<ResizeDir, string> = {
  n: "top-0 left-3 right-3 h-1.5 cursor-ns-resize",
  s: "bottom-0 left-3 right-3 h-1.5 cursor-ns-resize",
  w: "top-3 bottom-3 left-0 w-1.5 cursor-ew-resize",
  e: "top-3 bottom-3 right-0 w-1.5 cursor-ew-resize",
  nw: "top-0 left-0 size-3 cursor-nwse-resize",
  ne: "top-0 right-0 size-3 cursor-nesw-resize",
  sw: "bottom-0 left-0 size-3 cursor-nesw-resize",
  se: "bottom-0 right-0 size-3 cursor-nwse-resize",
};

const RESIZE_DIRS: ResizeDir[] = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];

function ResizeHandle({
  dir,
  onPointerDown,
}: {
  dir: ResizeDir;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      data-no-drag
      onPointerDown={onPointerDown}
      className={cn("absolute z-50 touch-none select-none", RESIZE_HANDLE_CLASS[dir])}
    />
  );
}

function Body({
  sessionId,
  onClose,
  onExpand,
  dock,
  onToggleDock,
  onHeaderPointerDown,
}: {
  sessionId: string;
  onClose: () => void;
  onExpand: () => void;
  dock: "floating" | "right";
  onToggleDock: () => void;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
}) {
  const focusInput = useChatStore((s) => s.focusInput);
  const step = useChatStore((s) => s.agentMeta.step);

  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  return (
    <>
      <Header
        step={step}
        isBusy={isBusy}
        onClose={onClose}
        onExpand={onExpand}
        dock={dock}
        onToggleDock={onToggleDock}
        messages={helpers.messages}
        onHeaderPointerDown={onHeaderPointerDown}
      />

      <PlanModeStrip />

      <div className="flex min-h-0 flex-1 flex-col">
        {helpers.messages.length === 0 ? (
          <EmptyState onPick={focusInput} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&_.text-sm]:text-[12px] [&_p]:leading-relaxed">
            <AiChatView
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              regenerate={helpers.regenerate}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              stop={helpers.stop}
              sessionId={sessionId}
              scrollKey={`mini:${sessionId}`}
            />
          </div>
        )}
      </div>

      <TodoStrip sessionId={sessionId} />
      <ReceiptStrip sessionId={sessionId} />
      <PlanReviewDock sessionId={sessionId} messages={helpers.messages} />
      <PendingApprovals
        messages={helpers.messages}
        onRespond={(id, approved) =>
          helpers.addToolApprovalResponse({ id, approved })
        }
      />
      <div className="shrink-0">
        <AiInput />
      </div>
    </>
  );
}

function PlanModeStrip() {
  const sessionId = useChatStore((s) => s.activeSessionId);
  const active = usePlanStore((s) => s.isActive(sessionId));
  const queueLen = usePlanStore((s) => s.queueFor(sessionId).length);
  const disable = usePlanStore((s) => s.disable);
  if (!active) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-brand" />
      <span className="text-[11px] font-medium text-foreground">Plan mode</span>
      <span className="text-[11px] text-muted-foreground">
        {queueLen > 0 ? `· ${queueLen} queued` : "· no edits queued"}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => disable(sessionId)}
        className="rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Exit
      </button>
    </div>
  );
}

function EmptyShell({
  onClose,
  onExpand,
  dock,
  onToggleDock,
  onHeaderPointerDown,
}: {
  onClose: () => void;
  onExpand: () => void;
  dock: "floating" | "right";
  onToggleDock: () => void;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <>
      <Header
        step={null}
        isBusy={false}
        onClose={onClose}
        onExpand={onExpand}
        dock={dock}
        onToggleDock={onToggleDock}
        onHeaderPointerDown={onHeaderPointerDown}
      />
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
        Loading sessions…
      </div>
    </>
  );
}

function Header({
  step,
  isBusy,
  onClose,
  messages,
  dock,
  onToggleDock,
  onHeaderPointerDown,
}: {
  step: string | null;
  isBusy: boolean;
  onClose: () => void;
  onExpand: () => void;
  dock: "floating" | "right";
  onToggleDock: () => void;
  messages?: UIMessage[];
  onHeaderPointerDown: (e: React.PointerEvent) => void;
}) {
  const customAgents = useAgentsStore((s) => s.customAgents);
  void customAgents;

  return (
    <div
      onPointerDown={onHeaderPointerDown}
      className={cn(
        "relative flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3",
        dock === "floating" && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {messages !== undefined ? (
          <ContextIndicator messages={messages} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isBusy ? (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Spinner className="size-2.5" />
            <span className="max-w-32 truncate">{step ?? "Thinking…"}</span>
          </span>
        ) : null}
        <SessionNameLabel />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onToggleDock}
          className="size-5"
          aria-label={dock === "right" ? "Float agent panel" : "Dock agent panel right"}
          title={dock === "right" ? "Float agent panel" : "Dock agent panel right"}
        >
          {dock === "right" ? (
            <PanelRightOpenIcon size={11} strokeWidth={1.5} />
          ) : (
            <PanelRightCloseIcon size={11} strokeWidth={1.5} />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="size-5"
          aria-label="Close"
          title="Close (Esc)"
        >
          <Cancel01Icon size={11} strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}

function estimateTokens(messages: UIMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text") {
        chars += (p as { text?: string }).text?.length ?? 0;
      } else if (p.type === "reasoning") {
        chars += (p as { text?: string }).text?.length ?? 0;
      } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const tp = p as unknown as { input?: unknown; output?: unknown };
        if (tp.input) chars += JSON.stringify(tp.input).length;
        if (tp.output) chars += JSON.stringify(tp.output).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function ContextIndicator({ messages }: { messages: UIMessage[] }) {
  const modelId = useChatStore((s) => s.selectedModelId);
  const tokens = useChatStore((s) => s.agentMeta.tokens);
  const lastInput = useChatStore((s) => s.agentMeta.lastInputTokens);
  const lastCached = useChatStore((s) => s.agentMeta.lastCachedTokens);
  const estimated = useMemo(() => estimateTokens(messages), [messages]);
  const used = lastInput > 0 ? lastInput : estimated;
  const reported = tokens.inputTokens + tokens.outputTokens;
  const openaiCompatibleContextLimit = usePreferencesStore(
    (s) => s.openaiCompatibleContextLimit,
  );
  const max = getModelContextLimit(modelId, openaiCompatibleContextLimit);
  const modelLabel = useMemo(() => {
    try {
      return getModel(modelId).label;
    } catch {
      return modelId;
    }
  }, [modelId]);
  const cost = estimateCost(modelId, tokens);
  const cacheRate =
    tokens.inputTokens > 0
      ? Math.round((tokens.cachedInputTokens / tokens.inputTokens) * 100)
      : 0;

  return (
    <Context usedTokens={used} maxTokens={max} modelId={modelId}>
      <ContextTrigger className="h-6 gap-1 px-0 text-[10.5px]" />
      <ContextContent className="w-64 text-[11px]">
        <ContextContentHeader />
        <ContextContentBody>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Model</span>
            <span className="font-mono text-foreground">{modelLabel}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-muted-foreground">
            <span>{lastInput > 0 ? "Last request" : "Estimated context"}</span>
            <span className="font-mono text-foreground">
              {formatTokens(used)}
            </span>
          </div>
          {lastCached > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Of which cached</span>
              <span className="font-mono text-foreground">
                {formatTokens(lastCached)}
              </span>
            </div>
          )}
          {reported > 0 && (
            <>
              <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
                <span>Session input</span>
                <span className="font-mono text-foreground">
                  {formatTokens(tokens.inputTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Session output</span>
                <span className="font-mono text-foreground">
                  {formatTokens(tokens.outputTokens)}
                </span>
              </div>
              {tokens.cachedInputTokens > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Cache hit</span>
                  <span className="font-mono text-foreground">{cacheRate}%</span>
                </div>
              )}
              {cost != null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Session cost</span>
                  <span className="font-mono text-foreground">
                    ${cost.toFixed(cost < 0.01 ? 4 : cost < 1 ? 3 : 2)}
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Window</span>
            <span className="font-mono text-foreground">
              {formatTokens(max)}
            </span>
          </div>
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-[10px] italic text-muted-foreground">
            {lastInput > 0
              ? "Last request reflects current context size; session totals are cumulative."
              : "Token count is approximate (chars / 4)."}
          </span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}

function SessionNameLabel() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const focusInput = useChatStore((s) => s.focusInput);
  const [open, setOpen] = useState(false);
  const active = sessions.find((s) => s.id === activeId) ?? null;
  if (!active) return null;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex max-w-44 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground/85 hover:bg-accent hover:text-accent-foreground"
          title={active.workspaceRoot ?? "Unbound session"}
        >
          <span className="truncate">{active.title || "New chat"}</span>
          <ChevronDownIcon size={10} strokeWidth={1.5} className="shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="overflow-hidden rounded-xl border-border/60 bg-popover/80 p-0 shadow-xl shadow-black/25 backdrop-blur-2xl backdrop-saturate-150"
      >
        <SessionsList
          compact
          onSelectSession={() => {
            setOpen(false);
            focusInput(null);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-10 text-center">
      <img src="/logo.png" alt="Atlas" className="size-11 object-contain opacity-95" />
      <div className="space-y-1.5">
        <p className="text-[16px] font-semibold tracking-tight">
          Ask <span 
            className="tracking-tighter text-brand pr-1"
            style={{ fontFamily: "'Good Times', sans-serif" }}
          >ATLAS</span> anything
        </p>
        <p className="max-w-[18rem] text-[11.5px] leading-relaxed text-muted-foreground">
          Atlas has context about your workspace, open files, and recent changes.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.text)}
            className={cn(
              "group flex items-center gap-2.5 bg-card/70 rounded-lg px-2.5 py-2 border border-border text-left",
              "transition-colors hover:border-brand/40 hover:bg-brand/10",
            )}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover:bg-brand/20 group-hover:text-brand">
              {s.icon && <s.icon size={13} strokeWidth={1.5} />
            }</div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-foreground transition-colors group-hover:text-brand">
                {s.label}
              </div>
              <div className="text-[10.5px] text-muted-foreground transition-colors group-hover:text-brand/70">
                {s.hint}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
