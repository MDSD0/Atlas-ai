import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInvokeShim, type InvokeFn } from "./tauriInvokeShim";
import { runHarnessTask, type HarnessTask } from "./runHarnessTask";
import { resolveBenchProvider } from "./benchProvider";

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

const PROVIDER = resolveBenchProvider();
const MODEL = PROVIDER.modelId;
const MAX_STEPS = Number(process.env.BENCH_MAX_STEPS ?? 22);
const MAX_OUTPUT_TOKENS = Number(process.env.BENCH_MAX_OUTPUT_TOKENS ?? 1024);
const TEST_TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS ?? 3_600_000);
const INSTANCE_LIMIT = Number(process.env.BENCH_INSTANCE_LIMIT ?? 0);
const FATAL_PROVIDER_ERROR =
  /insufficient credits|credit balance is too low|invalid api key|unauthorized|forbidden|quota/i;
// Ablation arm for "does the repo map earn its keep?":
//   REPO_INTEL=map  â†’ repo_intel pre-promoted (ranked symbol index available)
//   REPO_INTEL=off  â†’ repo_intel blocked entirely (grep + read only)
//   REPO_INTEL=minimal â†’ bare 4-tool loop (bash+read+write+edit), no gateway â€”
//                        the control for "does the harness beat raw bash?"
const REPO_INTEL = (process.env.REPO_INTEL ?? "map").toLowerCase();
const PRE_PROMOTE = REPO_INTEL === "map" ? ["repo_intel"] : undefined;
const BLOCK_CAPS = REPO_INTEL === "off" ? ["repo_intel"] : undefined;
const FORCE_TOOLS =
  REPO_INTEL === "minimal"
    ? ["bash_run", "read_file", "write_file", "edit"]
    : undefined;
const ROOT = process.cwd();
const INSTANCES_FILE = join(ROOT, "sweb_instances.json");
const PREDICTIONS_FILE = join(
  ROOT,
  `sweb_predictions_${(process.env.REPO_INTEL ?? "map").toLowerCase()}.jsonl`,
);
const LOCATE_INSTRUCTION =
  REPO_INTEL === "minimal"
    ? "Use only shell commands plus read/edit/write tools to inspect and modify the repository. Navigate like a small baseline coding agent: list/search with bash, read the relevant files, then edit."
    : REPO_INTEL === "off"
      ? "Start by locating the relevant code with grep/search and targeted reads. Do not rely on repo-map navigation."
      : "Start by locating the relevant code: use repo_map and find_symbol to find where the affected functions/classes are defined (don't read the whole tree).";

type Instance = {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  /** Files the gold patch edits â€” ground truth for localization scoring. */
  gold_files?: string[];
};

function sh(cmd: string, cwd: string, timeoutMs = 300_000): string {
  return execSync(cmd, { cwd, encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
}

/** Files touched by a unified diff (the agent's patch). */
function changedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/) ?? line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (m && m[1] !== "/dev/null") files.add(m[1].trim());
  }
  return [...files];
}

/**
 * Localization = did the agent edit the files the gold patch edits? This is the
 * metric the repo map/navigation actually drives (finding the right code),
 * isolated from whether the final fix is correct (the model's job). Measured
 * from gold-file overlap â€” free, no Docker eval, far less noisy than `resolved`.
 */
function localization(
  agentFiles: string[],
  goldFiles: string[] | undefined,
): { recall: number; precision: number; hit: boolean } | null {
  if (!goldFiles || goldFiles.length === 0) return null;
  const gold = new Set(goldFiles);
  const hits = agentFiles.filter((f) => gold.has(f));
  return {
    recall: hits.length / gold.size,
    precision: agentFiles.length ? hits.length / agentFiles.length : 0,
    hit: hits.length > 0,
  };
}

/** Clone repo at base_commit (blobless partial clone for speed) and return its dir. */
function cloneAt(inst: Instance, dir: string): void {
  const url = `https://github.com/${inst.repo}.git`;
  sh(`git clone --filter=blob:none --quiet ${url} .`, dir, 600_000);
  sh(`git checkout --quiet ${inst.base_commit}`, dir, 120_000);
  sh(`git checkout -b atlas-work`, dir, 30_000);
}

