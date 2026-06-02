import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ArrowUp, X as Cancel01Icon, Code as CodeIcon, Hash as HashtagIcon, Key as Key01Icon, Mic as Mic01Icon, Plus as PlusSignIcon, Terminal as TerminalIcon, BookOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { AnimatePresence, motion } from "motion/react";
import { appleSpring } from "@/styles/motion";
import { useEffect, useMemo, useState, useRef } from "react";
import { useComposer, type FileAttachment } from "../lib/composer";
import { useWorkspaceFiles } from "../hooks/useWorkspaceFiles";
import { SLASH_COMMANDS } from "../lib/slashCommands";
import type { Snippet } from "../lib/snippets";
import { useChatStore } from "../store/chatStore";
import { useSnippetsStore } from "../store/snippetsStore";
import { ModelDropdown } from "./AiStatusBarControls";
import { ProjectChip } from "./ProjectChip";
import { AccessChip } from "./AccessChip";
import { FilePickerContent } from "./FilePicker";
import { SnippetPickerContent, type PickerItem } from "./SnippetPicker";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { hasAnyKey } from "../lib/keyring";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { open } from "@tauri-apps/plugin-dialog";

export function AiInput() {
  const apiKeys = useChatStore((s) => s.apiKeys);
  const lmstudioModelId = usePreferencesStore((s) => s.lmstudioModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const mlxModelId = usePreferencesStore((s) => s.mlxModelId);
  const mlxBaseURL = usePreferencesStore((s) => s.mlxBaseURL);
  const ollamaModelId = usePreferencesStore((s) => s.ollamaModelId);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);
  const openaiCompatibleModelId = usePreferencesStore((s) => s.openaiCompatibleModelId);
  const openaiCompatibleBaseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);

  const hasLocalModel =
    (lmstudioBaseURL.trim().length > 0 && lmstudioModelId.trim().length > 0) ||
    (mlxBaseURL.trim().length > 0 && mlxModelId.trim().length > 0) ||
    (ollamaBaseURL.trim().length > 0 && ollamaModelId.trim().length > 0) ||
    (openaiCompatibleBaseURL.trim().length > 0 && openaiCompatibleModelId.trim().length > 0);
  
  const hasComposer = hasAnyKey(apiKeys) || hasLocalModel;

  return hasComposer ? (
    <AiInputBar />
  ) : (
    <AiInputBarConnect onAdd={() => void openSettingsWindow("models")} />
  );
}

type SnippetTrigger = {
  start: number;
  end: number;
  query: string;
};

type FileTrigger = {
  start: number;
  end: number;
  query: string;
};

function detectSnippetTrigger(
  value: string,
  caret: number,
): SnippetTrigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "#") {
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev)) return null;
      const slice = value.slice(i + 1, caret);
      if (!/^[a-z0-9-]*$/i.test(slice)) return null;
      return { start: i, end: caret, query: slice.toLowerCase() };
    }
    if (/\s/.test(ch)) return null;
    if (!/[a-z0-9-]/i.test(ch)) return null;
  }
  return null;
}

function detectFileTrigger(
  value: string,
  caret: number,
): FileTrigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "@") {
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev)) return null;
      const slice = value.slice(i + 1, caret);
      return { start: i, end: caret, query: slice };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/**
 * Unified ChatGPT-style composer shell.
 * All controls (model pill, attach, voice, send) live inside one
 * rounded card that visually belongs to the chat panel.
 */
