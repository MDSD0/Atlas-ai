/**
 * Headless Tauri `invoke` shim for benchmarking the REAL Atlas harness in Node.
 *
 * Every Atlas tool funnels through `invoke(command, args)` in lib/native.ts.
 * By implementing that one boundary over Node fs/child_process, the actual
 * runAgentStream + capability gateway + compaction + prompt layers + memory
 * kernel all run unchanged — no reimplementation, unlike the legacy mock bench.
 *
 * Scope: the core toolbelt (read/write/edit/list/grep/glob/shell) plus a minimal
 * repo_context. Preview/background/LSP/MCP are out of scope for first-pass tasks.
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join, isAbsolute, relative, sep } from "node:path";

export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const READ_LIMIT = 256 * 1024;

function canonical(root: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(root, p);
  try {
    return realpathSync(abs);
  } catch {
    return abs; // non-existent path: caller (context.ts) walks parents itself
  }
}

function walkFiles(dir: string, root: string, out: string[], cap: number): void {
  if (out.length >= cap) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, root, out, cap);
    else out.push(full);
    if (out.length >= cap) return;
  }
}

/** Build an `invoke` implementation rooted at `root` (the benchmark project dir). */
export function createInvokeShim(root: string): InvokeFn {
  const a = (args?: Record<string, unknown>) => (args ?? {}) as Record<string, unknown>;

  return async (command, rawArgs) => {
    const args = a(rawArgs);
    const path = typeof args.path === "string" ? args.path : "";

    switch (command) {
      case "workspace_current_dir":
        return root;
      case "workspace_authorize":
      case "workspace_authorize_agent_project":
        return root;

      case "fs_canonicalize":
      case "agent_fs_canonicalize":
        return canonical(root, path);

      case "fs_read_file":
      case "agent_fs_read_file": {
        const abs = canonical(root, path);
        if (!existsSync(abs)) throw new Error(`ENOENT: ${path}`);
        const buf = readFileSync(abs);
        if (buf.length > READ_LIMIT)
          return { kind: "toolarge", size: buf.length, limit: READ_LIMIT };
        return { kind: "text", content: buf.toString("utf8"), size: buf.length };
      }

      case "fs_write_file":
      case "agent_fs_write_file": {
        const abs = isAbsolute(path) ? path : resolve(root, path);
        mkdirSync(resolve(abs, ".."), { recursive: true });
        writeFileSync(abs, String(args.content ?? ""), "utf8");
        return null;
      }

      case "fs_create_file":
      case "agent_fs_create_dir":
      case "fs_create_dir": {
        const abs = isAbsolute(path) ? path : resolve(root, path);
        mkdirSync(command.includes("file") ? resolve(abs, "..") : abs, {
          recursive: true,
        });
        if (command.includes("file") && !existsSync(abs)) writeFileSync(abs, "", "utf8");
        return null;
      }

      case "fs_read_dir":
      case "agent_fs_read_dir": {
        const abs = canonical(root, path || root);
        let names: string[] = [];
        try {
          names = readdirSync(abs);
        } catch {
          return [];
        }
        return names
          .filter((n) => !n.startsWith("."))
          .map((name) => {
            const st = statSync(join(abs, name));
            return {
              name,
              kind: st.isDirectory() ? "dir" : st.isSymbolicLink() ? "symlink" : "file",
              size: st.size,
              mtime: Math.floor(st.mtimeMs),
            };
          });
      }

      case "fs_grep":
      case "agent_fs_grep": {
        const pattern = String(args.pattern ?? "");
        const searchRoot = canonical(root, String(args.root ?? root));
        const files: string[] = [];
        walkFiles(searchRoot, searchRoot, files, 2000);
        const re = new RegExp(pattern, args.caseInsensitive ? "i" : "");
        const hits: Array<{ path: string; rel: string; line: number; text: string }> = [];
        const max = Number(args.maxResults ?? 200);
        for (const file of files) {
          if (hits.length >= max) break;
          let lines: string[];
          try {
            lines = readFileSync(file, "utf8").split("\n");
          } catch {
            continue;
          }
          lines.forEach((text, i) => {
            if (hits.length < max && re.test(text))
              hits.push({ path: file, rel: relative(searchRoot, file), line: i + 1, text });
          });
        }
        return { hits, truncated: hits.length >= max, files_scanned: files.length, skipped_dirs: 0 };
      }

      case "fs_glob":
      case "agent_fs_glob": {
        const searchRoot = canonical(root, String(args.root ?? root));
        const files: string[] = [];
        walkFiles(searchRoot, searchRoot, files, 2000);
        const pat = String(args.pattern ?? "*").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const re = new RegExp(`${pat}$`);
        const hits = files
          .filter((f) => re.test(f.split(sep).join("/")))
          .map((f) => ({ path: f, rel: relative(searchRoot, f) }));
        return { hits, truncated: false, skipped_dirs: 0 };
      }

      case "shell_run_command":
      case "shell_session_run": {
        const cwd = (args.cwd as string) || root;
        try {
          const stdout = execSync(String(args.command ?? ""), {
            cwd,
            timeout: Number(args.timeoutSecs ?? 60) * 1000,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          return {
            stdout,
            stderr: "",
            exit_code: 0,
            timed_out: false,
            truncated: false,
            cwd_after: cwd,
          };
        } catch (e) {
          const err = e as { stdout?: string; stderr?: string; status?: number };
          return {
            stdout: err.stdout ?? "",
            stderr: err.stderr ?? String(e),
            exit_code: err.status ?? 1,
            timed_out: false,
            truncated: false,
            cwd_after: cwd,
          };
        }
      }
      case "shell_session_open":
        return 1;
      case "shell_session_close":
        return null;

      case "agent_reality_context": {
        // Headless: list real files (no Rust PageRank ranking — that's native).
        const files: string[] = [];
        walkFiles(root, root, files, 500);
        const rels = files.map((f) => relative(root, f).split(sep).join("/"));
        return {
          root,
          indexed_at_ms: Date.now(),
          cache_hit: false,
          watch_status: "headless",
          file_count: rels.length,
          symbol_count: 0,
          included_files: rels,
          matches: [],
          graph_relations: [],
          context:
            `Headless project at ${root}. Files:\n` + rels.map((r) => `- ${r}`).join("\n"),
          truncated: false,
          max_tokens: 0,
          projected_tokens: 0,
          naive_tokens: 0,
          ranking_strategy: "headless_file_list",
        };
      }

      // LSP is a native (Tauri/Rust) subsystem. Headless reports it as
      // unavailable so the model degrades to bash checks (e.g. tsc) — the same
      // graceful path a real machine without a language server takes.
      case "agent_lsp_status":
        return [];
      case "agent_lsp_diagnostics":
        return {
          provider: "none",
          status: "unavailable",
          file: String(args.file ?? ""),
          diagnostics: [],
          waited_ms: 0,
          detail: "LSP unavailable in headless benchmark",
        };
      case "agent_lsp_semantic":
        return {
          provider: "none",
          operation: (args.request as { operation?: string })?.operation ?? "hover",
          status: "unavailable",
          file: String(args.file ?? ""),
          result: null,
          truncated: false,
          waited_ms: 0,
          detail: "LSP unavailable in headless benchmark",
        };

      // Cloud providers now route through the Rust HTTP proxy (ai_http_stream).
      // Headless, we honor that path with a real node fetch streamed back over
      // the Channel — so the bench exercises the actual proxy code, not a bypass.
      case "ai_http_stream": {
        const onEvent = (args as { onEvent?: { onmessage?: (e: unknown) => void } })
          .onEvent;
        const emit = (e: unknown) => onEvent?.onmessage?.(e);
        try {
          const res = await fetch(String(args.url), {
            method: String(args.method ?? "GET"),
            headers: (args.headers as Record<string, string>) ?? undefined,
            body: args.body ? Uint8Array.from(args.body as number[]) : undefined,
          });
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          emit({ kind: "headers", status: res.status, headers });
          if (res.body) {
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) emit({ kind: "chunk", bytes: Array.from(value) });
            }
          }
          emit({ kind: "end" });
        } catch (e) {
          emit({ kind: "error", message: String(e) });
        }
        return null;
      }

      default:
        throw new Error(`tauriInvokeShim: unhandled command "${command}"`);
    }
  };
}

/** Create the project dir if missing. */
export function ensureProjectDir(dir: string): string {
  const abs = resolve(dir);
  mkdirSync(abs, { recursive: true });
  return abs;
}
