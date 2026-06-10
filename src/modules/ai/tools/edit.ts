import { tool } from "ai";
import { z } from "zod";
import { agentNative } from "../lib/native";
import { checkWritableCanonical } from "../lib/security";
import { newQueuedEditId, usePlanStore } from "../store/planStore";
import {
  checkMutationAllowed,
  resolvePath,
  validateWithinWorkspace,
  type ToolContext,
} from "./context";
import { editNeedsApproval } from "../lib/permissions";
import {
  fingerprintText,
  fingerprintsMatch,
  STALE_READ_ERROR,
  type ReadFingerprint,
} from "./fingerprint";
import { withFileMutationQueue } from "./fileMutationQueue";
import { observePostEdit } from "./postEdit";
import type { PostEditDiagnostics } from "./postEditDiagnostics";
import type { MemoryInvalidation } from "../memory";

type EditResult =
  | {
      ok: true;
      replacements: number;
      bytesWritten: number;
      path: string;
      post_edit_diagnostics?: PostEditDiagnostics;
      memory_invalidation?: MemoryInvalidation;
    }
  | {
      error: string;
      path: string;
      code?: "stale_read" | "old_string_not_found";
      recovery?: string;
      closest_match?: string;
    };

function oldStringNotFound(
  path: string,
  oldString: string,
  content: string,
): EditResult {
  const closest = closestSnippet(content, oldString);
  return {
    error: `old_string not found: ${JSON.stringify(oldString.slice(0, 80))}`,
    code: "old_string_not_found",
    path,
    ...(closest ? { closest_match: closest } : {}),
    recovery: closest
      ? "old_string does not exist in this file. closest_match holds the nearest actual text — re-issue the edit copying that text exactly. Do not retry the same old_string."
      : "Do not retry the same old_string. Call read_file again, copy the exact current text including whitespace and line endings, then issue one corrected edit or multi_edit.",
  };
}

/**
 * Best-effort pointer to the file text the model probably meant. Weak models
 * tend to retry an identical wrong old_string instead of re-reading the file;
 * surfacing the closest real lines in the error lets them correct in one step.
 */
export function closestSnippet(
  content: string,
  oldString: string,
): string | null {
  const targetLine = oldString
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!targetLine) return null;
  const targetTokens = tokenize(targetLine);
  if (targetTokens.size === 0) return null;

  const lines = content.split("\n");
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const tokens = tokenize(lines[i]);
    if (tokens.size === 0) continue;
    let shared = 0;
    for (const t of targetTokens) if (tokens.has(t)) shared++;
    const score = shared / Math.max(targetTokens.size, tokens.size);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx === -1 || bestScore < 0.4) return null;
  const span = Math.min(oldString.split("\n").length + 1, 6);
  return lines.slice(bestIdx, bestIdx + span).join("\n").slice(0, 400);
}

function tokenize(line: string): Set<string> {
  return new Set(line.toLowerCase().split(/\W+/).filter(Boolean));
}

export async function applyEdits(
  abs: string,
  projectRoot: string,
  edits: { old_string: string; new_string: string; replace_all?: boolean }[],
  kind: "edit" | "multi_edit",
  readCache: Map<string, ReadFingerprint>,
): Promise<EditResult> {
  const canonicalize = (p: string) => agentNative.canonicalize(p, projectRoot);
  return withFileMutationQueue(abs, () =>
    applyEditsUnlocked(abs, projectRoot, edits, kind, readCache),
    canonicalize,
  );
}

