import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createInvokeShim, type InvokeFn } from "./tauriInvokeShim";
import { runHarnessTask, type HarnessMetrics, type HarnessTask } from "./runHarnessTask";
import { EMPTY_PROVIDER_KEYS, type ProviderKeys } from "../lib/keyring";
import type { ModelId } from "../config";

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

function anthropicKey(): string {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    const m = raw.match(/^anthropic=(.*)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const MODEL = (process.env.BENCH_MODEL ?? "claude-haiku-4-5") as ModelId;
const MAX_STEPS = Number(process.env.BENCH_MAX_STEPS ?? 8); // budget guardrail

function seed(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
}
// A tiny 6-file Todo app used as the "existing complex repo".
function seedTodoApp(dir: string): void {
  seed(dir, {
    "package.json": JSON.stringify({ name: "todo", main: "src/server.js" }, null, 2) + "\n",
    "src/config.js": "module.exports = { storageKey: 'todos', region: 'us-east-1' };\n",
    "src/storage.js":
      "// Local object-storage layer (to be replaced by S3).\n" +
      "const mem = {};\n" +
      "function setItem(k, v) { mem[k] = v; /* localStorage.setItem(k, v) */ }\n" +
      "function getItem(k) { return mem[k]; /* localStorage.getItem(k) */ }\n" +
      "module.exports = { setItem, getItem };\n",
    "src/db.js":
      "const { setItem, getItem } = require('./storage');\n" +
      "const { storageKey } = require('./config');\n" +
      "function saveTodos(todos) { setItem(storageKey, JSON.stringify(todos)); }\n" +
      "function loadTodos() { return JSON.parse(getItem(storageKey) || '[]'); }\n" +
      "module.exports = { saveTodos, loadTodos };\n",
    "src/util.js":
      "function fetchUserData(id) { return { id, name: 'user' + id }; }\n" +
      "module.exports = { fetchUserData };\n",
    "src/routes.js":
      "const { saveTodos, loadTodos } = require('./db');\n" +
      "const { getUserData } = require('./util');\n" + // BUG: util exports fetchUserData
      "function addTodo(text) { const t = loadTodos(); t.push({ text, by: getUserData(1).name }); saveTodos(t); return t; }\n" +
      "module.exports = { addTodo };\n",
    "src/server.js":
      "const { addTodo } = require('./routes');\n" +
      "console.log(JSON.stringify(addTodo('first')));\n",
  });
}

function node(dir: string, cmd: string): string {
  return execSync(cmd, { cwd: dir, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

type Test = {
  id: string;
  kind: string;
  build: (dir: string) => HarnessTask;
  judge: (dir: string, m: HarnessMetrics) => { pass: boolean; note: string };
};

const TESTS: Test[] = [
  {
    id: "T1-wide",
    kind: "repo navigation (map + parallel grep, no file reads)",
    build: (dir) => {
      seedTodoApp(dir);
      return {
        name: "wide",
        projectDir: dir,
        prompt:
          "Use repo_context to see the project layout. WITHOUT reading any file contents, I want to replace the local object-storage logic with an external S3 API. List every file impacted by this change and why (based on require/import dependencies), and run grep to find where 'localStorage' is referenced.",
        check: () => false,
      };
    },
    judge: (_dir, m) => {
      const text = m.finalText.toLowerCase();
      const grepped = (m.toolCounts["grep"] ?? 0) >= 1;
      const namesStorage = text.includes("storage.js");
      const namesDb = text.includes("db.js");
      return {
        pass: grepped && namesStorage && namesDb,
        note: `grep=${grepped} storage.js=${namesStorage} db.js=${namesDb}`,
      };
    },
  },
  {
    id: "T2-narrow",
    kind: "cross-tool diagnostic (LSP→fallback grep), propose-not-modify",
    build: (dir) => {
      seedTodoApp(dir);
      return {
        name: "narrow",
        projectDir: dir,
        prompt:
          "Running `node src/server.js` crashes with a TypeError. Diagnose it: try lsp diagnostics if available, otherwise use grep/read to find the mismatched import name. Identify the exact wrong name and the correct one. Do NOT modify any file — just state the file, the wrong identifier, and the correct identifier.",
        check: () => false,
      };
    },
    judge: (dir, m) => {
      const text = m.finalText.toLowerCase();
      const found = text.includes("getuserdata") && text.includes("fetchuserdata");
      const investigated = (m.toolCounts["grep"] ?? 0) + (m.toolCounts["read_file"] ?? 0) >= 1;
      // Did it honor "do not modify"? routes.js should still have the bug.
      let unmodified = true;
      try {
        unmodified = readFileSync(join(dir, "src/routes.js"), "utf8").includes("getUserData");
      } catch {
        unmodified = false;
      }
      return {
        pass: found && investigated && unmodified,
        note: `bothNames=${found} investigated=${investigated} leftUnmodified=${unmodified}`,
      };
    },
  },
  {
    id: "T3-narrower",
    kind: "bash self-correction loop (stderr → fix → re-run)",
    build: (dir) => {
      seed(dir, {
        "math.js": "module.exports.add = (a, b) => a - b;\n", // BUG
      });
      return {
        name: "narrower",
        projectDir: dir,
        prompt:
          "Write math.test.js that requires ./math and uses node's assert to check add(2,3) === 5, exiting non-zero on failure. Run `node math.test.js`. If it fails, the bug is in math.js — fix it and re-run until the test passes cleanly.",
        check: () => {
          try {
            node(dir, "node math.test.js");
            return true;
          } catch {
            return false;
          }
        },
      };
    },
    judge: (dir, _m) => {
      let pass = false;
      try {
        node(dir, "node math.test.js");
        pass = true;
      } catch {
        pass = false;
      }
      const fixed = (() => {
        try {
          return /a\s*\+\s*b/.test(readFileSync(join(dir, "math.js"), "utf8"));
        } catch {
          return false;
        }
      })();
      return { pass: pass && fixed, note: `testPasses=${pass} mathFixed=${fixed} hasTest=${existsSync(join(dir, "math.test.js"))}` };
    },
  },
];

run("Atlas capability stress (claude-haiku-4-5, real loop)", () => {
  it(
    "wide / narrow / narrower — SWE metrics",
    async () => {
      const key = anthropicKey();
      expect(key, "anthropic key missing from .env — cannot run capability benchmark").not.toBe("");
      const keys: ProviderKeys = { ...EMPTY_PROVIDER_KEYS, anthropic: key };
      // eslint-disable-next-line no-console
      console.log(`[cap] model=${MODEL} maxSteps=${MAX_STEPS} key=${key ? "present" : "MISSING"}`);
      const summary: string[] = [];
      const providerErrors: string[] = [];
      let totalIn = 0;
      let totalOut = 0;
      let passes = 0;

      for (const t of TESTS) {
        const dir = mkdtempSync(join(tmpdir(), "atlas-cap-"));
        holder.invoke = createInvokeShim(dir);
        const task = t.build(dir);
        const m = await runHarnessTask(task, { keys, modelId: MODEL, maxSteps: MAX_STEPS });
        if (m.error) providerErrors.push(`${t.id}: ${m.error.slice(0, 160)}`);
        const verdict = m.error ? { pass: false, note: `error=${m.error.slice(0, 120)}` } : t.judge(dir, m);
        if (verdict.pass) passes++;
        totalIn += m.inputTokens;
        totalOut += m.outputTokens;
        // eslint-disable-next-line no-console
        console.log(
          `[cap:${t.id}] ${t.kind}\n   pass=${verdict.pass} (${verdict.note}) wallMs=${m.wallMs} steps=${m.steps} ` +
            `toolCalls=${m.toolCalls} tools=${JSON.stringify(m.toolCounts)} unlocked=${JSON.stringify(m.unlockedCapabilities)} ` +
            `in=${m.inputTokens} out=${m.outputTokens} cached=${m.cachedInputTokens} hitCap=${m.hitStepCap} finish=${m.finishReason}`,
        );
        summary.push(`${t.id} | pass=${verdict.pass} | ${verdict.note} | steps=${m.steps} tools=${m.toolCalls} in=${m.inputTokens} out=${m.outputTokens} unlocked=${m.unlockedCapabilities.join("/") || "-"}`);
        rmSync(dir, { recursive: true, force: true });
      }

      const estCost = (totalIn * 1 + totalOut * 5) / 1_000_000; // haiku-4-5 $/Mtok
      // eslint-disable-next-line no-console
      console.log(
        `\n=== Atlas capability stress summary (${MODEL}) ===\n` +
          summary.join("\n") +
          `\n\nscore=${passes}/${TESTS.length} totalIn=${totalIn} totalOut=${totalOut} estCost=$${estCost.toFixed(4)}\n`,
      );

      // A provider/tool error is an infra failure, not a capability result —
      // it must fail the run rather than being silently absorbed into the
      // pass count as just another judge failure.
      expect(providerErrors, providerErrors.join(" | ")).toEqual([]);
      const minPassRate = Number(process.env.BENCH_MIN_PASS_RATE ?? 0.66);
      const passRate = TESTS.length > 0 ? passes / TESTS.length : 0;
      expect(
        passRate,
        `capability pass rate ${passes}/${TESTS.length} (${passRate.toFixed(2)}) below threshold ${minPassRate}\n${summary.join("\n")}`,
      ).toBeGreaterThanOrEqual(minPassRate);
    },
    600_000,
  );
});
