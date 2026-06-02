import { tool } from "ai";
import { z } from "zod";
import { agentNative } from "../lib/native";
import {
  checkReadableCanonical,
  checkWritableCanonical,
} from "../lib/security";
import { newQueuedEditId, usePlanStore } from "../store/planStore";
import {
  checkMutationAllowed,
  checkFileAccessAllowed,
  resolvePath,
  validateWithinWorkspace,
  type ToolContext,
} from "./context";
import { editNeedsApproval } from "../lib/permissions";
import { withFileMutationQueue } from "./fileMutationQueue";
import { refreshPostEditDiagnostics } from "./postEditDiagnostics";
import { fingerprintText, type ReadFingerprint } from "./fingerprint";

const READ_BYTE_CAP = 25 * 1024;
const READ_LINE_CAP = 2000;

export function buildFsTools(ctx: ToolContext) {
  return {
    read_file: tool({
      description:
        "Read a UTF-8 text file. Defaults to the first 2000 lines (capped at 25KB). Pass `offset`/`limit` for line-based windowing of large files. Refuses binary, oversized, or sensitive files (.env, keys, credentials). If you call this on the same path twice in a session without edits in between, the second call returns `unchanged: true` instead of re-emitting the content — re-read the prior tool result.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Absolute path, or relative to the Atlas path policy."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("0-based start line. Default 0."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10000)
          .optional()
          .describe("Max lines to return. Default 2000."),
      }),
      execute: async ({ path, offset, limit }) => {
        const project = ctx.getProjectContext();
        const blocked = checkFileAccessAllowed(project);
        if (blocked) return { ...blocked, path };
        const projectRoot = project.workspaceRoot as string;
        const canonicalize = (p: string) => agentNative.canonicalize(p, projectRoot);
        const reqPath = resolvePath(path, project);
        const safety = await checkReadableCanonical(reqPath, canonicalize);
        if (!safety.ok) return { error: safety.reason, path: reqPath };
        const abs = safety.canonical;
        const boundary = await validateWithinWorkspace(abs, project, canonicalize);
        if (!boundary.ok) return { error: boundary.reason, path: abs };
        try {
          const r = await agentNative.readFile(abs, projectRoot);
          if (r.kind === "binary")
            return { error: "binary file refused", path: abs, size: r.size };
          if (r.kind === "toolarge")
            return {
              error: `file too large (${r.size} bytes, limit ${r.limit})`,
              path: abs,
            };

          const fingerprint = fingerprintText(r.content);
          const isFullRead = offset === undefined && limit === undefined;
          const prior = ctx.readCache.get(abs);
          if (
            isFullRead &&
            prior &&
            prior.size === fingerprint.size &&
            prior.hash === fingerprint.hash
          ) {
            return { path: abs, unchanged: true, size: r.size };
          }
          ctx.readCache.set(abs, fingerprint);

          if (isFullRead) {
            const lines = r.content.split("\n");
            const sliceEnd = Math.min(lines.length, READ_LINE_CAP);
            let content = lines.slice(0, sliceEnd).join("\n");
            let truncated = sliceEnd < lines.length;
            if (content.length > READ_BYTE_CAP) {
              content = content.slice(0, READ_BYTE_CAP);
              truncated = true;
            }
            return {
              path: abs,
              content,
              size: r.size,
              total_lines: lines.length,
              ...(truncated
                ? { truncated: true, hint: "call read_file with offset to continue" }
                : {}),
            };
          }

          const lines = r.content.split("\n");
          const start = offset ?? 0;
          const requested = limit ?? READ_LINE_CAP;
          const end = Math.min(lines.length, start + requested);
          let content = lines.slice(start, end).join("\n");
          let truncated = end < lines.length;
          if (content.length > READ_BYTE_CAP) {
            content = content.slice(0, READ_BYTE_CAP);
            truncated = true;
          }
          return {
            path: abs,
            content,
            size: r.size,
            total_lines: lines.length,
            start_line: start,
            end_line: end,
            ...(truncated ? { truncated: true } : {}),
          };
        } catch (e) {
          return { error: String(e), path: abs };
        }
      },
    }),

    list_directory: tool({
      description:
        "List immediate entries (files + directories) in a directory. Hidden entries are omitted.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Absolute path, or relative to the Atlas path policy."),
      }),
      execute: async ({ path }) => {
        const project = ctx.getProjectContext();
        const blocked = checkFileAccessAllowed(project);
        if (blocked) return { ...blocked, path };
        const projectRoot = project.workspaceRoot as string;
        const canonicalize = (p: string) => agentNative.canonicalize(p, projectRoot);
        const reqPath = resolvePath(path, project);
        const safety = await checkReadableCanonical(reqPath, canonicalize);
        if (!safety.ok) return { error: safety.reason, path: reqPath };
        const abs = safety.canonical;
        const boundary = await validateWithinWorkspace(abs, project, canonicalize);
        if (!boundary.ok) return { error: boundary.reason, path: abs };
        try {
          const entries = await agentNative.readDir(abs, projectRoot);
          return {
            path: abs,
            entries: entries.map((e) => ({ name: e.name, kind: e.kind })),
          };
        } catch (e) {
          return { error: String(e), path: abs };
        }
      },
    }),

    write_file: tool({
      description:
        "Create or overwrite a file with the given content. Always asks the user before running. Prefer `edit` / `multi_edit` for in-place changes — only use `write_file` for creating a brand-new file or fully replacing a tiny one.",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
      }),
      needsApproval: () => editNeedsApproval(ctx.getApprovalMode()),
      execute: async ({ path, content }) => {
        const project = ctx.getProjectContext();
        const blocked = checkMutationAllowed(project);
        if (blocked) return { ...blocked, path };
        const projectRoot = project.workspaceRoot as string;
        const canonicalize = (p: string) => agentNative.canonicalize(p, projectRoot);
        const reqPath = resolvePath(path, project);
        const safety = await checkWritableCanonical(reqPath, canonicalize);
        if (!safety.ok) return { error: safety.reason, path: reqPath };
        const abs = safety.canonical;
        const boundary = await validateWithinWorkspace(abs, project, canonicalize);
        if (!boundary.ok) return { error: boundary.reason, path: abs };

        if (usePlanStore.getState().active) {
          let original = "";
          let isNewFile = false;
          let expectedFingerprint: ReadFingerprint | undefined;
          try {
            const r = await agentNative.readFile(abs, projectRoot);
            if (r.kind === "text") {
              original = r.content;
              expectedFingerprint = fingerprintText(original);
            }
          } catch {
            isNewFile = true;
          }
          usePlanStore.getState().enqueue({
            id: newQueuedEditId(),
            kind: "write_file",
            path: abs,
            projectRoot,
            originalContent: original,
            proposedContent: content,
            isNewFile,
            expectedFingerprint,
          });
          return {
            path: abs,
            queued_for_plan_review: true,
            ok: true,
          };
        }

        try {
          await withFileMutationQueue(
            abs,
            () => agentNative.writeFile(abs, content, projectRoot),
            canonicalize,
          );
          ctx.readCache.set(abs, fingerprintText(content));
          return {
            path: abs,
            bytesWritten: content.length,
            ok: true,
            post_edit_diagnostics: await refreshPostEditDiagnostics(
              projectRoot,
              abs,
            ),
          };
        } catch (e) {
          return { error: String(e), path: abs };
        }
      },
    }),

    create_directory: tool({
      description:
        "Create a directory (and any missing parents). Always asks the user before running.",
      inputSchema: z.object({
        path: z.string(),
      }),
      needsApproval: () => editNeedsApproval(ctx.getApprovalMode()),
      execute: async ({ path }) => {
        const project = ctx.getProjectContext();
        const blocked = checkMutationAllowed(project);
        if (blocked) return { ...blocked, path };
        const projectRoot = project.workspaceRoot as string;
        const canonicalize = (p: string) => agentNative.canonicalize(p, projectRoot);
        const reqPath = resolvePath(path, project);
        const safety = await checkWritableCanonical(reqPath, canonicalize);
        if (!safety.ok) return { error: safety.reason, path: reqPath };
        const abs = safety.canonical;
        const boundary = await validateWithinWorkspace(abs, project, canonicalize);
        if (!boundary.ok) return { error: boundary.reason, path: abs };
        if (usePlanStore.getState().active) {
          usePlanStore.getState().enqueue({
            id: newQueuedEditId(),
            kind: "create_directory",
            path: abs,
            projectRoot,
            originalContent: "",
            proposedContent: "",
            isNewFile: true,
            description: "Create directory",
          });
          return { path: abs, queued_for_plan_review: true, ok: true };
        }
        try {
          await agentNative.createDir(abs, projectRoot);
          return { path: abs, ok: true };
        } catch (e) {
          return { error: String(e), path: abs };
        }
      },
    }),
  } as const;
}
