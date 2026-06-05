#!/usr/bin/env node
import { mkdir, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

loadDotEnv();

const root = process.cwd();
const projectsRoot = join(root, "projects");
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const reportDir = join(projectsRoot, "_logs", `local-agent-bug-bench-${runId}`);
const provider = process.env.BENCH_PROVIDER || "ollama";
const model =
  process.env.BENCH_MODEL ||
  process.env.OLLAMA_MODEL ||
  (provider === "openrouter"
    ? "openrouter/auto"
    : provider === "groq"
      ? "llama-3.3-70b-versatile"
      : provider === "openai"
        ? "gpt-4.1-mini"
        : provider === "gemini"
          ? "gemini-3.5-flash"
      : "qwen2.5-coder:7b");
const baseURL =
  process.env.BENCH_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  (provider === "openrouter"
    ? "https://openrouter.ai/api/v1"
    : provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : provider === "openai"
        ? "https://api.openai.com/v1"
        : provider === "gemini"
          ? "https://generativelanguage.googleapis.com/v1beta/openai"
    : "http://localhost:11434/v1");
const executeRawJson = process.env.EXECUTE_RAW_JSON === "1";
const maxTokens = Number(process.env.BENCH_MAX_TOKENS || 900);
const maxTurns = Number(process.env.BENCH_MAX_TURNS || 6);
const taskLimit = Number(process.env.BENCH_TASK_LIMIT || tasksDefaultLimit());
const taskOffset = Number(process.env.BENCH_TASK_OFFSET || 0);
const requestTimeoutMs = Number(process.env.BENCH_REQUEST_TIMEOUT_MS || 90_000);
const chatRetryLimit = Number(process.env.BENCH_CHAT_RETRIES || 2);
const pythonCommand = process.env.BENCH_PYTHON || "python";

const SYSTEM = `You are a coding agent inside a local-first harness.
Use tools to inspect and edit files. Do not print JSON manually.
When you need to change files, call write_file. When you need to inspect files,
call read_file or list_directory. When done, answer with a concise summary.
Never end with an intent-only message like "I will..." unless you also call the next tool.
Batch independent reads in one assistant step when several small files are named.
Do not run git status, git log, or git diff for simple file edits.
Never run env, printenv, set, export -p, or Get-ChildItem env:.`;

const tools = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files in a directory relative to the task project.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file relative to the task project.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a UTF-8 text file relative to the task project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash_run",
      description: "Run a short-lived shell command in the task project.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeout_secs: { type: "number" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "serve_preview",
      description: "Start or reuse a local dev server and open the preview in one step.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          url: { type: "string" },
          wait_ms: { type: "number" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todo_write",
      description: "Replace the current task todo list. Use only once for genuinely multi-step work.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              },
              required: ["title", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
];

const tasks = [
  {
    name: "frontend-calculator-create",
    prompt: "Build a simple scientific calculator in index.html, style.css, and script.js. Include sin, cos, tan, log, sqrt, power, memory buttons, keyboard input, and a clear display.",
    files: {
      "index.html": "<!doctype html><html><head><title>Calc</title></head><body><div id=\"app\"></div></body></html>\n",
      "style.css": "",
      "script.js": "",
    },
    checks: ["test -s index.html && test -s script.js"],
  },
  {
    name: "js-failing-test-fix",
    prompt: "Fix the failing JS test without changing the test file.",
    files: {
      "math.js": "export function add(a, b) { return String(a) + String(b); }\n",
      "math.test.mjs": "import { strict as assert } from 'node:assert';\nimport { add } from './math.js';\nassert.equal(add(2, 3), 5);\n",
      "package.json": "{\"type\":\"module\"}\n",
    },
    checks: ["node math.test.mjs"],
  },
  {
    name: "python-edge-case-fix",
    prompt: "Fix slugify.py so the test passes. Keep it simple.",
    files: {
      "slugify.py": "import re\n\ndef slugify(s):\n    return re.sub(r'\\W+', '-', s.lower()).strip('-')\n",
      "test_slugify.py": "from slugify import slugify\nassert slugify('  Hello,   World!!  ') == 'hello-world'\nassert slugify('ATLAS_ai') == 'atlas-ai'\n",
    },
    checks: [`${pythonCommand} test_slugify.py`],
  },
  {
    name: "read-before-edit",
    prompt: "Change the greeting to say hello to Atlas. Inspect the file first.",
    files: {
      "app.txt": "hello world\n",
    },
    checks: ["grep -q Atlas app.txt"],
  },
  {
    name: "avoid-foreground-server",
    prompt: "Run this tiny web app so I can preview it. Do not hang the foreground command.",
    files: {
      "index.html": "<h1>Preview me</h1>\n",
    },
    checks: ["test -f index.html"],
  },
  {
    name: "multi-file-import-fix",
    prompt: "Fix the import bug so node main.mjs prints ok.",
    files: {
      "main.mjs": "import { message } from './message.mjs';\nconsole.log(message());\n",
      "message.js": "export function message() { return 'ok'; }\n",
    },
    checks: ["node main.mjs"],
  },
  {
    name: "css-responsive-polish",
    prompt: "Improve the CSS so the button text does not overflow on narrow screens.",
    files: {
      "index.html": "<button class=\"primary\">Generate incredibly long scientific calculation report</button>\n",
      "style.css": ".primary{width:180px;font-size:24px;border-radius:20px;}\n",
    },
    checks: ["grep -q overflow-wrap style.css || grep -q word-break style.css"],
  },
  {
    name: "json-config-edit",
    prompt: "Update config.json to enable localModel and set maxSteps to 8. Preserve valid JSON.",
    files: {
      "config.json": "{\n  \"localModel\": false,\n  \"maxSteps\": 30\n}\n",
    },
    checks: ["node -e \"const c=require('./config.json'); if(!c.localModel||c.maxSteps!==8) process.exit(1)\""],
  },
  {
    name: "todo-churn-observation",
    prompt: "Make the one-line change in note.md: change status from draft to done. This is intentionally simple; do not create a plan.",
    files: {
      "note.md": "status: draft\n",
    },
    checks: ["grep -q 'status: done' note.md"],
  },
  {
    name: "verification-honesty",
    prompt: "Fix the bug and verify it with the provided test before claiming success.",
    files: {
      "is_even.py": "def is_even(n):\n    return True\n",
      "test_is_even.py": "from is_even import is_even\nassert is_even(2) is True\nassert is_even(3) is False\n",
    },
    checks: [`${pythonCommand} test_is_even.py`],
  },
  {
    name: "path-resolution-active-folder",
    prompt: "Create README.md for this project with a one-sentence description.",
    files: {
      "src/app.js": "console.log('x')\n",
    },
    checks: ["test -f README.md"],
  },
  {
    name: "malformed-existing-html",
    prompt: "Fix the malformed HTML and keep the existing text.",
    files: {
      "index.html": "<!doctype html><html><body><main><h1>Atlas</h2><p>Local first</main></body></html>\n",
    },
    checks: ["grep -q '</h1>' index.html && grep -q '</p>' index.html"],
  },
];

const selectedTasks = tasks.slice(taskOffset, taskOffset + taskLimit);
const keyRing = makeKeyRing(provider);

function tasksDefaultLimit() {
  return "12";
}

function loadDotEnv() {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function envNames(pattern) {
  return Object.keys(process.env)
    .filter((name) => pattern.test(name) && process.env[name])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function makeKeyRing(providerName) {
  const names =
    providerName === "openrouter"
      ? [...envNames(/^key\d+$/i), ...envNames(/^OPENROUTER_API_KEY(?:_\d+)?$/)]
      : providerName === "groq"
        ? [...envNames(/^gq\d+$/i), ...envNames(/^GROQ_API_KEY(?:_\d+)?$/)]
        : providerName === "gemini"
          ? [...envNames(/^g\d+$/i), ...envNames(/^(?:GEMINI|GOOGLE)_API_KEY(?:_\d+)?$/)]
          : providerName === "openai"
            ? envNames(/^OPENAI_API_KEY(?:_\d+)?$/)
            : [];
  const unique = [...new Set(names)];
  return { names: unique, index: 0 };
}

function nextKey() {
  if (keyRing.names.length === 0) return null;
  const name = keyRing.names[keyRing.index % keyRing.names.length];
  keyRing.index++;
  return { name, value: process.env[name] };
}

function providerNeedsAuth(providerName) {
  return ["openrouter", "groq", "openai", "gemini"].includes(providerName);
}

function redact(text) {
  let out = String(text ?? "");
  for (const name of keyRing.names) {
    const value = process.env[name];
    if (value) out = out.split(value).join(`[redacted:${name}]`);
  }
  out = out.replace(
    /\b([A-Za-z_][A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|key\d+|gq\d+|g\d+)[A-Za-z0-9_]*)=([^\s\r\n]+)/gi,
    (_match, name) => `${name}=[redacted]`,
  );
  out = out.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[redacted:openrouter]");
  out = out.replace(/gsk_[A-Za-z0-9_-]+/g, "[redacted:groq]");
  out = out.replace(/AIza[A-Za-z0-9_-]+/g, "[redacted:google]");
  out = out.replace(/AQ\.[A-Za-z0-9_-]+/g, "[redacted:google]");
  out = out.replace(/sk-proj-[A-Za-z0-9_-]+/g, "[redacted:openai]");
  return out;
}

function redactShellResult(result) {
  return {
    ...result,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
  };
}

function isRotatableProviderError(status, text) {
  const lower = String(text).toLowerCase();
  return (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 429 ||
    lower.includes("insufficient_quota") ||
    lower.includes("requires more credits") ||
    lower.includes("rate limit") ||
    lower.includes("invalid api key")
  );
}

function safeRel(p) {
  const clean = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.includes("..")) throw new Error(`unsafe path: ${p}`);
  return clean || ".";
}

function projectPath(projectDir, input) {
  const raw = String(input ?? ".");
  const candidate = isAbsolute(raw) ? resolve(raw) : resolve(projectDir, safeRel(raw));
  const rel = relative(projectDir, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return candidate;
  throw new Error(`path escapes task project: ${input}`);
}

async function execTool(projectDir, name, args) {
  if (name === "list_directory") {
    const dir = projectPath(projectDir, args.path || ".");
    const entries = await readdir(dir);
    return { entries };
  }
  if (name === "read_file") {
    const path = projectPath(projectDir, args.path);
    return { content: await readFile(path, "utf8") };
  }
  if (name === "write_file") {
    const path = projectPath(projectDir, args.path);
    await mkdir(dirname(path), { recursive: true }).catch(() => {});
    await writeFile(path, String(args.content ?? ""), "utf8");
    return { ok: true };
  }
  if (name === "bash_run") {
    const command = normalizeShellCommand(String(args.command ?? ""));
    const longRunning = /\b(?:python|python3|py)\s+-m\s+http\.server\b|\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:dev|start)\b|\b(?:vite|next|astro)\s+dev\b/i.test(command);
    if (longRunning) return { error: "long-running foreground command refused" };
    if (/^\s*(?:env|printenv|set)(?:\s|$)/i.test(command)) {
      return { error: "environment dump refused" };
    }
    return redactShellResult(
      await runShell(projectDir, command, Math.min(Number(args.timeout_secs || 5), 10)),
    );
  }
  if (name === "serve_preview") {
    const command = String(args.command ?? "");
    const url = String(args.url || inferPreviewUrl(command) || "");
    if (!url) return { error: "preview URL could not be inferred" };
    const longRunning = /\b(?:python|python3|py)\s+-m\s+http\.server\b|\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:dev|start)\b|\b(?:vite|next|astro)\s+dev\b/i.test(command);
    return {
      ok: true,
      simulated: true,
      command,
      url,
      note: longRunning
        ? "would spawn/reuse background server and open preview"
        : "command did not look like a known long-running server",
    };
  }
  if (name === "todo_write") {
    return { ok: true, count: Array.isArray(args.todos) ? args.todos.length : 0 };
  }
  return { error: `unknown tool: ${name}` };
}

function inferPreviewUrl(command) {
  const normalized = String(command).replace(/\s+/g, " ").trim();
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

function normalizeShellCommand(command) {
  if (!pythonCommand || pythonCommand === "python") return command;
  return command
    .replace(/(^|[;&|]\s*)python(?=\s+)/g, `$1${pythonCommand}`)
    .replace(/(^|[;&|]\s*)python3(?=\s+)/g, `$1${pythonCommand}`)
    .replace(/(^|[;&|]\s*)py(?=\s+)/g, `$1${pythonCommand}`);
}

function runShell(cwd, command, timeoutSecs) {
  return new Promise((resolve) => {
    const shell = process.env.ATLAS_BASH || "C:\\Program Files\\Git\\bin\\bash.exe";
    const child = spawn(shell, ["--noprofile", "--norc", "-lc", command], {
      cwd,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exit_code: null, timed_out: true });
    }, timeoutSecs * 1000);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}${String(e)}`, exit_code: null, timed_out: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exit_code: code, timed_out: false });
    });
  });
}

async function chat(messages) {
  const headers = { "content-type": "application/json" };
  let key = null;
  if (providerNeedsAuth(provider)) {
    key = nextKey();
    if (!key) {
      throw new Error(`no API key env var found for provider ${provider}`);
    }
    headers.authorization = `Bearer ${key.value}`;
  }
  if (provider === "openrouter") {
    headers["http-referer"] = "https://atlas.local";
    headers["x-title"] = "Atlas Local Agent Bug Bench";
  }
  for (let attempt = 0; attempt <= chatRetryLimit; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let res;
    let body;
    try {
      res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0,
          stream: false,
          max_tokens: maxTokens,
          ...(process.env.BENCH_REASONING_MAX_TOKENS
            ? { reasoning: { max_tokens: Number(process.env.BENCH_REASONING_MAX_TOKENS) } }
            : {}),
        }),
      });
      body = await res.text();
    } catch (e) {
      clearTimeout(timer);
      throw new Error(redact(`${key ? `key=${key.name} ` : ""}${String(e)}`));
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return JSON.parse(body);
    if (
      providerNeedsAuth(provider) &&
      attempt < chatRetryLimit &&
      isRotatableProviderError(res.status, body)
    ) {
      key = nextKey();
      if (!key) break;
      headers.authorization = `Bearer ${key.value}`;
      continue;
    }
    throw new Error(redact(`${res.status} ${key ? `key=${key.name} ` : ""}${body}`));
  }
  throw new Error(`provider ${provider} failed after key rotation`);
}

function parseRawJsonTools(content) {
  if (!content || typeof content !== "string") return null;
  const found = [];
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.name === "string" && parsed.arguments) {
      return [parsed];
    }
  } catch {}
  let depth = 0;
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const parsed = JSON.parse(content.slice(start, i + 1));
          if (parsed && typeof parsed.name === "string" && parsed.arguments) {
            found.push(parsed);
          }
        } catch {}
        start = -1;
      }
    }
  }
  return found.length ? found : null;
}

async function runTask(task, index) {
  const projectDir = join(projectsRoot, `project${index}`);
  await rm(projectDir, { recursive: true, force: true });
  await mkdir(projectDir, { recursive: true });
  for (const [path, content] of Object.entries(task.files)) {
    const full = join(projectDir, path);
    await mkdir(join(full, ".."), { recursive: true }).catch(() => {});
    await writeFile(full, content, "utf8");
  }

  const messages = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `${task.prompt}\n\nProject root: ${projectDir}\nUse tools. Do not just describe the change.`,
    },
  ];
  const events = [];
  const started = Date.now();
  let strictToolCalls = 0;
  let rawJsonToolCalls = 0;
  let todoWrites = 0;
  let malformed = 0;
  let final = null;
  let runError = null;

  const usageTotals = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  for (let turn = 1; turn <= maxTurns; turn++) {
    let data;
    try {
      data = await chat(messages);
    } catch (e) {
      runError = redact(String(e));
      events.push({
        turn,
        anomaly: "provider_error",
        source: provider,
        error: runError,
      });
      break;
    }
    const msg = data.choices?.[0]?.message ?? {};
    if (data.usage) {
      usageTotals.prompt_tokens += Number(data.usage.prompt_tokens || data.usage.input_tokens || 0);
      usageTotals.completion_tokens += Number(
        data.usage.completion_tokens || data.usage.output_tokens || 0,
      );
      usageTotals.total_tokens += Number(data.usage.total_tokens || 0);
    }
    events.push({ turn, response: msg, usage: data.usage });
    messages.push(msg);

    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      const rawCalls = parseRawJsonTools(msg.content);
      if (rawCalls) {
        rawJsonToolCalls += rawCalls.length;
        events.push({
          turn,
          anomaly: "raw_json_tool_call_in_content",
          source: "ollama-openai-compatible-response",
          parsed: rawCalls,
          impact: "strict OpenAI tool-call harness would not execute this",
        });
        if (executeRawJson) {
          for (const raw of rawCalls) {
            if (raw.name === "todo_write") todoWrites++;
            const result = await execTool(projectDir, raw.name, raw.arguments).catch((e) => ({ error: String(e) }));
            events.push({
              turn,
              compatibilityMode: "executed_raw_json_content",
              tool: raw.name,
              args: raw.arguments,
              result,
            });
            messages.push({
              role: "user",
              content: `Tool result for ${raw.name}: ${JSON.stringify(result).slice(0, 4000)}`,
            });
          }
          continue;
        }
      }
      final = msg.content ?? "";
      break;
    }

    for (const call of calls) {
      strictToolCalls++;
      const name = call.function?.name;
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch (e) {
        malformed++;
        events.push({ turn, anomaly: "malformed_tool_arguments", source: name, error: String(e) });
      }
      if (name === "todo_write") todoWrites++;
      const result = await execTool(projectDir, name, args).catch((e) => ({ error: String(e) }));
      events.push({ turn, tool: name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  const checkResults = [];
  for (const check of task.checks) {
    checkResults.push({
      command: check,
      ...redactShellResult(await runShell(projectDir, check, 5)),
    });
  }
  const passed = checkResults.every((r) => r.exit_code === 0 && !r.timed_out);
  const files = await snapshotFiles(projectDir);
  return {
    index,
    name: task.name,
    projectDir,
    prompt: task.prompt,
    duration_ms: Date.now() - started,
    usageTotals,
    passed,
    strictToolCalls,
    rawJsonToolCalls,
    todoWrites,
    malformed,
    runError,
    final,
    checkResults,
    files,
    events,
  };
}

async function snapshotFiles(projectDir) {
  const out = [];
  async function walk(dir) {
    for (const name of await readdir(dir)) {
      const full = join(dir, name);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full);
      else out.push(relative(projectDir, full).replace(/\\/g, "/"));
    }
  }
  await walk(projectDir);
  return out.sort();
}

function summarize(result) {
  const findings = [];
  if (result.rawJsonToolCalls > 0) {
    findings.push("raw JSON tool call emitted in assistant content; strict tool harness would not execute");
  }
  if (result.strictToolCalls === 0) findings.push("no OpenAI tool_calls emitted");
  if (result.todoWrites > 1) findings.push("todo churn: repeated todo_write calls");
  if (!result.passed) findings.push("task check failed");
  if (result.malformed > 0) findings.push("malformed tool arguments");
  if (result.runError) findings.push("provider error");
  return findings;
}

await mkdir(reportDir, { recursive: true });
const results = [];
for (let i = 0; i < selectedTasks.length; i++) {
  const index = taskOffset + i + 1;
  const result = await runTask(selectedTasks[i], index);
  results.push(result);
  await writeFile(join(reportDir, `project${index}.json`), JSON.stringify(result, null, 2), "utf8");
  console.log(`project${index}: ${result.name} passed=${result.passed} strictToolCalls=${result.strictToolCalls} rawJson=${result.rawJsonToolCalls} tokens=${result.usageTotals.total_tokens}`);
}

const lines = [
  "# Atlas Local-Agent Bug Bench",
  "",
  `- run_id: ${runId}`,
  `- model: ${model}`,
  `- provider: ${provider}`,
  `- base_url: ${baseURL}`,
  `- execute_raw_json: ${executeRawJson}`,
  `- max_tokens: ${maxTokens}`,
  `- max_turns: ${maxTurns}`,
  `- request_timeout_ms: ${requestTimeoutMs}`,
  `- key_env_names: ${keyRing.names.length ? keyRing.names.join(", ") : "none"}`,
  `- task_offset: ${taskOffset}`,
  `- task_limit: ${taskLimit}`,
  `- projects_root: ${projectsRoot}`,
  `- report_dir: ${reportDir}`,
  "",
  "## Summary",
  "",
  `- tasks: ${results.length}`,
  `- passed: ${results.filter((r) => r.passed).length}`,
  `- failed: ${results.filter((r) => !r.passed).length}`,
  `- tasks_with_strict_tool_calls: ${results.filter((r) => r.strictToolCalls > 0).length}`,
  `- tasks_with_raw_json_tool_calls: ${results.filter((r) => r.rawJsonToolCalls > 0).length}`,
  `- total_tokens: ${results.reduce((sum, r) => sum + r.usageTotals.total_tokens, 0)}`,
  `- prompt_tokens: ${results.reduce((sum, r) => sum + r.usageTotals.prompt_tokens, 0)}`,
  `- completion_tokens: ${results.reduce((sum, r) => sum + r.usageTotals.completion_tokens, 0)}`,
  `- duration_ms_total: ${results.reduce((sum, r) => sum + r.duration_ms, 0)}`,
  "",
  "## Findings By Project",
  "",
];

for (const r of results) {
  lines.push(`### project${r.index}: ${r.name}`);
  lines.push("");
  lines.push(`- project: ${r.projectDir}`);
  lines.push(`- passed: ${r.passed}`);
  lines.push(`- strict_tool_calls: ${r.strictToolCalls}`);
  lines.push(`- raw_json_tool_calls: ${r.rawJsonToolCalls}`);
  lines.push(`- todo_writes: ${r.todoWrites}`);
  lines.push(`- duration_ms: ${r.duration_ms}`);
  lines.push(`- total_tokens: ${r.usageTotals.total_tokens}`);
  lines.push(`- prompt_tokens: ${r.usageTotals.prompt_tokens}`);
  lines.push(`- completion_tokens: ${r.usageTotals.completion_tokens}`);
  lines.push(`- source: ${r.prompt}`);
  if (r.runError) lines.push(`- provider_error: ${JSON.stringify(r.runError.slice(0, 500))}`);
  const findings = summarize(r);
  lines.push(`- observed: ${findings.length ? findings.join("; ") : "no anomaly recorded"}`);
  for (const c of r.checkResults) {
    lines.push(`- check: \`${c.command}\` -> exit=${c.exit_code} timed_out=${c.timed_out}`);
  }
  if (r.final) lines.push(`- final_excerpt: ${JSON.stringify(String(r.final).slice(0, 240))}`);
  lines.push(`- raw_log: ${join(reportDir, `project${r.index}.json`)}`);
  lines.push("");
}

await writeFile(join(reportDir, "BENCHMARK_LOG.md"), `${lines.join("\n")}\n`, "utf8");
console.log(`log: ${join(reportDir, "BENCHMARK_LOG.md")}`);
