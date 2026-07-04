import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWhisperRecording } from "../hooks/useWhisperRecording";
import { expandSnippetTokens, type Snippet } from "../lib/snippets";
import { tryRunSlashCommand, type SlashCommandMeta } from "./slashCommands";
import { getOrCreateChat, stopSession, useChatStore } from "../store/chatStore";
import { useSnippetsStore } from "../store/snippetsStore";
import { currentWorkspaceEnv } from "@/modules/workspace/env";
import { toast } from "sonner";
import {
  binaryAttachmentIssue,
  MAX_TEXT_INLINE,
  mergeAttachments,
  readAttachment,
  type FileAttachment,
} from "@/modules/ai/lib/attachments";
import { getModel } from "@/modules/ai/config";

export { ACCEPTED_FILES, type FileAttachment } from "@/modules/ai/lib/attachments";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string; filename?: string };

type Voice = ReturnType<typeof useWhisperRecording>;

type ComposerCtx = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  files: FileAttachment[];
  addFiles: (list: FileList | File[] | null) => Promise<void>;
  /** Attach a file by absolute path — used by the file explorer's "Attach to Agent". */
  attachFileByPath: (path: string) => Promise<void>;
  removeFile: (id: string) => void;
  pickedSnippets: Snippet[];
  addSnippet: (s: Snippet) => void;
  removeSnippet: (id: string) => void;
  pickedCommands: SlashCommandMeta[];
  addCommand: (c: SlashCommandMeta) => void;
  removeCommand: (name: string) => void;
  isBusy: boolean;
  submit: () => void;
  stop: () => void;
  voice: Voice;
  canSend: boolean;
};

const Ctx = createContext<ComposerCtx | null>(null);

export function useComposer(): ComposerCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useComposer must be used inside <AiComposerProvider>");
  return ctx;
}

type ProviderProps = {
  children: React.ReactNode;
};

