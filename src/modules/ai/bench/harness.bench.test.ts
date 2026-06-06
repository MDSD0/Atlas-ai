import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInvokeShim, type InvokeFn } from "./tauriInvokeShim";
import { runHarnessTask, type HarnessTask } from "./runHarnessTask";
import { EMPTY_PROVIDER_KEYS, type ProviderKeys } from "../lib/keyring";
import type { ProviderId } from "../config";
import type { ModelId } from "../config";

// The harness funnels every tool through @tauri-apps/api/core invoke; redirect
// it to a Node shim so the real runAgentStream runs headlessly.
const holder = vi.hoisted(() => ({
  invoke: (async () => {
    throw new Error("bench invoke shim not installed");
  }) as InvokeFn,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) =>
    holder.invoke(command, args),
  Channel: class {
    onmessage: ((e: unknown) => void) | null = null;
  },
}));

// Gating: only runs with ATLAS_BENCH=1 and a provider key. Keeps the normal
// `vitest run` green and key-free.
const ENABLED = process.env.ATLAS_BENCH === "1";
const PROVIDER = (process.env.BENCH_PROVIDER ?? "anthropic") as ProviderId;
const MODEL = (process.env.BENCH_MODEL ?? "claude-sonnet-4-6") as ModelId;
const API_KEY = process.env.BENCH_API_KEY ?? "";

const run = ENABLED && API_KEY ? describe : describe.skip;

run("Atlas harness benchmark (real loop)", () => {
  let projectDir: string;

  beforeAll(() => {
    projectDir = mkdtempSync(join(tmpdir(), "atlas-bench-"));
    holder.invoke = createInvokeShim(projectDir);
  });

  afterAll(() => {
    try {
      rmSync(projectDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  const calculatorTask = (dir: string): HarnessTask => ({
    name: "calculator",
    prompt:
      "Create index.html in the project root: a working calculator with digit buttons 0-9, + - * / operators, an = button, a clear button, and a display. Plain HTML/CSS/JS in one file, no build step.",
    projectDir: dir,
    check: () => {
      const file = join(dir, "index.html");
      if (!existsSync(file)) return false;
      const html = readFileSync(file, "utf8").toLowerCase();
      return html.includes("<button") && html.includes("<script") && /[+\-*/=]/.test(html);
    },
  });

  function logMetrics(label: string, m: Awaited<ReturnType<typeof runHarnessTask>>) {
    // eslint-disable-next-line no-console
    console.log(
      `[bench:${label}] pass=${m.pass} wallMs=${m.wallMs} steps=${m.steps} ` +
        `toolCalls=${m.toolCalls} tools=${JSON.stringify(m.toolCounts)} ` +
        `unlocked=${JSON.stringify(m.unlockedCapabilities)} ` +
        `in=${m.inputTokens} out=${m.outputTokens} cached=${m.cachedInputTokens} ` +
        `hitCap=${m.hitStepCap} finish=${m.finishReason}` +
        (m.error ? ` error=${m.error}` : ""),
    );
  }

  it(
    "gateway ablation: same task, gateway on vs off (token-tax delta)",
    async () => {
      const keys: ProviderKeys = { ...EMPTY_PROVIDER_KEYS, [PROVIDER]: API_KEY };

      // Gateway ON (production default): ~14-tool core, unlock on demand.
      const on = await runHarnessTask(calculatorTask(projectDir), {
        keys,
        modelId: MODEL,
      });
      logMetrics("gateway-on", on);

      // Gateway OFF: every tool schema shipped each step (old behavior).
      const offDir = mkdtempSync(join(tmpdir(), "atlas-bench-off-"));
      holder.invoke = createInvokeShim(offDir);
      try {
        const off = await runHarnessTask(calculatorTask(offDir), {
          keys,
          modelId: MODEL,
          gatewayDisabled: true,
        });
        logMetrics("gateway-off", off);

        // The headline claim: fewer tool schemas per step ⇒ fewer input tokens.
        // eslint-disable-next-line no-console
        console.log(
          `[bench:delta] input tokens on=${on.inputTokens} off=${off.inputTokens} ` +
            `saved=${off.inputTokens - on.inputTokens}`,
        );
        expect(on.inputTokens).toBeLessThan(off.inputTokens);
      } finally {
        rmSync(offDir, { recursive: true, force: true });
        holder.invoke = createInvokeShim(projectDir);
      }

      // First-pass success on the production (gateway-on) path.
      expect(on.error).toBeUndefined();
      expect(on.pass).toBe(true);
    },
    300_000,
  );
});
