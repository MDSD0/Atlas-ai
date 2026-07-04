import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { native } from "../lib/native";
import { checkShellCommand } from "../lib/security";
import { shellNeedsApproval } from "../lib/permissions";
import { redactSensitive } from "../lib/redact";
import { registerRunBackgroundHandle } from "../lib/runResources";
import { commandFailureRecovery, interactiveEofHint, verificationRecovery } from "../lib/verificationLoop";
import { resolvePath, type ToolContext } from "./context";
import { currentWorkspaceEnv, workspaceScopeKey } from "@/modules/workspace/env";

/**
 * Per-session lazy shell-session id. The agent gets one persistent shell per
 * chat session, so cwd survives across tool calls (cd, mkdir+cd, etc).
 */
const sessionShells = new Map<string, Promise<number>>();

async function getSessionShell(
  sessionId: string,
  cwd: string | null,
): Promise<number> {
  let p = sessionShells.get(sessionId);
  if (!p) {
    p = native.shellSessionOpen(cwd);
    sessionShells.set(sessionId, p);
  }
  return p;
}

function workspaceSessionKey(sessionId: string): string {
  return `${sessionId}:${workspaceScopeKey(currentWorkspaceEnv())}`;
}

function shellSessionKey(sessionId: string, cwd: string | null): string {
  return `${workspaceSessionKey(sessionId)}:${cwd ?? "none"}`;
}

const LONG_RUNNING_FOREGROUND_PATTERNS: RegExp[] = [
  /\b(?:python|python3|py)\s+-m\s+http\.server\b/i,
  /\b(?:pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b/i,
  /\bnpm\s+(?:run\s+)?(?:dev|start|serve|preview)\b/i,
  /\b(?:vite|next|astro|remix)\s+dev\b/i,
  /\bwebpack\s+serve\b/i,
  /\bcargo\s+watch\b/i,
  /\bnodemon\b/i,
  /\bnode\s+--watch\b/i,
  /\btail\s+-f\b/i,
  /\b(?:http-server|live-server)\b/i,
  /(?:^|[;&|]\s*)serve(?:\s|$)/i,
];

const SENSITIVE_ENV_DUMP_PATTERNS: RegExp[] = [
  /(?:^|[;&|]\s*)(?:env|printenv|set)(?:\s|$)/i,
  /(?:^|[;&|]\s*)(?:export)(?:\s+-p)?(?:\s*$|[;&|])/i,
  /\b(?:Get-ChildItem|gci|dir|ls)\s+env:/i,
];

type BackgroundProcess = Awaited<ReturnType<typeof native.shellBgList>>[number];

export function foregroundCommandBlockReason(command: string): string | null {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (LONG_RUNNING_FOREGROUND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "This looks like a long-running server or watcher. Use bash_background, then bash_logs and bash_kill, instead of bash_run.";
  }
  return null;
}

export function sensitiveShellOutputBlockReason(command: string): string | null {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (SENSITIVE_ENV_DUMP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "This command can dump environment secrets. Ask for a specific variable name or run a targeted check instead.";
  }
  return null;
}

export function redactShellOutput(text: string): string {
  return redactSensitive(text);
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

function inferPreviewUrl(command: string): string | null {
  const normalized = normalizeCommand(command);
  const explicitPort = normalized.match(/(?:--port|-p)\s+(\d{2,5})\b/i);
  if (explicitPort) return `http://localhost:${explicitPort[1]}`;
  if (/\b(?:python|python3|py)\s+-m\s+http\.server\b/i.test(normalized)) {
    const port = normalized.match(/\bhttp\.server\s+(\d{2,5})\b/i)?.[1] ?? "8000";
    return `http://localhost:${port}`;
  }
  if (/\b(?:vite|pnpm\s+(?:run\s+)?dev|npm\s+(?:run\s+)?dev|yarn\s+(?:run\s+)?dev|bun\s+(?:run\s+)?dev)\b/i.test(normalized)) {
    return "http://localhost:5173";
  }
  if (/\bnext\s+dev\b/i.test(normalized)) return "http://localhost:3000";
  return null;
}

function validateLocalPreviewUrl(url: string): { ok: true } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid preview URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "preview URL must use http or https" };
  }
  const host = parsed.hostname;
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1" ||
    host.endsWith(".localhost");
  if (!local) return { ok: false, error: "preview URL must be localhost/loopback" };
  return { ok: true };
}

