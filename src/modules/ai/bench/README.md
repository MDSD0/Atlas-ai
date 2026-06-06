# Headless harness benchmark

Runs the **real** Atlas agent loop (`runAgentStream` → capability gateway,
prompt layers, compaction, step budget, memory kernel) in Node by shimming the
single `@tauri-apps/api/core` `invoke` boundary onto Node fs/child_process.

Unlike `scripts/local-agent-bug-bench.mjs` (a parallel mock with its own prompt
and tools), this measures the production harness — so the numbers actually
reflect the slices we ship.

## Run

```sh
ATLAS_BENCH=1 \
BENCH_PROVIDER=anthropic \
BENCH_MODEL=claude-sonnet-4-6 \
BENCH_API_KEY=sk-... \
npx vitest run src/modules/ai/bench/harness.bench.test.ts
```

Without `ATLAS_BENCH=1` + `BENCH_API_KEY`, the bench self-skips (keeps the
normal `vitest run` green and key-free).

## Metrics emitted per task

`pass, wallMs, steps, toolCalls, toolCounts, unlockedCapabilities, inputTokens,
outputTokens, cachedInputTokens, hitStepCap, finishReason`.

`unlockedCapabilities` shows which lazy tool families the gateway promoted — the
direct signal that progressive disclosure is working (an empty list on a simple
task means the model never needed to leave the ~14-tool core).

## Files

- `tauriInvokeShim.ts` — Node implementation of the core-toolbelt `invoke` commands.
- `runHarnessTask.ts` — drives one task through the real loop, collects metrics.
- `harness.bench.test.ts` — env-gated seed task (static calculator, first-pass).