run("Atlas SWE-bench Lite trial (real harness â†’ predictions)", () => {
  it(
    "generates patches for 3 instances and writes a SWE-bench predictions file",
    async () => {
      const allInstances: Instance[] = JSON.parse(readFileSync(INSTANCES_FILE, "utf8"));
      const instances = INSTANCE_LIMIT > 0 ? allInstances.slice(0, INSTANCE_LIMIT) : allInstances;
      const predictions: string[] = [];
      const locScores: Array<{ recall: number; precision: number; hit: boolean }> = [];
      // eslint-disable-next-line no-console
      console.log(`[swe] provider=${PROVIDER.label} keyPresent=${PROVIDER.keyPresent} maxSteps=${MAX_STEPS} maxOutputTokens=${MAX_OUTPUT_TOKENS} repoIntel=${REPO_INTEL} instances=${instances.length}`);

      for (const inst of instances) {
        const dir = mkdtempSync(join(tmpdir(), "swe-"));
        let patch = "";
        let note = "";
        try {
          cloneAt(inst, dir);
          holder.invoke = createInvokeShim(dir);
          const task: HarnessTask = {
            name: inst.instance_id,
            projectDir: dir,
            prompt:
              `You are fixing a real bug in the ${inst.repo} repository (Python). ` +
              `${LOCATE_INSTRUCTION} ` +
              `The test environment is NOT available, so do NOT run tests. Read the relevant source, ` +
              `find the root cause, and make a minimal, correct code edit that fixes it.\n\n` +
              `Issue:\n${inst.problem_statement}\n\n` +
              `Locate the code, edit the source file(s) to resolve this, then stop.`,
            check: () => true,
          };
          const m = await runHarnessTask(task, {
            keys: PROVIDER.keys,
            modelId: MODEL,
            openrouterModelId: PROVIDER.openrouterModelId,
            maxSteps: MAX_STEPS,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            prePromote: PRE_PROMOTE,
            blockCapabilities: BLOCK_CAPS,
            forceActiveTools: FORCE_TOOLS,
          });
          patch = sh(`git diff`, dir, 60_000);
          const loc = localization(changedFiles(patch), inst.gold_files);
          if (loc) locScores.push(loc);
          const locStr = loc
            ? `loc[hit=${loc.hit} recall=${loc.recall.toFixed(2)} prec=${loc.precision.toFixed(2)}]`
            : "loc[no-gold]";
          note = `steps=${m.steps} hitStepCap=${m.hitStepCap} tools=${m.toolCalls} ` +
            `toolCounts=${JSON.stringify(m.toolCounts)} in=${m.inputTokens} out=${m.outputTokens} ` +
            `unlocked=${m.unlockedCapabilities.join("/") || "-"} used=${m.capabilitiesUsed.join("/") || "-"} unused=${m.promotedUnused.join("/") || "-"} patchBytes=${patch.length} ${locStr}${m.error ? ` error=${m.error.slice(0, 100)}` : ""}`;
          if (m.error && FATAL_PROVIDER_ERROR.test(m.error)) {
            throw new Error(m.error);
          }
        } catch (e) {
          note = `bridge-error: ${String(e).slice(0, 160)}`;
          if (FATAL_PROVIDER_ERROR.test(String(e))) {
            throw e;
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
        // eslint-disable-next-line no-console
        console.log(`[swe:${inst.instance_id}] ${note}`);
        predictions.push(
          JSON.stringify({
            instance_id: inst.instance_id,
            model_name_or_path: `atlas-${MODEL}`,
            model_patch: patch,
          }),
        );
      }

      writeFileSync(PREDICTIONS_FILE, predictions.join("\n") + "\n", "utf8");
      const nonEmpty = predictions.filter((p) => JSON.parse(p).model_patch.length > 0).length;
      // Aggregate localization â€” the primary, low-noise signal for navigation value.
      const n = locScores.length;
      const avg = (sel: (s: (typeof locScores)[number]) => number) =>
        n ? (locScores.reduce((a, s) => a + sel(s), 0) / n).toFixed(3) : "n/a";
      const hitRate = n ? (locScores.filter((s) => s.hit).length / n).toFixed(3) : "n/a";
      // eslint-disable-next-line no-console
      console.log(
        `\n=== ${REPO_INTEL} arm: ${predictions.length} predictions (${nonEmpty} non-empty) ===\n` +
          `LOCALIZATION (n=${n}): hitRate=${hitRate} avgRecall=${avg((s) => s.recall)} avgPrecision=${avg((s) => s.precision)}\n` +
          `Predictions: ${PREDICTIONS_FILE}\n`,
      );
      expect(existsSync(PREDICTIONS_FILE), "predictions file was not written").toBe(true);
      // Empty patches are diagnostic (a genuinely hard instance can legitimately
      // produce one), but a whole run producing near-zero non-empty patches is
      // an infra/harness failure, not a capability result — gate on the rate
      // instead of only checking the file exists.
      const minPatchRate = Number(process.env.BENCH_MIN_PATCH_RATE ?? 0.5);
      const patchRate = predictions.length > 0 ? nonEmpty / predictions.length : 0;
      expect(
        patchRate,
        `only ${nonEmpty}/${predictions.length} predictions produced a non-empty patch (min ${minPatchRate})\nsee ${PREDICTIONS_FILE}`,
      ).toBeGreaterThanOrEqual(minPatchRate);
    },
    TEST_TIMEOUT_MS,
  );
});
