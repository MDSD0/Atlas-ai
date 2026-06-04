import {
  CheckCircle2 as PassIcon,
  ShieldCheck as VerifiedIcon,
  XCircle as FailIcon,
  CircleDashed as RunningIcon,
  Ban as CancelIcon,
  FileText as FileIcon,
  Terminal as TerminalIcon,
  TriangleAlert as DiagnosticIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReceiptSummary } from "../proof/recorder";
import type { ProofRunStatus } from "../proof/contracts";
import { useProofStore } from "../store/proofStore";

type Props = {
  sessionId: string | null;
  /** Open a changed file in the editor when a receipt row is clicked. */
  onOpenFile?: (path: string) => void;
};

const STATUS_META: Record<
  ProofRunStatus,
  { label: string; className: string; Icon: typeof PassIcon }
> = {
  running: { label: "Running", className: "text-muted-foreground", Icon: RunningIcon },
  verified: { label: "Verified", className: "text-emerald-500", Icon: VerifiedIcon },
  smoke_checked: { label: "Smoke-checked", className: "text-emerald-500/80", Icon: PassIcon },
  completed: { label: "Completed", className: "text-foreground/80", Icon: PassIcon },
  unverified: { label: "Unverified", className: "text-amber-500", Icon: RunningIcon },
  failed: { label: "Failed", className: "text-destructive", Icon: FailIcon },
  cancelled: { label: "Cancelled", className: "text-muted-foreground", Icon: CancelIcon },
};

function basename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

/**
 * Whether a receipt is worth showing. A receipt is evidence of actions, so it
 * appears only when the agent actually did something — ran a tool, changed a
 * file, ran a check, hit a diagnostic, or failed. A pure-chat turn (no tools)
 * has nothing to prove and must not render "Incomplete · 0 actions" noise. This
 * holds regardless of status: an empty finished run is still nothing to show.
 */
export function shouldShowReceipt(
  summary: ReceiptSummary | undefined,
): summary is ReceiptSummary {
  if (!summary) return false;
  return (
    summary.eventCount > 0 ||
    summary.changedFiles.length > 0 ||
    summary.checks.length > 0 ||
    summary.diagnostics.length > 0 ||
    summary.failures.length > 0
  );
}

// Compact proof receipt for the latest run of a session. Failures stay expanded
// (never collapsed away). Changed files are click-through to the editor.
export function ReceiptStrip({ sessionId, onOpenFile }: Props) {
  const summary: ReceiptSummary | undefined = useProofStore((s) =>
    sessionId ? s.latestBySession[sessionId] : undefined,
  );

  if (!shouldShowReceipt(summary)) return null;

  const meta = STATUS_META[summary.status];

  return (
    <div className="flex flex-col shrink-0 border-t-2 border-border/40 bg-muted/80 px-3 py-1.5 max-h-[35%] overflow-y-auto shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.2)]">
      <div className="my-1 flex items-center gap-2 shrink-0">
        <meta.Icon size={13} strokeWidth={2} className={cn("shrink-0", meta.className)} />
        <span className={cn("text-[11px] font-medium", meta.className)}>
          {meta.label}
        </span>
        <span className="text-[11px] tabular-nums font-mono text-muted-foreground">
          {summary.eventCount} {summary.eventCount === 1 ? "action" : "actions"}
        </span>
      </div>

      {summary.changedFiles.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {summary.changedFiles.map((path) => (
            <li key={path}>
              <button
                type="button"
                onClick={() => onOpenFile?.(path)}
                title={path}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              >
                <FileIcon size={11} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{basename(path)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {summary.checks.length > 0 && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {summary.checks.map((cmd, i) => (
            <li
              key={`${cmd}-${i}`}
              title={cmd}
              className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground"
            >
              <TerminalIcon size={11} strokeWidth={1.5} className="shrink-0" />
              <span className="truncate font-mono">{cmd}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.diagnostics.length > 0 && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {summary.diagnostics.map((diagnostic, i) => (
            <li
              key={`${diagnostic}-${i}`}
              title={diagnostic}
              className="flex items-start gap-1.5 px-1 py-0.5 text-[11px] text-amber-500"
            >
              <DiagnosticIcon size={11} strokeWidth={1.5} className="mt-[2px] shrink-0" />
              <span className="min-w-0 flex-1 break-words">{diagnostic}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.failures.length > 0 && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {summary.failures.map((failure, i) => (
            <li
              key={`${failure}-${i}`}
              className="flex items-start gap-1.5 rounded bg-destructive/10 px-1.5 py-1 text-[11px] text-destructive"
            >
              <FailIcon size={11} strokeWidth={1.5} className="mt-[2px] shrink-0" />
              <span className="min-w-0 flex-1 break-words">{failure}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
