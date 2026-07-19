import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { runWorktreeAgent } from "../agents/runWorktreeAgent";
import { scheduleSubagent } from "../agents/subagentScheduler";
import { useSubagentActivityStore } from "../agents/subagentActivityStore";
import { native } from "../lib/native";
import { useChatStore } from "../store/chatStore";
import {
  checkFileAccessAllowed,
  checkMutationAllowed,
  type ToolContext,
} from "./context";

function workspaceRoot(
  ctx: ToolContext,
  mutate: boolean,
): string | { error: string } {
  const project = ctx.getProjectContext();
  const denied = mutate
    ? checkMutationAllowed(project)
    : checkFileAccessAllowed(project);
  if (denied) return denied;
  return project.workspaceRoot!;
}

function normalizedPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(normalized)
    ? normalized.toLowerCase()
    : normalized;
}

async function managedWorktree(
  repoRoot: string,
  path: string,
): Promise<string | { error: string }> {
  const worktrees = await native.gitWorktreeList(repoRoot);
  const requested = normalizedPath(path);
  const match = worktrees.find(
    (worktree) =>
      !worktree.isMain && normalizedPath(worktree.path) === requested,
  );
  return match?.path ?? { error: "worktree is not an Atlas-managed linked checkout" };
}

export function buildWorktreeTools(ctx: ToolContext) {
  return {
    worktree_list: tool({
      description:
        "List the main checkout and Atlas-managed Git worktrees for the bound repository. Auto-executes because it is read-only.",
      inputSchema: z.object({}),
      execute: async () => {
        const root = workspaceRoot(ctx, false);
        if (typeof root !== "string") return root;
        try {
          return { worktrees: await native.gitWorktreeList(root) };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
    worktree_create: tool({
      description:
        "Create an isolated Atlas-managed Git worktree and atlas/<name> branch. Requires approval. The name must be a small path-free slug.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
        base_ref: z.string().min(1).max(256).optional(),
      }),
      needsApproval: true,
      execute: async ({ name, base_ref }) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        try {
          return await native.gitWorktreeCreate(root, name, base_ref);
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),
    worktree_remove: tool({
      description:
        "Remove an Atlas-managed Git worktree. Requires approval and refuses paths outside .atlas/worktrees.",
      inputSchema: z.object({ path: z.string().min(1).max(2048) }),
      needsApproval: true,
      execute: async ({ path }) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        try {
          await native.gitWorktreeRemove(root, path);
          return { removed: true, path };
        } catch (error) {
          return { error: String(error), path };
        }
      },
    }),
    worktree_inspect: tool({
      description:
        "Inspect one Atlas-managed worktree before commit or merge. Returns Git status plus bounded staged and unstaged patches. Auto-executes because it is read-only.",
      inputSchema: z.object({ path: z.string().min(1).max(2048) }),
      execute: async ({ path }) => {
        const root = workspaceRoot(ctx, false);
        if (typeof root !== "string") return root;
        try {
          const worktree = await managedWorktree(root, path);
          if (typeof worktree !== "string") return worktree;
          const [status, unstaged, staged] = await Promise.all([
            native.gitStatus(worktree),
            native.gitDiff(worktree, null, false),
            native.gitDiff(worktree, null, true),
          ]);
          return { path: worktree, status, unstaged, staged };
        } catch (error) {
          return { error: String(error), path };
        }
      },
    }),
    worktree_run: tool({
      description:
        "Run an isolated coding worker whose file tools are rebound to one Atlas-managed worktree. Requires approval. The worker can read and edit but cannot execute shell commands; inspect and verify its returned patch before staging or merging.",
      inputSchema: z.object({
        path: z.string().min(1).max(2048),
        prompt: z.string().min(1).max(20_000),
      }),
      needsApproval: true,
      execute: async ({ path, prompt }, options: ToolExecutionOptions) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        const sessionId = ctx.getSessionId?.() ?? "unknown";
        const runId = `${options.toolCallId}:worktree`;
        useSubagentActivityStore.getState().begin({
          id: runId,
          parentCallId: options.toolCallId,
          sessionId,
          kind: "worktree",
          description: `Worker · ${path.replace(/\\/g, "/").split("/").pop() ?? path}`,
        });
        try {
          const worktree = await managedWorktree(root, path);
          if (typeof worktree !== "string") {
            useSubagentActivityStore.getState().finish(runId, worktree);
            return { ...worktree, runId };
          }
          await native.workspaceAuthorizeAgentProject(worktree);
          const { apiKeys, selectedModelId, patchAgentMeta } =
            useChatStore.getState();
          const result = await scheduleSubagent({
            sessionId,
            signal: options.abortSignal,
            onStart: () =>
              useSubagentActivityStore.getState().markRunning(runId),
            run: () => runWorktreeAgent({
              prompt,
              worktreePath: worktree,
              keys: apiKeys,
              modelId: selectedModelId,
              parentContext: ctx,
              abortSignal: options.abortSignal,
              onStep: (step) => {
                useSubagentActivityStore.getState().setStep(runId, step);
                if (sessionId !== "unknown") patchAgentMeta(sessionId, { step });
              },
            }),
          });
          useSubagentActivityStore.getState().finish(runId, {
            summary: result.summary,
          });
          const [status, unstaged, staged] = await Promise.all([
            native.gitStatus(worktree),
            native.gitDiff(worktree, null, false),
            native.gitDiff(worktree, null, true),
          ]);
          return {
            ...result,
            runId,
            path: worktree,
            status,
            unstaged,
            staged,
            verificationRequired: true,
          };
        } catch (error) {
          const cancelled = options.abortSignal?.aborted === true;
          useSubagentActivityStore.getState().finish(runId, {
            cancelled,
            error: cancelled ? undefined : String(error),
          });
          return {
            runId,
            error: cancelled
              ? "worktree worker cancelled"
              : String(error),
            path,
          };
        }
      },
    }),
    worktree_stage: tool({
      description:
        "Stage selected repository-relative paths inside an Atlas-managed worktree. Requires approval.",
      inputSchema: z.object({
        path: z.string().min(1).max(2048),
        files: z.array(z.string().min(1).max(2048)).min(1).max(100),
      }),
      needsApproval: true,
      execute: async ({ path, files }) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        try {
          const worktree = await managedWorktree(root, path);
          if (typeof worktree !== "string") return worktree;
          await native.gitStage(worktree, files);
          return { staged: files, path: worktree };
        } catch (error) {
          return { error: String(error), path };
        }
      },
    }),
    worktree_unstage: tool({
      description:
        "Unstage selected repository-relative paths inside an Atlas-managed worktree without discarding their contents. Requires approval.",
      inputSchema: z.object({
        path: z.string().min(1).max(2048),
        files: z.array(z.string().min(1).max(2048)).min(1).max(100),
      }),
      needsApproval: true,
      execute: async ({ path, files }) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        try {
          const worktree = await managedWorktree(root, path);
          if (typeof worktree !== "string") return worktree;
          await native.gitUnstage(worktree, files);
          return { unstaged: files, path: worktree };
        } catch (error) {
          return { error: String(error), path };
        }
      },
    }),
    worktree_commit: tool({
      description:
        "Commit staged changes inside an Atlas-managed worktree after inspection. Requires approval. Use worktree_stage explicitly first; this never stages files automatically.",
      inputSchema: z.object({
        path: z.string().min(1).max(2048),
        message: z.string().min(1).max(500),
      }),
      needsApproval: true,
      execute: async ({ path, message }) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        try {
          const worktree = await managedWorktree(root, path);
          if (typeof worktree !== "string") return worktree;
          return await native.gitCommit(worktree, message);
        } catch (error) {
          return { error: String(error), path };
        }
      },
    }),
    worktree_merge: tool({
      description:
        "Merge an atlas/<name> worktree branch into the current checkout. Requires approval and reports Git conflicts without hiding them.",
      inputSchema: z.object({ branch: z.string().min(1).max(256) }),
      needsApproval: true,
      execute: async ({ branch }) => {
        const root = workspaceRoot(ctx, true);
        if (typeof root !== "string") return root;
        try {
          return await native.gitWorktreeMerge(root, branch);
        } catch (error) {
          return { error: String(error), branch };
        }
      },
    }),
  } as const;
}
