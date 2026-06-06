# Headless harness benchmark

Runs the **real** Atlas agent loop (`runAgentStream` → capability gateway,
prompt layers, compaction, step budget, memory kernel) in Node by shimming the
single `@tauri-apps/api/core` `invoke` boundary onto Node fs/child_process.

Unlike `scripts/local-agent-bug-bench.mjs` (a parallel mock with its own prompt
and tools), this measures the production harness — so the numbers actually
reflect the slices we ship.

## Run

```sh
ATLAS_BENCH_RUN=1 BENCH_MAX_STEPS=10 npx vitest run src/modules/ai/bench/progressiveBench.test.ts
```

`progressiveBench.test.ts` reads redacted key slots from `.env` (`g1..g5`,
`gq1..gq8`, `key1..key7`) and rotates across Gemini, Groq, then OpenRouter.
Use `BENCH_ONLY=T3` to run one task and `BENCH_OR_MODEL=provider/model` to pick
the OpenRouter fallback. Use `BENCH_PROVIDERS=openrouter` to bypass exhausted
providers while keeping the same production loop. Without `ATLAS_BENCH_RUN=1`,
the paid/API bench self-skips and the normal test suite stays key-free.

## Metrics emitted per task

`pass, wallMs, steps, toolCalls, toolCounts, toolErrors,
repeatedToolFailures, unlockedCapabilities, inputTokens, outputTokens,
cachedInputTokens, hitStepCap, finishReason`.

`unlockedCapabilities` shows which lazy tool families the gateway promoted — the
direct signal that progressive disclosure is working (an empty list on a simple
task means the model never needed to leave the ~14-tool core).

## Files

- `tauriInvokeShim.ts` — Node implementation of the core-toolbelt `invoke` commands.
- `runHarnessTask.ts` — drives one task through the real loop, collects metrics.
- `harness.bench.test.ts` — env-gated seed task (static calculator, first-pass).
