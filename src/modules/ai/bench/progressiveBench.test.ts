import { describe, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createInvokeShim, type InvokeFn } from "./tauriInvokeShim";
import { runHarnessTask, type HarnessTask, type HarnessMetrics } from "./runHarnessTask";
import { EMPTY_PROVIDER_KEYS, type ProviderKeys } from "../lib/keyring";
import type { ModelId, ProviderId } from "../config";

const holder = vi.hoisted(() => ({
  invoke: (async () => {
    throw new Error("shim not installed");
  }) as InvokeFn,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (c: string, a?: Record<string, unknown>) => holder.invoke(c, a),
  Channel: class {
    onmessage: ((e: unknown) => void) | null = null;
  },
}));

const RUN = process.env.ATLAS_BENCH_RUN === "1";
const run = RUN ? describe : describe.skip;

// ---- .env key loading --------------------------------------------------------
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = "";
  try {
    raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
function pick(env: Record<string, string>, prefix: string, n: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) if (env[`${prefix}${i}`]) keys.push(env[`${prefix}${i}`]);
  return keys;
}

type Candidate = {
  label: string;
  provider: ProviderId;
  modelId: ModelId;
  openrouterModelId?: string;
  keys: string[];
};

async function runWithRotation(
  task: HarnessTask,
  candidates: Candidate[],
): Promise<{ used: string; metrics: HarnessMetrics } | null> {
  let last: { used: string; metrics: HarnessMetrics } | null = null;
  for (const c of candidates) {
    for (let i = 0; i < c.keys.length; i++) {
      const keys: ProviderKeys = { ...EMPTY_PROVIDER_KEYS, [c.provider]: c.keys[i] };
      const metrics = await runHarnessTask(task, {
        keys,
        modelId: c.modelId,
        openrouterModelId: c.openrouterModelId,
        maxSteps: Number(process.env.BENCH_MAX_STEPS ?? 10),
        maxOutputTokens: Number(process.env.BENCH_MAX_OUTPUT_TOKENS ?? 2048),
      });
      last = { used: `${c.label}#${i + 1}`, metrics };
      const dead =
        metrics.error ||
        metrics.finishReason === "error" ||
        (metrics.inputTokens === 0 && metrics.toolCalls === 0);
      if (!dead) return last; // the provider actually produced a run (pass or fail)
      // Dead key (rate/auth/empty/error): rotate to the next key/provider so an
      // exhausted key never hides a result a fresh provider could produce.
    }
  }
  return last;
}