export function AiInputBar() {
  const c = useComposer();
  const allSnippets = useSnippetsStore((s) => s.all());
  const workspaceRoot = useChatStore((s) => s.live.getWorkspaceRoot());

  const [trigger, setTrigger] = useState<SnippetTrigger | null>(null);
  const [fileTrigger, setFileTrigger] = useState<FileTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const workspaceFiles = useWorkspaceFiles(workspaceRoot, fileTrigger !== null);
  const localRef = useRef<HTMLTextAreaElement>(null);

  const [fileQuery, setFileQuery] = useState("");
  useEffect(() => {
    if (!fileTrigger) {
      setFileQuery("");
      return;
    }
    const q = fileTrigger.query;
    const t = window.setTimeout(() => setFileQuery(q), 50);
    return () => window.clearTimeout(t);
  }, [fileTrigger]);

  useEffect(() => {
    autoresize(localRef.current);
  }, [c.value]);

  const updateTrigger = () => {
    const el = localRef.current;
    if (!el) {
      setTrigger(null);
      setFileTrigger(null);
      return;
    }
    const caret = el.selectionStart ?? 0;
    setTrigger(detectSnippetTrigger(c.value, caret));
    setFileTrigger(detectFileTrigger(c.value, caret));
  };

  useEffect(updateTrigger, [c.value]);

  const filteredItems = useMemo<PickerItem[]>(() => {
    if (!trigger) return [];
    const q = trigger.query;
    const cmdItems: PickerItem[] = Object.values(SLASH_COMMANDS)
      .filter(
        (c) => !q || c.name.includes(q) || c.label.toLowerCase().includes(q),
      )
      .map((command) => ({ kind: "command", command }));
    const snipItems: PickerItem[] = allSnippets
      .filter(
        (s: Snippet) =>
          !q ||
          s.handle.includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q),
      )
      .map((snippet: Snippet) => ({ kind: "snippet", snippet }));
    return [...cmdItems, ...snipItems];
  }, [trigger, allSnippets]);

  const FILE_PICKER_CAP = 30;
  const filteredFiles = useMemo<string[]>(() => {
    if (!fileTrigger) return [];
    const q = fileQuery.toLowerCase();
    if (!q) return workspaceFiles.files.slice(0, FILE_PICKER_CAP);
    const out: string[] = [];
    for (const f of workspaceFiles.files) {
      if (f.toLowerCase().includes(q)) {
        out.push(f);
        if (out.length >= FILE_PICKER_CAP) break;
      }
    }
    return out;
  }, [fileTrigger, fileQuery, workspaceFiles.files]);

  const fileTriggerOpen = fileTrigger !== null;
  const snippetTriggerOpen = trigger !== null;
  useEffect(() => {
    setActiveIndex(0);
  }, [snippetTriggerOpen, fileTriggerOpen, fileQuery]);

  const pickerOpen = trigger !== null || fileTrigger !== null;

  const onPickItem = (item: PickerItem) => {
    if (!trigger) return;
    const before = c.value.slice(0, trigger.start);
    const afterRaw = c.value.slice(trigger.end);
    let insert = "";
    if (item.kind === "snippet") {
      const needsSpace = afterRaw.length === 0 || !/^\s/.test(afterRaw);
      insert = `#${item.snippet.handle}${needsSpace ? " " : ""}`;
      c.addSnippet(item.snippet);
    } else {
      c.addCommand(item.command);
    }
    const after =
      item.kind === "command" ? afterRaw.replace(/^\s+/, "") : afterRaw;
    c.setValue(`${before}${insert}${after}`);
    setTrigger(null);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const el = localRef.current;
      if (!el) return;
      const caret = before.length + insert.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const onPickFile = async (filePath: string) => {
    if (!fileTrigger || !workspaceRoot) return;
    const before = c.value.slice(0, fileTrigger.start);
    const after = c.value.slice(fileTrigger.end);
    c.setValue(`${before}${after}`);
    setFileTrigger(null);
    setActiveIndex(0);
    const fullPath = workspaceRoot.endsWith("/")
      ? `${workspaceRoot}${filePath}`
      : `${workspaceRoot}/${filePath}`;
    await c.attachFileByPath(fullPath);
    requestAnimationFrame(() => {
      const el = localRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  const pickActive = () => {
    if (fileTrigger) {
      const file = filteredFiles[activeIndex];
      if (file) void onPickFile(file);
      return;
    }
    const it = filteredItems[activeIndex];
    if (it) onPickItem(it);
  };

  const voiceLabel = c.voice.recording
    ? "Listening…"
    : c.voice.transcribing
      ? "Transcribing…"
      : null;



  return (
    <div className="shrink-0 px-3 py-2">
      {/* Unified composer card */}
      <div
        className={cn(
          "glass-panel flex flex-col gap-0 rounded-2xl bg-card shadow-sm",
          "transition-shadow focus-within:shadow-md focus-within:border-border",
          "overflow-hidden",
        )}
      >
        {/* Chips row — file/snippet attachments */}
        <ChipsRow
          files={c.files}
          onRemoveFile={c.removeFile}
          snippets={c.pickedSnippets}
          onRemoveSnippet={(id) => {
            const snip = c.pickedSnippets.find((s) => s.id === id);
            c.removeSnippet(id);
            if (!snip) return;
            const re = new RegExp(`(^|\\s)#${snip.handle}\\b ?`);
            c.setValue((v) => v.replace(re, (_m, lead: string) => lead));
          }}
          commands={c.pickedCommands}
          onRemoveCommand={(name) => c.removeCommand(name)}
        />

        {/* Textarea */}
        <Popover open={pickerOpen}>
          <PopoverAnchor asChild>
            <div className="px-3 pt-2.5 pb-1">
              <textarea
                ref={(node) => {
                  localRef.current = node;
                  if (node) {
                    c.textareaRef.current = node;
                  }
                }}
                value={c.value}
                onChange={(e) => c.setValue(e.target.value)}
                onKeyUp={updateTrigger}
                onClick={updateTrigger}
                onSelect={updateTrigger}
                onKeyDown={(e) => {
                  if (pickerOpen) {
                    const items = fileTrigger ? filteredFiles : filteredItems;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((i) =>
                        Math.min(i + 1, Math.max(0, items.length - 1)),
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(0, i - 1));
                      return;
                    }
                    if (e.key === "Tab" || e.key === "Enter") {
                      if (items.length > 0) {
                        e.preventDefault();
                        pickActive();
                        return;
                      }
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      if (fileTrigger) {
                        const before = c.value.slice(0, fileTrigger.start);
                        const after = c.value.slice(fileTrigger.end);
                        c.setValue(`${before}${after}`);
                        setFileTrigger(null);
                      } else {
                        setTrigger(null);
                      }
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    c.submit();
                  }
                }}
                placeholder="Ask Atlas anything   ·   # skills   @ files"
                rows={1}
                className={cn(
                  "w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none",
                  "placeholder:text-muted-foreground/50",
                  "max-h-44",
                )}
              />
            </div>
          </PopoverAnchor>
          {fileTrigger ? (
            <FilePickerContent
              files={filteredFiles}
              activeIndex={activeIndex}
              indexing={workspaceFiles.indexing}
              truncated={workspaceFiles.truncated}
              hasWorkspace={workspaceRoot !== null}
              onPick={(f) => void onPickFile(f)}
              onHover={setActiveIndex}
            />
          ) : (
            <SnippetPickerContent
              items={filteredItems}
              activeIndex={activeIndex}
              onPick={onPickItem}
              onHover={setActiveIndex}
            />
          )}
        </Popover>

        {/* Voice status indicator */}
        <AnimatePresence initial={false}>
          {voiceLabel && (
            <motion.div
              key={voiceLabel}
              initial={{ opacity: 0, scale: 0.98, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={appleSpring}
              className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-muted-foreground"
            >
              {c.voice.recording ? (
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
              ) : (
                <Spinner className="size-3" />
              )}
              <span className="truncate">{voiceLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom toolbar — model pill + action buttons */}
        <div className="flex items-center gap-1 border-t border-border/40 bg-card/50 px-2 py-1.5">
          {/* Project + Access + Model/Agent selector pills — live inside composer */}
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <ProjectChip />
            <AccessChip />
            <ModelDropdown />
          </div>

          {/* Pick file from OS (Images/External) or Skills */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <PlusSignIcon size={14} strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel text-xs max-h-64 overflow-y-auto">
              <DropdownMenuItem
                onSelect={async () => {
                  const result = await open({
                    multiple: true,
                    directory: false,
                  });
                  if (result) {
                    const paths = Array.isArray(result) ? result : [result];
                    for (const p of paths) {
                      void c.attachFileByPath(p);
                    }
                  }
                }}
              >
                Upload from computer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Skills</DropdownMenuLabel>
              {allSnippets.map((s: Snippet) => (
                <DropdownMenuItem key={s.id} onSelect={() => c.addSnippet(s)}>
                  <BookOpen size={12} strokeWidth={1.5} className="mr-2" />
                  <span className="flex-1 truncate">{s.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Voice / mic */}
          {c.voice.supported && c.voice.hasKey && (
            <button
              type="button"
              title={c.voice.recording ? "Stop recording" : "Voice input"}
              onClick={c.voice.recording ? c.voice.stop : c.voice.start}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                c.voice.recording
                  ? "bg-destructive/15 text-destructive"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Mic01Icon size={14} strokeWidth={1.5} />
            </button>
          )}

          {/* Stop / Send */}
          {c.isBusy ? (
            <button
              type="button"
              title="Stop"
              onClick={c.stop}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground transition-colors hover:bg-foreground/[0.15]"
            >
              <span className="size-2.5 rounded-sm bg-foreground" />
            </button>
          ) : (
            <button
              type="button"
              title="Send  (Enter)"
              disabled={!c.canSend}
              onClick={() => c.submit()}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                c.canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  : "cursor-default bg-foreground/10 text-muted-foreground/40",
              )}
            >
              <ArrowUp size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChipsRow({
  files,
  onRemoveFile,
  snippets,
  onRemoveSnippet,
  commands,
  onRemoveCommand,
}: {
  files: FileAttachment[];
  onRemoveFile: (id: string) => void;
  snippets: Snippet[];
  onRemoveSnippet: (id: string) => void;
  commands: { name: string; label: string; icon: typeof HashtagIcon }[];
  onRemoveCommand: (name: string) => void;
}) {
  if (files.length === 0 && snippets.length === 0 && commands.length === 0)
    return null;
  return (
    <div className="flex flex-wrap gap-1 px-3 pt-2.5">
      <AnimatePresence initial={false}>
        {commands.map((cmd) => (
          <motion.div
            key={`cmd-${cmd.name}`}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={appleSpring}
            className="group flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[11px]"
            title={cmd.label}
          >
            {(() => { const I = cmd.icon; return I ? <I size={11} strokeWidth={1.5} className="text-muted-foreground" /> : null; })()}
            <span className="font-medium">#{cmd.name}</span>
            <button
              type="button"
              onClick={() => onRemoveCommand(cmd.name)}
              className="ml-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove command"
            >
              <Cancel01Icon size={10} strokeWidth={1.5} />
            </button>
          </motion.div>
        ))}
        {snippets.map((s) => (
          <motion.div
            key={`snip-${s.id}`}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={appleSpring}
            className="group flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
            title={s.description || s.name}
          >
            <HashtagIcon
              size={11}
              strokeWidth={1.5}
              className="opacity-80"
            />
            <span className="font-medium">{s.handle}</span>
            <button
              type="button"
              onClick={() => onRemoveSnippet(s.id)}
              className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove snippet"
            >
              <Cancel01Icon size={10} strokeWidth={1.5} />
            </button>
          </motion.div>
        ))}
        {files.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={appleSpring}
            className="group flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[11px]"
          >
            {f.kind === "image" && f.url ? (
              <img src={f.url} alt="" className="size-4 rounded object-cover" />
            ) : f.kind === "selection" ? (
              f.source === "editor" ? <CodeIcon size={11} strokeWidth={1.5} className="text-muted-foreground" /> : <TerminalIcon size={11} strokeWidth={1.5} className="text-muted-foreground" />
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">
                {extOf(f.name)}
              </span>
            )}
            <span className="max-w-35 truncate">
              {f.name}
              {f.kind === "selection" && f.text ? (
                <span className="ml-1 text-muted-foreground">
                  · {selLineCount(f.text)}L
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => onRemoveFile(f.id)}
              className="ml-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove"
            >
              <Cancel01Icon size={10} strokeWidth={1.5} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function selLineCount(text: string): number {
  if (!text) return 0;
  const trimmed = text.replace(/\n+$/, "");
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "FILE" : name.slice(i + 1).toUpperCase();
}

function autoresize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
}

export type AiInputBarProps = { tabId: number };

export function AiInputBarConnect({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="shrink-0 px-3 py-2">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3 text-xs shadow-sm">
        <span className="text-muted-foreground">
          Connect any AI provider (or use local models) — your key stays in your
          OS keychain.
        </span>
        <Button size="xs" onClick={onAdd}>
          <Key01Icon size={14} strokeWidth={1.5} />
          Connect provider
        </Button>
      </div>
    </div>
  );
}