function findReusableProcess(
  processes: BackgroundProcess[],
  command: string,
  cwd: string,
): BackgroundProcess | null {
  const normalized = normalizeCommand(command);
  return (
    processes.find(
      (p) =>
        !p.exited &&
        normalizeCommand(p.command) === normalized &&
        (p.cwd ?? null) === cwd,
    ) ?? null
  );
}

async function maybeAuthorizeTerminalExecution(ctx: ToolContext, cwd: string | null) {
  const project = ctx.getProjectContext();
  if (project.executionCwdMode === "activeTerminal" && cwd) {
    await native.workspaceAuthorize(cwd);
  }
}

export function buildShellTools(ctx: ToolContext) {
  return {
    bash_run: tool({
      description:
        "Run a foreground shell command in this session's persistent agent shell — a real long-lived shell process, so cwd, exports, aliases, functions, and shell options set by one command are visible to the next command in this session (e.g. `export FOO=bar` then `echo $FOO` in a later call). If a command times out or crashes the shell, the next call transparently gets a fresh shell — only that in-flight command's environment changes are lost, not earlier ones. Uses the current execution_cwd from Atlas context, not the active terminal cwd unless that mode is explicitly selected. Use for short-lived commands (lint, test, search, build, or OS opener commands like `cmd.exe /c start \"\" \"index.html\"`, `open index.html`, `xdg-open index.html`). For long-running or daemon processes (dev servers, watch tasks), use `bash_background`. NEVER invoke interactive tools (vim, less, top) because they will hang. Asks for user approval.",
      inputSchema: z.object({
        command: z.string(),
        timeout_secs: z.number().int().min(1).max(300).optional(),
      }),
      needsApproval: ({ command }) =>
        shellNeedsApproval(command, ctx.getApprovalMode()),
      execute: async ({ command, timeout_secs }) => {
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };
        const sensitiveOutputBlock = sensitiveShellOutputBlockReason(command);
        if (sensitiveOutputBlock) return { error: sensitiveOutputBlock };
        const foregroundBlock = foregroundCommandBlockReason(command);
        if (foregroundBlock) return { error: foregroundBlock };
        const sid = ctx.getSessionId();
        if (!sid) return { error: "no active chat session" };
        try {
          const project = ctx.getProjectContext();
          const cwd = project.executionCwd;
          if (!cwd) return { error: "no execution_cwd is available" };
          await maybeAuthorizeTerminalExecution(ctx, cwd);
          const shellId = await getSessionShell(shellSessionKey(sid, cwd), cwd);
          const startedAt = Date.now();
          const r = await native.shellSessionRun(
            shellId,
            command,
            cwd,
            timeout_secs,
          );
          const verification = verificationRecovery(command, r.exit_code);
          const recovery = commandFailureRecovery(
            command,
            r.exit_code,
            r.stderr,
          );
          const eofHint = interactiveEofHint(r.exit_code, r.stderr);
          return {
            command,
            stdout: redactShellOutput(r.stdout),
            stderr: redactShellOutput(r.stderr),
            exit_code: r.exit_code,
            timed_out: r.timed_out,
            truncated: r.truncated,
            cwd,
            cwd_after: r.cwd_after,
            duration_ms: Date.now() - startedAt,
            ...(r.exit_code !== 0 ? { command_failed: true } : {}),
            ...(verification ? { verification_failed: true } : {}),
            ...(recovery ? { recovery } : {}),
            ...(eofHint ? { interactive_stdin_note: eofHint } : {}),
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    serve_preview: tool({
      description:
        "Start or reuse a long-running local dev server and open its preview in one step. Prefer this over manually chaining bash_list, bash_background, bash_logs, and open_preview when the user asks to run/open/preview a web app. Pass the server command and URL when known; common ports are inferred for python -m http.server, Vite, and Next. Asks for user approval.",
      inputSchema: z.object({
        command: z.string(),
        url: z.string().optional(),
        cwd: z.string().nullable().optional(),
        wait_ms: z.number().int().min(0).max(5000).optional(),
      }),
      needsApproval: ({ command }) =>
        shellNeedsApproval(command, ctx.getApprovalMode()),
      execute: async (
        { command, url, cwd, wait_ms },
        options: ToolExecutionOptions,
      ) => {
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };
        const project = ctx.getProjectContext();
        const effectiveCwd = cwd
          ? resolvePath(cwd, project)
          : project.executionCwd;
        if (!effectiveCwd) return { error: "no execution_cwd is available" };
        const previewUrl = url?.trim() || inferPreviewUrl(command);
        if (!previewUrl) {
          return {
            error:
              "preview URL could not be inferred; pass a localhost URL such as http://localhost:5173",
          };
        }
        const urlOk = validateLocalPreviewUrl(previewUrl);
        if (!urlOk.ok) return { error: urlOk.error, url: previewUrl };
        try {
          await maybeAuthorizeTerminalExecution(ctx, effectiveCwd);
          const existing = findReusableProcess(
            await native.shellBgList(),
            command,
            effectiveCwd,
          );
          const spawned = !existing;
          const handle =
            existing?.handle ??
            (await native.shellBgSpawn(command, effectiveCwd));
          if (spawned) {
            const sid = ctx.getSessionId();
            if (sid) {
              registerRunBackgroundHandle(sid, options.abortSignal, handle);
            }
          }
          const wait = wait_ms ?? 1200;
          if (wait > 0 && !existing) {
            await new Promise((resolve) => setTimeout(resolve, wait));
          }
          const logs = await native.shellBgLogs(handle, 0).catch(() => null);
          const exitedBadly =
            !!logs?.exited &&
            typeof logs.exit_code === "number" &&
            logs.exit_code !== 0;
          if (exitedBadly) {
            return {
              ok: false,
              reused: !!existing,
              handle,
              command,
              cwd: effectiveCwd,
              url: previewUrl,
              logs: {
                bytes: redactShellOutput(logs.bytes.slice(-4000)),
                exited: logs.exited,
                exit_code: logs.exit_code,
                dropped: logs.dropped,
                next_offset: logs.next_offset,
              },
              error:
                "preview server exited before it became usable; fix the logged error before opening preview",
              recovery: commandFailureRecovery(
                command,
                logs.exit_code,
                logs.bytes,
              ),
            };
          }
          const opened = ctx.openPreview(previewUrl);
          return {
            ok: opened,
            reused: !!existing,
            handle,
            command,
            cwd: effectiveCwd,
            url: previewUrl,
            logs: logs
              ? {
                  bytes: redactShellOutput(logs.bytes.slice(-4000)),
                  exited: logs.exited,
                  exit_code: logs.exit_code,
                  dropped: logs.dropped,
                  next_offset: logs.next_offset,
                }
              : null,
            error: opened ? undefined : "preview surface unavailable",
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_background: tool({
      description:
        "Spawn a long-running background process (e.g. `pnpm dev`, `cargo watch`, log tailers). Returns a handle; use `bash_logs` to read its output and `bash_kill` to stop it. Output is captured into a 4MB ring buffer. Asks for user approval.",
      inputSchema: z.object({
        command: z.string(),
        cwd: z.string().nullable().optional(),
      }),
      needsApproval: ({ command }) =>
        shellNeedsApproval(command, ctx.getApprovalMode()),
      execute: async (
        { command, cwd },
        options: ToolExecutionOptions,
      ) => {
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };
        const project = ctx.getProjectContext();
        const effectiveCwd = cwd
          ? resolvePath(cwd, project)
          : project.executionCwd;
        if (!effectiveCwd) return { error: "no execution_cwd is available" };
        try {
          await maybeAuthorizeTerminalExecution(ctx, effectiveCwd);
          const handle = await native.shellBgSpawn(command, effectiveCwd);
          const sid = ctx.getSessionId();
          if (sid) {
            registerRunBackgroundHandle(sid, options.abortSignal, handle);
          }
          return { handle, command, cwd: effectiveCwd, ok: true };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_logs: tool({
      description:
        "Read accumulated logs from a `bash_background` process. Pass `since_offset` from the previous response's `next_offset` to tail incrementally. `dropped` reports bytes evicted by the ring buffer.",
      inputSchema: z.object({
        handle: z.number().int(),
        since_offset: z.number().int().optional(),
      }),
      execute: async ({ handle, since_offset }) => {
        try {
          const r = await native.shellBgLogs(handle, since_offset);
          return { ...r, bytes: redactShellOutput(r.bytes) };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_list: tool({
      description:
        "List all background processes spawned by `bash_background` in this app — running and exited. **Always call this BEFORE spawning a new long-running process** (especially dev servers like `pnpm dev`, `next dev`, `vite`) to avoid duplicates. If a matching process is already running, reuse it (call `open_preview` again instead of respawning). Auto-executes.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const list = await native.shellBgList();
          return { processes: list };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_kill: tool({
      description:
        "Terminate a `bash_background` process by handle. Idempotent — kills nothing if the handle is unknown or already exited.",
      inputSchema: z.object({ handle: z.number().int() }),
      execute: async ({ handle }) => {
        try {
          await native.shellBgKill(handle);
          return { handle, ok: true };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  } as const;
}