function seed(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
}
function node(dir: string, cmd: string): string {
  return execSync(cmd, { cwd: dir, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function nodeOk(dir: string, cmd: string): boolean {
  try {
    node(dir, cmd);
    return true;
  } catch {
    return false;
  }
}
/** Find a file by name anywhere under dir — models often nest output in subdirs. */
function findFile(dir: string, name: string): string | null {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  for (const n of names) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const full = join(dir, n);
    if (n === name) return full;
    if (statSync(full).isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}
/** Run a found entry file from its own directory and return trimmed stdout. */
function runEntry(dir: string, name: string): string | null {
  const file = findFile(dir, name);
  if (!file) return null;
  try {
    return node(dirname(file), `node ${name}`);
  } catch {
    return null;
  }
}

function treeOf(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === "node_modules" || name.startsWith(".git")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(`${prefix}${name}/`);
      out.push(...treeOf(full, `${prefix}  `));
    } else {
      out.push(`${prefix}${name} (${st.size}b)`);
    }
  }
  return out;
}

run("Atlas progressive harness benchmark (real loop)", () => {
  const env = loadEnv();
  const ONLY = process.env.BENCH_ONLY ?? "";
  const KEEP = process.env.BENCH_KEEP === "1";
  const providerFilter = new Set(
    (process.env.BENCH_PROVIDERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // Order is the fallback chain. OpenRouter free keys are out of credits and
  // groq keys are largely rate-limited from prior runs, so try the fresh,
  // capable Gemini keys first to get meaningful first-pass numbers.
  const candidates: Candidate[] = (
    [
      { label: "gemini", provider: "google" as ProviderId, modelId: "gemini-2.5-flash" as ModelId, keys: pick(env, "g", 5) },
      { label: "groq", provider: "groq" as ProviderId, modelId: "llama-3.3-70b-versatile" as ModelId, keys: pick(env, "gq", 8) },
      {
        label: "openrouter",
        provider: "openrouter" as ProviderId,
        modelId: "openrouter-custom" as ModelId,
        openrouterModelId: process.env.BENCH_OR_MODEL ?? "openai/gpt-4.1-mini",
        keys: pick(env, "key", 7),
      },
    ] satisfies Candidate[]
  ).filter(
    (c) =>
      c.keys.length > 0 &&
      (providerFilter.size === 0 || providerFilter.has(c.label)),
  );

  const tasks: Array<{ build: (dir: string) => HarnessTask; difficulty: string }> = [
    {
      difficulty: "T1 create-static",
      build: (dir) => ({
        name: "calculator",
        projectDir: dir,
        prompt:
          "Create index.html: a working calculator with digit buttons 0-9, + - * / operators, =, clear, and a display. One file, plain HTML/CSS/JS, no build.",
        check: () => {
          const file = findFile(dir, "index.html");
          if (!file) return false;
          const html = readFileSync(file, "utf8").toLowerCase();
          return html.includes("<button") && /[+\-*/=]/.test(html);
        },
      }),
    },
    {
      difficulty: "T2 multi-file + run",
      build: (dir) => ({
        name: "math-module",
        projectDir: dir,
        prompt:
          "Create math.js exporting functions add and subtract (CommonJS), and index.js that requires ./math and console.logs add(2,3). Then run `node index.js` and confirm it prints 5.",
        check: () => runEntry(dir, "index.js") === "5",
      }),
    },
    {
      difficulty: "T3 read+fix+verify",
      build: (dir) => {
        seed(dir, {
          "sum.js": "module.exports.sum = (a, b) => a - b;\n",
          "test.js":
            "const { sum } = require('./sum');\nif (sum(2,3) !== 5) { console.error('FAIL'); process.exit(1); }\nconsole.log('PASS');\n",
        });
        return {
          name: "fix-sum",
          projectDir: dir,
          prompt:
            "`node test.js` fails. Find and fix the bug (do not edit test.js), then run `node test.js` to confirm it prints PASS.",
          check: () => nodeOk(dir, "node test.js"), // seeded at root; fixed in place
        };
      },
    },
    {
      difficulty: "T4 repo-navigation",
      build: (dir) => {
        seed(dir, {
          "src/format.js": "module.exports.formatMoney = (cents) => '$' + Math.floor(cents / 100);\n",
          "src/order.js":
            "const { formatMoney } = require('./format');\nmodule.exports.total = () => formatMoney(1299);\n",
          "src/index.js": "console.log(require('./order').total());\n",
        });
        return {
          name: "fix-formatter",
          projectDir: dir,
          prompt:
            "Running `node src/index.js` prints the wrong price: it shows $12 but the total is 1299 cents and should print $12.99. Find and fix the money formatter, then run `node src/index.js` to confirm.",
          check: () => {
            try {
              return node(dir, "node src/index.js") === "$12.99";
            } catch {
              return false;
            }
          }, // seeded multi-file; fixed in place
        };
      },
    },
    {
      difficulty: "T5 logic + verify",
      build: (dir) => ({
        name: "fizzbuzz",
        projectDir: dir,
        prompt:
          "Create fizzbuzz.js exporting fizzbuzz(n) that returns an array for 1..n with standard Fizz/Buzz/FizzBuzz rules. Create run.js that requires it and prints fizzbuzz(15).join(' '). Run `node run.js` to verify.",
        check: () =>
          (runEntry(dir, "run.js") ?? "").includes(
            "1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz",
          ),
      }),
    },
  ];

  it(
    "runs progressively harder tasks and reports harness-honest metrics",
    async () => {
      // eslint-disable-next-line no-console
      console.log(`[bench] candidates: ${candidates.map((c) => `${c.label}(${c.keys.length})`).join(", ")}`);
      const rows: string[] = [];
      for (const t of tasks.filter((t) => !ONLY || t.difficulty.includes(ONLY))) {
        const dir = mkdtempSync(join(tmpdir(), "atlas-bench-"));
        holder.invoke = createInvokeShim(dir);
        const task = t.build(dir);
        const res = await runWithRotation(task, candidates);
        if (!res) {
          rows.push(`${t.difficulty} | NO PROVIDER`);
        } else {
          const m = res.metrics;
          // eslint-disable-next-line no-console
          console.log(
            `[bench:${t.difficulty}] via=${res.used} pass=${m.pass} wallMs=${m.wallMs} steps=${m.steps} ` +
              `toolCalls=${m.toolCalls} tools=${JSON.stringify(m.toolCounts)} ` +
              `toolErrors=${m.toolErrors} repeatedFailures=${m.repeatedToolFailures} ` +
              `errorSamples=${JSON.stringify(m.toolErrorSamples)} ` +
              `unlocked=${JSON.stringify(m.unlockedCapabilities)} ` +
              `in=${m.inputTokens} out=${m.outputTokens} hitCap=${m.hitStepCap} ` +
              `finish=${m.finishReason}${m.error ? ` error=${m.error.slice(0, 160)}` : ""}`,
          );
          rows.push(
            `${t.difficulty} | via=${res.used} pass=${m.pass} steps=${m.steps} tools=${m.toolCalls} in=${m.inputTokens} unlocked=${m.unlockedCapabilities.join("/") || "-"}`,
          );
          if (!m.pass) {
            // eslint-disable-next-line no-console
            console.log(`[bench:${t.difficulty}] tree:\n${treeOf(dir).map((l) => "  " + l).join("\n")}`);
          }
        }
        if (!KEEP) rmSync(dir, { recursive: true, force: true });
      }
      // eslint-disable-next-line no-console
      console.log("\n=== Atlas progressive bench summary ===\n" + rows.join("\n") + "\n");
    },
    900_000,
  );
});
