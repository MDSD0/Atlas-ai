import { X as Cancel01Icon, Check as Tick02Icon, MessageSquare as CommentIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { AiDiffStatus } from "@/modules/tabs";
import { presentableDiff, unifiedMergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";


import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSharedExtensions, languageCompartment } from "./lib/extensions";
import { resolveLanguage, resolveLanguageSync } from "./lib/languageResolver";
import { EDITOR_THEME_EXT } from "./lib/themes";

type Props = {
  path: string;
  originalContent: string;
  proposedContent: string;
  status: AiDiffStatus;
  isNewFile: boolean;
  onAccept: () => void;
  /** Accept with user modifications: some hunks rejected or hand-edited. */
  onAcceptAmended: (mergedContent: string) => void;
  onReject: () => void;
  /** Reject the whole change and hand a steering note to the composer. */
  onRejectWithFeedback: (note: string) => void;
};

const SHARED_EXT: Extension[] = buildSharedExtensions();

const DIFF_THEME = EditorView.theme({
  ".cm-changedText": {
    background: "#88ff881a !important",
  },
});

const STATUS_LABEL: Record<AiDiffStatus, string> = {
  pending: "Pending review",
  approved: "Applied",
  rejected: "Rejected",
};

const STATUS_BADGE: Record<
  AiDiffStatus,
  "outline" | "secondary" | "destructive"
> = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
};

export function AiDiffPane({
  path,
  originalContent,
  proposedContent,
  status,
  isNewFile,
  onAccept,
  onAcceptAmended,
  onReject,
  onRejectWithFeedback,
}: Props) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const editorThemeId = usePreferencesStore((s) => s.editorTheme);
  const themeExt = EDITOR_THEME_EXT[editorThemeId] ?? EDITOR_THEME_EXT.atomone;
  const pending = status === "pending";
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const initialLang = useMemo(() => resolveLanguageSync(path), [path]);
  const extensions = useMemo(
    () => [
      ...SHARED_EXT,
      languageCompartment.of(initialLang ?? []),
      // Pending diffs stay editable so the user can amend the proposed file.
      ...(pending
        ? []
        : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
      unifiedMergeView({
        original: originalContent,
        mergeControls: false,
        highlightChanges: true,
        gutter: true,
        syntaxHighlightDeletions: true,
        collapseUnchanged: { margin: 3, minSize: 6 },
      }),
      DIFF_THEME,
    ],
    [originalContent, initialLang, pending],
  );

  useEffect(() => {
    if (initialLang) return;
    let cancelled = false;
    resolveLanguage(path).then((ext) => {
      if (cancelled) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: languageCompartment.reconfigure(ext ?? []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [path, initialLang]);

  const stats = useMemo(
    () => computeLineStats(originalContent, proposedContent),
    [originalContent, proposedContent],
  );

  const currentDoc = useCallback(
    () => cmRef.current?.view?.state.doc.toString() ?? proposedContent,
    [proposedContent],
  );

  const onAcceptClick = useCallback(() => {
    const doc = currentDoc();
    if (doc === proposedContent) onAccept();
    else onAcceptAmended(doc);
  }, [currentDoc, proposedContent, onAccept, onAcceptAmended]);

  const onSendFeedback = useCallback(() => {
    const note = feedback.trim();
    setFeedbackOpen(false);
    setFeedback("");
    if (note) onRejectWithFeedback(note);
    else onReject();
  }, [feedback, onRejectWithFeedback, onReject]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            className="text-[11px] px-2.5 py-2.5"
            variant={STATUS_BADGE[status]}
          >
            {STATUS_LABEL[status]}
          </Badge>
          {isNewFile ? (
            <span className="shrink-0 rounded-full border border-border/60 bg-accent/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              New file
            </span>
          ) : null}
          <span
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={path}
          >
            {path}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{stats.added}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              −{stats.removed}
            </span>
          </span>
        </div>
        {pending ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden text-[10px] text-muted-foreground lg:inline">
              Edit the proposal directly before accepting
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={onAcceptClick}
              className="h-7 gap-1.5"
            >
              <Tick02Icon size={13} strokeWidth={1.5} />
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFeedbackOpen((v) => !v)}
              className="h-7 gap-1.5"
              title="Reject and tell the agent what to change"
            >
              <CommentIcon size={13} strokeWidth={1.5} />
              Revise…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              className="h-7 gap-1.5"
            >
              <Cancel01Icon size={13} strokeWidth={1.5} />
              Reject
            </Button>
          </div>
        ) : null}
      </div>

      {pending && feedbackOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/60 px-3 py-2">
          <input
            autoFocus
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSendFeedback();
              if (e.key === "Escape") setFeedbackOpen(false);
            }}
            placeholder="What should the agent change? Rejects this diff and sends your note."
            className="h-7 flex-1 rounded-md border border-border/60 bg-background px-2 text-[11.5px] outline-none focus:border-ring"
          />
          <Button size="sm" className="h-7" onClick={onSendFeedback}>
            Reject & send
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          ref={cmRef}
          value={proposedContent}
          theme={themeExt}
          extensions={extensions}
          editable={pending}
          height="100%"
          className="h-full"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            searchKeymap: true,
          }}
        />
      </div>
    </div>
  );
}

function computeLineStats(
  original: string,
  proposed: string,
): { added: number; removed: number } {
  const changes = presentableDiff(original, proposed);
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    removed += countLines(original, c.fromA, c.toA);
    added += countLines(proposed, c.fromB, c.toB);
  }
  return { added, removed };
}

function countLines(doc: string, from: number, to: number): number {
  if (from === to) return 0;
  const slice = doc.slice(from, to);
  // A change spanning N newlines touches N+1 lines, but a trailing newline
  // means the final segment is empty — don't count that as a touched line.
  let n = 1;
  for (let i = 0; i < slice.length; i++) {
    if (slice.charCodeAt(i) === 10) n++;
  }
  if (slice.endsWith("\n")) n--;
  return Math.max(n, 1);
}