async function applyEditsUnlocked(
  abs: string,
  projectRoot: string,
  edits: { old_string: string; new_string: string; replace_all?: boolean }[],
  kind: "edit" | "multi_edit",
  readCache: Map<string, ReadFingerprint>,
): Promise<EditResult> {
  const r = await agentNative.readFile(abs, projectRoot);
  if (r.kind === "binary")
    return { error: "binary file refused", path: abs };
  if (r.kind === "toolarge")
    return { error: `file too large (${r.size} bytes)`, path: abs };

  const original = r.content;
  const prior = readCache.get(abs);
  if (!prior) {
    return {
      error: "must call read_file on this path first (read-before-edit invariant).",
      path: abs,
    };
  }
  const currentFingerprint = fingerprintText(original);
  if (!fingerprintsMatch(prior, currentFingerprint)) {
    return { error: STALE_READ_ERROR, code: "stale_read", path: abs };
  }
  let content = original;
  let totalReplacements = 0;

  for (const e of edits) {
    if (e.old_string === e.new_string) {
      return {
        error: "old_string and new_string are identical",
        path: abs,
      };
    }
    if (e.old_string.length === 0) {
      return { error: "old_string cannot be empty", path: abs };
    }
    if (e.replace_all) {
      const before = content;
      content = content.split(e.old_string).join(e.new_string);
      const occurrences =
        (before.length - content.length) /
          (e.old_string.length - e.new_string.length || 1) || 0;
      // Recover count via direct search to avoid divide-by-zero edge cases.
      let n = 0;
      let i = 0;
      while ((i = before.indexOf(e.old_string, i)) !== -1) {
        n++;
        i += e.old_string.length;
      }
      if (n === 0) {
        return oldStringNotFound(abs, e.old_string, before);
      }
      totalReplacements += n;
      void occurrences;
    } else {
      const first = content.indexOf(e.old_string);
      if (first === -1) {
        return oldStringNotFound(abs, e.old_string, content);
      }
      const second = content.indexOf(e.old_string, first + 1);
      if (second !== -1) {
        return {
          error:
            "old_string is not unique. Provide more surrounding context, or set replace_all=true.",
          path: abs,
        };
      }
      content =
        content.slice(0, first) +
        e.new_string +
        content.slice(first + e.old_string.length);
      totalReplacements += 1;
    }
  }

  if (usePlanStore.getState().active) {
    usePlanStore.getState().enqueue({
      id: newQueuedEditId(),
      kind,
      path: abs,
      projectRoot,
      originalContent: original,
      proposedContent: content,
      isNewFile: false,
      expectedFingerprint: currentFingerprint,
    });
    return {
      ok: true,
      replacements: totalReplacements,
      bytesWritten: content.length,
      path: abs,
    };
  }

  try {
    await agentNative.writeFile(abs, content, projectRoot);
    readCache.set(abs, fingerprintText(content));
    return {
      ok: true,
      replacements: totalReplacements,
      bytesWritten: content.length,
      path: abs,
      ...(await observePostEdit(projectRoot, abs)),
    };
  } catch (err) {
    return { error: String(err), path: abs };
  }
}

export function buildEditTools(ctx: ToolContext) {
  return {
    edit: tool({
      description:
        "Replace an exact string in a file. Requires read_file on this path first in the current session — this prevents blind edits. `old_string` must be unique in the file unless `replace_all: true`. Asks for user approval before writing.",
      inputSchema: z.object({
        path: z.string(),
        old_string: z
          .string()
          .describe("Exact substring to replace. Must be unique unless replace_all."),
        new_string: z.string().describe("Replacement substring."),
        replace_all: z.boolean().optional(),
      }),
      needsApproval: () => editNeedsApproval(ctx.getApprovalMode()),
      execute: async ({ path, old_string, new_string, replace_all }) => {
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
        if (!ctx.readCache.has(abs)) {
          return {
            error:
              "must call read_file on this path first (read-before-edit invariant).",
            path: abs,
          };
        }
        return applyEdits(
          abs,
          projectRoot,
          [{ old_string, new_string, replace_all }],
          "edit",
          ctx.readCache,
        );
      },
    }),

    multi_edit: tool({
      description:
        "Apply several exact-string replacements to a single file atomically. Each edit is applied in order to the running buffer; if any edit's old_string is missing or non-unique, the whole batch aborts before writing. Requires prior read_file on the path. Asks for user approval before writing.",
      inputSchema: z.object({
        path: z.string(),
        edits: z
          .array(
            z.object({
              old_string: z.string(),
              new_string: z.string(),
              replace_all: z.boolean().optional(),
            }),
          )
          .min(1),
      }),
      needsApproval: () => editNeedsApproval(ctx.getApprovalMode()),
      execute: async ({ path, edits }) => {
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
        if (!ctx.readCache.has(abs)) {
          return {
            error:
              "must call read_file on this path first (read-before-edit invariant).",
            path: abs,
          };
        }
        return applyEdits(abs, projectRoot, edits, "multi_edit", ctx.readCache);
      },
    }),
  } as const;
}