export function AiComposerProvider({ children }: ProviderProps) {
  const sessionId = useChatStore((s) => s.activeSessionId);
  const status = useChatStore((s) => s.agentMeta.status);
  const isBusy = status === "thinking" || status === "streaming";

  const [value, setValue] = useState("");
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const filesRef = useRef<FileAttachment[]>([]);
  const updateFiles = useCallback((action: React.SetStateAction<FileAttachment[]>) => {
    setFiles((previous) => {
      const next = typeof action === "function" ? action(previous) : action;
      filesRef.current = next;
      return next;
    });
  }, []);
  const [pickedSnippets, setPickedSnippets] = useState<Snippet[]>([]);
  const [pickedCommands, setPickedCommands] = useState<SlashCommandMeta[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const focusSignal = useChatStore((s) => s.focusSignal);
  const pendingPrefill = useChatStore((s) => s.pendingPrefill);
  const consumePrefill = useChatStore((s) => s.consumePrefill);
  const pendingSelections = useChatStore((s) => s.pendingSelections);
  const consumeSelections = useChatStore((s) => s.consumeSelections);

  useEffect(() => {
    if (focusSignal === 0) return;
    textareaRef.current?.focus();
    if (pendingPrefill != null) {
      const text = consumePrefill();
      if (text) setValue((v) => (v ? `${text}${v}` : text));
    }
  }, [focusSignal, pendingPrefill, consumePrefill]);

  // Re-focus the textarea whenever the agent finishes a response
  const prevIsBusyRef = useRef(false);
  useEffect(() => {
    if (prevIsBusyRef.current && !isBusy) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevIsBusyRef.current = isBusy;
  }, [isBusy, textareaRef]);

  // Listen for explorer's "Attach to Agent" event.
  useEffect(() => {
    const onAttach = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string" && path.length > 0) {
        void attachFileByPath(path);
      }
    };
    window.addEventListener("atlas:ai-attach-file", onAttach);
    return () => window.removeEventListener("atlas:ai-attach-file", onAttach);
    // attachFileByPath is stable for our purposes (closes over setFiles only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingSelections.length === 0) return;
    const drained = consumeSelections();
    if (drained.length === 0) return;
    updateFiles((prev) => {
      const next: FileAttachment[] = [];
      for (const sel of drained) {
        const size = new Blob([sel.text]).size;
        if (size > MAX_TEXT_INLINE) {
          toast.error("Selection was not attached", {
            description: "Selections cannot exceed 200 KB",
          });
          continue;
        }
        next.push({
          id: sel.id,
          name:
            sel.source === "editor"
              ? "Editor selection"
              : "Terminal selection",
          kind: "selection",
          mediaType: "text/plain",
          text: sel.text,
          size,
          source: sel.source,
        });
      }
      const merged = mergeAttachments(prev, next);
      if (merged.overflowCount > 0 || merged.totalBytesExceededCount > 0) {
        toast.error("Selection was not attached", {
          description: "Attachment count or total size limit reached",
        });
      }
      return merged.files;
    });
  }, [pendingSelections, consumeSelections, updateFiles]);

  const voice = useWhisperRecording({
    onResult: (transcript: string) => {
      setValue((v) => (v ? `${v} ${transcript}` : transcript));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  });

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const next: FileAttachment[] = [];
    const errors: string[] = [];
    for (const f of Array.from(list)) {
      try {
        const result = await readAttachment(f);
        if (result.attachment) next.push(result.attachment);
        if (result.error) errors.push(result.error);
      } catch {
        errors.push(`${f.name} could not be read`);
      }
    }
    if (next.length) {
      const merged = mergeAttachments(filesRef.current, next);
      updateFiles(merged.files);
      if (merged.overflowCount > 0) errors.push(`Only 8 attachments can be sent at once`);
      if (merged.totalBytesExceededCount > 0) errors.push(`Attachments cannot exceed 5 MB in total`);
      if (merged.duplicateCount > 0 && merged.duplicateCount === next.length) {
        toast.info("Those files are already attached");
      }
      if (errors.length > 0) {
        toast.error("Some files were not attached", { description: errors.slice(0, 3).join(". ") });
      }
    } else if (errors.length > 0) {
      toast.error("Files were not attached", { description: errors.slice(0, 3).join(". ") });
    }
  };

  const removeFile = (id: string) =>
    updateFiles((prev) => prev.filter((f) => f.id !== id));

  const addSnippet = (s: Snippet) =>
    setPickedSnippets((prev) =>
      prev.some((p) => p.id === s.id) ? prev : [...prev, s],
    );
  const removeSnippet = (id: string) =>
    setPickedSnippets((prev) => prev.filter((s) => s.id !== id));

  const addCommand = (cmd: SlashCommandMeta) =>
    setPickedCommands((prev) =>
      prev.some((p) => p.name === cmd.name) ? prev : [...prev, cmd],
    );
  const removeCommand = (name: string) =>
    setPickedCommands((prev) => prev.filter((c) => c.name !== name));

  const attachFileByPath = async (path: string) => {
    try {
      type ReadResult =
        | { kind: "text"; content: string; size: number }
        | { kind: "binary"; size: number }
        | { kind: "toolarge"; size: number; limit: number };
      const result = await invoke<ReadResult>("fs_read_file", {
        path,
        workspace: currentWorkspaceEnv(),
      });
      if (result.kind !== "text") {
        toast.error("File was not attached", {
          description: result.kind === "toolarge" ? "File is too large" : "Binary files are not supported here",
        });
        return;
      }
      if (result.size > MAX_TEXT_INLINE) {
        toast.error("File was not attached", {
          description: "Text files cannot exceed 200 KB",
        });
        return;
      }
      const name = path.split("/").pop() || path;
      const id = `path-${path}`;
      updateFiles((prev) => {
        const att: FileAttachment = {
          id,
          name,
          kind: "text",
          mediaType: "text/plain",
          text: result.content,
          size: result.size,
        };
        const merged = mergeAttachments(prev, [att]);
        if (merged.duplicateCount > 0) toast.info("That file is already attached");
        if (merged.overflowCount > 0 || merged.totalBytesExceededCount > 0) {
          toast.error("File was not attached", {
            description: "Attachment count or total size limit reached",
          });
        }
        return merged.files;
      });
      // Open the AI panel & focus the input so the user sees the chip.
      useChatStore.getState().focusInput();
    } catch (e) {
      console.error("attachFileByPath failed:", e);
    }
  };

  const submit = () => {
    if (isBusy) return;
    const trimmed = value.trim();
    if (
      !trimmed &&
      files.length === 0 &&
      pickedSnippets.length === 0 &&
      pickedCommands.length === 0
    )
      return;

    // Slash-command interception. `/plan` toggles plan mode; `/init` rewrites
    // the prompt to the ATLAS.md scan template before sending.
    let effectiveText = trimmed;
    let commandMarker: string | null = null;
    let commandSource = trimmed;
    if (pickedCommands.length > 0 && !trimmed.startsWith("/") && !trimmed.startsWith("#")) {
      commandSource = `#${pickedCommands[0].name} ${trimmed}`.trim();
    }
    if (commandSource.startsWith("/") || commandSource.startsWith("#")) {
      const outcome = tryRunSlashCommand(commandSource, sessionId);
      if (outcome.kind === "handled") {
        setValue("");
        if (outcome.toast) console.info(outcome.toast);
        return;
      }
      if (outcome.kind === "send-prompt") {
        effectiveText = outcome.prompt;
        if (outcome.commandName) {
          commandMarker = `<atlas-command name="${outcome.commandName}" />`;
        }
      }
    }

    const selectedModel = getModel(useChatStore.getState().selectedModelId);
    const attachmentIssue = binaryAttachmentIssue(selectedModel, files);
    if (attachmentIssue) {
      toast.error("Attachment not supported", {
        description: attachmentIssue,
      });
      return;
    }
    const parts: MessagePart[] = [];
    const fileBlocks = files
      .filter((f) => f.kind === "text")
      .map(
        (f) =>
          `<file name="${f.name}" mediaType="${f.mediaType}">\n${f.text ?? ""}\n</file>`,
      );
    const selectionBlocks = files
      .filter((f) => f.kind === "selection")
      .map(
        (f) =>
          `<selection source="${f.source ?? "terminal"}">\n${f.text ?? ""}\n</selection>`,
      );
    const { body: bodyAfterTokens, blocks: snippetBlocks } = expandSnippetTokens(
      effectiveText,
      useSnippetsStore.getState().snippets,
    );
    const seenHandles = new Set<string>();
    const allSnippetBlocks: string[] = [];
    for (const s of pickedSnippets) {
      if (seenHandles.has(s.handle)) continue;
      seenHandles.add(s.handle);
      allSnippetBlocks.push(
        `<snippet name="${s.handle}">\n${s.content}\n</snippet>`,
      );
    }
    for (const block of snippetBlocks) {
      const m = block.match(/^<snippet name="([^"]+)"/);
      if (m && seenHandles.has(m[1])) continue;
      if (m) seenHandles.add(m[1]);
      allSnippetBlocks.push(block);
    }
    const composed = [
      commandMarker ?? "",
      allSnippetBlocks.join("\n\n"),
      selectionBlocks.join("\n\n"),
      fileBlocks.join("\n\n"),
      bodyAfterTokens,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (composed) parts.push({ type: "text", text: composed });

    for (const f of files) {
      if ((f.kind === "image" || f.kind === "document") && f.url) {
        parts.push({
          type: "file",
          mediaType: f.mediaType,
          url: f.url,
          filename: f.name,
        });
      }
    }

    if (!sessionId) return;
    const chat = getOrCreateChat(sessionId);
    void chat.sendMessage({ role: "user", parts } as Parameters<
      typeof chat.sendMessage
    >[0]);
    const store = useChatStore.getState();
    store.patchAgentMeta(sessionId, { hitStepCap: false, compactionNotice: null });
    if (!store.mini.open) store.openMini();
    setValue("");
    updateFiles([]);
    setPickedSnippets([]);
    setPickedCommands([]);
    // Re-focus immediately after submit so the user can type a follow-up
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const stop = () => {
    if (!sessionId) return;
    stopSession(sessionId);
  };

  const canSend =
    !isBusy &&
    (value.trim().length > 0 ||
      files.length > 0 ||
      pickedSnippets.length > 0 ||
      pickedCommands.length > 0);

  const ctx: ComposerCtx = {
    textareaRef,
    value,
    setValue,
    files,
    addFiles,
    attachFileByPath,
    removeFile,
    pickedSnippets,
    addSnippet,
    removeSnippet,
    pickedCommands,
    addCommand,
    removeCommand,
    isBusy,
    submit,
    stop,
    voice,
    canSend,
  };

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}
