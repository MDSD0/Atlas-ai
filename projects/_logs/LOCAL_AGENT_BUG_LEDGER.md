# Local Agent Bug Ledger

Run set:

- Strict harness run: `projects/_logs/local-agent-bug-bench-2026-06-04T16-06-51-941Z/BENCHMARK_LOG.md`
- Raw-JSON compatibility observation run: `projects/_logs/local-agent-bug-bench-2026-06-04T16-07-48-191Z/BENCHMARK_LOG.md`
- OpenRouter attempt: `BENCH_PROVIDER=openrouter BENCH_MODEL=openrouter/auto node scripts/local-agent-bug-bench.mjs` returned `1` because `OPENROUTER_API_KEY` is not set in the clean shell.
- OpenRouter Gemini run: `BENCH_PROVIDER=openrouter BENCH_MODEL=google/gemini-3.5-flash` passed `7/12`, emitted strict tool calls on `12/12`, and emitted raw JSON on `0/12`.
- OpenRouter auto run: `BENCH_PROVIDER=openrouter BENCH_MODEL=openrouter/auto` passed `6/12`, emitted strict tool calls on `6/12`, and emitted raw JSON on `0/12`.
- OpenRouter cheap fallback run: `BENCH_PROVIDER=openrouter BENCH_MODEL=openai/gpt-4.1-mini` passed `5/12`, emitted strict tool calls on `12/12`, and emitted raw JSON on `0/12`.
- Post-fix OpenRouter Gemini rerun with `BENCH_MAX_TOKENS=[redacted] stopped after project4 because the account exhausted credits again (`402`; could only afford 498 requested max tokens).
- Groq `llama-3.3-70b-versatile` attempt stopped at project1 with `400 tool_use_failed`; the model generated an invalid tool-call name containing arguments.
- OpenAI direct `gpt-4.1-mini` attempt logged all 12 tasks as provider errors because the key returned `429 insufficient_quota`.
- Model: `qwen2.5-coder:7b`
- Endpoint: `http://localhost:11434/v1`
- Product code was not fixed during this pass.

## B001: Ollama/qwen emits tool calls as assistant text

- What it is: The model returns JSON like `{"name":"read_file","arguments":...}` in `message.content` instead of OpenAI `message.tool_calls`.
- Evidence: strict run projects 1-7 and 9-12 all recorded `raw_json_tool_call_in_content`; strict run had `tasks_with_strict_tool_calls: 0`.
- Source: Ollama OpenAI-compatible response shape for `qwen2.5-coder:7b` with tools enabled.
- User impact: Atlas appears to "generate unrelated JSON and exit" because the AI SDK never receives an executable tool call.
- Priority: P0. This blocks local qwen as an agent, independent of task difficulty.

## B002: Strict harness cannot progress after raw JSON content

- What it is: In strict mode, every task stops after the first raw JSON content message because there is no tool call to execute.
- Evidence: strict run passed only project5, and that pass was accidental because the seed `index.html` already existed; all other checks failed without file mutation.
- Source: Current harness relies on provider-native tool calls. There is no local-model compatibility parser or model eligibility guard.
- User impact: The UX looks like the model tried something, but nothing happens.
- Priority: P0.

## B003: Todo churn after tool rejection or minor errors

- What it is: The model repeatedly updates todos instead of doing the next concrete action.
- Evidence: compatibility run project5 had 3 todo writes after a refused foreground server command; project7 had 5 todo writes after guessing `styles.css`; project3 had 2 todo writes on a small Python edit.
- Source: `todo_write` is always in the toolbelt, including plain mode, and its description plus the system prompt encourage planning for non-trivial work.
- User impact: The UI fills with todos and feels slower while no useful work advances.
- Priority: P1.

## B004: Foreground server command tendency

- What it is: The model tried `npm start` through `bash_run` for a preview task.
- Evidence: compatibility run project5 turn 1 emitted `bash_run` with `cd ... && npm start`, which the benchmark guard refused as long-running foreground work.
- Source: Model behavior plus insufficiently enforced long-running process split in older harness behavior.
- User impact: Without the foreground guard, Stop appears broken while the native shell waits on a long-running process.
- Priority: P1. The new guard helps, but real Atlas should log this as an explicit UX error.

## B005: Wrong filename guesses instead of directory evidence

- What it is: The model guessed common filenames that did not exist.
- Evidence: compatibility run project4 read `greeting.txt` when the file was `app.txt`; project7 read and then planned around `styles.css` when the file was `style.css`.
- Source: Weak local model plus prompt/tool flow not forcing a fresh directory listing before path-specific reads.
- User impact: The agent reports success against the wrong file or burns turns recovering.
- Priority: P1.

## B006: Success claim after wrong-file mutation

- What it is: The model claimed completion even when the check failed.
- Evidence: compatibility run project4 final excerpt said the greeting was updated to "Hello Atlas!", but `grep -q Atlas app.txt` failed because it changed or targeted the wrong path.
- Source: Model final response not bound to verification result; check execution is outside the model's own judgment in this benchmark.
- User impact: User sees confident success while the workspace is still wrong.
- Priority: P1.

## B007: Environment assumptions in verification

- What it is: Python checks failed with `python: command not found` in the clean shell.
- Evidence: strict and compatibility runs project3 and project10 checks returned exit 127.
- Source: Benchmark clean PATH lacks Python. This is a host/envelope issue, not necessarily a model bug.
- User impact: Verification can fail for reasons unrelated to code correctness unless the harness reports missing runtime clearly.
- Priority: P2.

## B008: Scientific calculator task under-produced files

- What it is: In compatibility mode, the model wrote HTML and CSS but did not write `script.js` within the 6-turn cap.
- Evidence: compatibility run project1 failed `test -s index.html && test -s script.js`; raw log shows repeated read/write sequence ending before JS generation.
- Source: Small model decomposes slowly and spends turns on separate file reads/writes.
- User impact: The calculator task feels extremely slow and incomplete.
- Priority: P2.

## B009: Full tool mode is probably too much for local qwen

- What it is: Even the mini harness with only five tools showed tool-format failure and todo churn; Atlas full mode exposes many more tools.
- Evidence: zero strict tool calls in both runs; todo churn appeared despite the reduced tool set.
- Source: Local model capability mismatch with a broad OpenAI tool-calling contract.
- User impact: More tools likely make local runs slower and less reliable, not more capable.
- Priority: P1.

## B010: Need separate benchmark verdicts for strict and compatibility modes

- What it is: Strict mode measures product reality; compatibility mode measures what would happen if we add a raw-JSON adapter.
- Evidence: strict run passed 1/12 accidentally; compatibility run passed 5/12 and exposed second-order behavior.
- Source: Benchmark methodology.
- User impact: Without separating these, we might fix the wrong layer first.
- Priority: P2.

## B011: API benchmark key is only available inside app/keyring

- What it is: The shell benchmark cannot run OpenRouter because no `OPENROUTER_API_KEY` is visible in the clean environment.
- Evidence: `BENCH_PROVIDER=openrouter BENCH_MODEL=openrouter/auto node scripts/local-agent-bug-bench.mjs` returned `1` with `OPENROUTER_API_KEY is not set`.
- Source: Atlas stores provider keys through the Tauri keyring path; the standalone benchmark runner only uses environment variables.
- User impact: We cannot compare API behavior against local behavior from the clean shell until the key is temporarily exported or the runner is integrated into Atlas' key access path.
- Priority: P1 for benchmark coverage, not product UX.

## B012: API models prove provider-native tool calls are fine

- What it is: OpenRouter Gemini and OpenAI fallback produced real OpenAI `tool_calls`; they did not emit qwen-style raw JSON content.
- Evidence: Gemini run `local-agent-bug-bench-2026-06-04T16-45-06-174Z` had `tasks_with_strict_tool_calls: 12` and `tasks_with_raw_json_tool_calls: 0`; `openai/gpt-4.1-mini` run `local-agent-bug-bench-2026-06-04T16-49-31-951Z` had the same tool-call shape.
- Source: Provider/model behavior difference, not a universal Atlas tool schema failure.
- User impact: We should not rewrite the whole harness around local qwen before separating local compatibility from general UX bugs.
- Priority: P0 for diagnosis.

## B013: OpenRouter auto is inconsistent for tool-call benchmarking

- What it is: `openrouter/auto` sometimes answered in prose instead of calling available tools.
- Evidence: auto run `local-agent-bug-bench-2026-06-04T16-48-25-058Z` had `tasks_with_strict_tool_calls: 6` out of `12`; projects 1, 3, 7, 9, 10, and 12 emitted no tool calls and failed.
- Source: Auto-routing picks varying models/policies; not stable enough as the primary regression baseline.
- User impact: Auto can make Atlas look broken even when the selected routed model simply chooses not to use tools.
- Priority: P1.

## B014: Gemini uses real tools but can burn turns before mutation

- What it is: Gemini made legitimate tool calls but sometimes spent the six-turn observation budget reading/planning/explaining before completing the task.
- Evidence: Gemini project1 failed because `script.js` remained empty after 4 tool calls; project7 failed without adding `overflow-wrap` or `word-break`; project9 called `git status` for a one-line `note.md` edit and never completed the change.
- Source: Model behavior plus harness loop/step-budget design. The runner's 6-turn cap makes the failure visible quickly.
- User impact: User sees "working..." and tool activity, but simple tasks still do not complete fast enough.
- Priority: P1.

## B015: Reasoning-heavy Gemini endpoint is slow/costly for harness loops

- What it is: OpenRouter resolved `google/gemini-3.5-flash` to `google/gemini-3.5-flash-20260519`; it rejected `reasoning.max_tokens=[redacted] with "Reasoning is mandatory for this endpoint".
- Evidence: reasoning suppression probe returned `400`; Gemini benchmark took about `173.5s` for 12 tasks.
- Source: Provider endpoint behavior.
- User impact: It may be compatible but not necessarily a low-latency default for Atlas.
- Priority: P2.

## B016: Path contract mismatch in benchmark runner

- What it is: Some models passed absolute paths to tools whose benchmark schema said paths were relative to the task project; the runner joined those paths under the project and produced doubled paths.
- Evidence: `openai/gpt-4.1-mini` project4 and project11 failed with paths like `project11\C:\Users\...\project11\package.json`.
- Source: Benchmark runner contract and model behavior. Atlas product `resolvePath` may behave differently, so this is not yet a confirmed product filesystem bug.
- User impact: Tool schemas should be explicit, and benchmark runners should mimic product path resolution if we want product-grade conclusions.
- Priority: P2.

## B017: Premature finish after coding or partial verification

- What it is: Models often edit or inspect correctly, then stop before the run/open/verify leg. The user has to keep prompting "continue" or "run it".
- Evidence: Gemini project1 wrote/inspected part of the calculator task but did not complete `script.js`; Gemini project7 and project9 spent turns on reads or unrelated shell checks and failed the final check; OpenRouter auto projects 3, 7, 9, 10, and 12 asked for information instead of using available tools.
- Source: The agent loop relies on the model to decide every continuation. Atlas does not have a deterministic post-edit continuation policy such as "after web app edits, start/reuse preview" or "after verification failure, continue unless user stopped".
- User impact: The interaction feels like repeated nagging: "do it", "continue", "run it", "open it".
- Priority: P1.

## B018: Preview/run path costs too many model round trips

- What it is: Opening a local app currently requires the model to choose several tools in sequence: list background processes, spawn or reuse a server, read logs to infer a port, then call `open_preview`.
- Evidence: Atlas tool descriptions require `bash_list` before servers, `bash_background` for long-running processes, `bash_logs` for output, and `open_preview` after the server is known. Benchmark project5 showed models either tried foreground `npm start`, refused to run, or produced todo churn around this sequence.
- Source: Tool surface granularity. The harness exposes primitives, not a fused "serve and preview this project" operation.
- User impact: Compared with Terax-like flows, Atlas feels slow even when the model is capable, because preview requires multiple model decisions and approval/UI waits.
- Priority: P1.

## B019: Step count is not the same as useful work

- What it is: Atlas permits up to `MAX_AGENT_STEPS = 24`, but a step can be a read, todo update, shell status check, or failed command. More steps can still feel slow and unproductive.
- Evidence: API runs produced valid tool calls but failed simple tasks after several non-mutating turns. The product loop labels steps, but it does not classify wasted work for continuation decisions.
- Source: Current loop uses `stepCountIs(MAX_AGENT_STEPS)` as the hard stop and leaves action selection to the model.
- User impact: The user sees activity without progress, then an early-feeling stop.
- Priority: P2.

## Fix Slice F001: API-first loop and preview fixes

- Product changes: added `serve_preview` to the Atlas shell toolbelt, updated API-model prompt guidance to prefer it for run/open/preview requests, labeled the status step as "Serving ...", and kept the existing `bash_run` foreground-server refusal.
- Product changes: bounded `todo_write` to 2-8 high-signal items, ignored single-item todo lists, normalized duplicate todo writes as unchanged, and updated the prompt guidance to avoid todos for one-file fixes and run/open/preview requests.
- Benchmark changes: added `serve_preview`, `BENCH_MAX_TOKENS`, provider error logging, Groq provider support, and OpenAI provider support to `scripts/local-agent-bug-bench.mjs`.
- Verification receipts: TypeScript `./node_modules/.bin/tsc --noEmit` returned `0`; focused Vitest for shell/todo/ablation returned `0` with `8/8` tests; `node --check scripts/local-agent-bug-bench.mjs` returned `0`.
- Remaining blockers: OpenRouter credit exhaustion prevented a complete post-fix Gemini rerun; Groq failed provider-side tool validation; OpenAI key is quota-exhausted.

## Fix Slice F002: Provider error UX

- Product changes: added `formatAgentError` and wired chat run failures through it before updating `agentMeta.error`.
- Product changes: normalized common paid-provider failures into actionable UI strings: OpenRouter credits exhausted, OpenAI quota exhausted, rate limits, rejected API keys, unavailable models, context/output limit failures, unreachable local endpoints, and provider-side `tool_use_failed`.
- User impact: API testing failures should now tell the user whether to add credits, switch model/provider, wait, or fix a key instead of showing a raw provider blob.
- Verification receipts: focused Vitest for provider errors plus shell/todo/ablation returned `0` with `12/12` tests; TypeScript `./node_modules/.bin/tsc --noEmit` returned `0`; full frontend Vitest returned `0` with `252/252` tests across `52` files; Vite build returned `0`; `node --check scripts/local-agent-bug-bench.mjs` returned `0`; `git diff --check` returned `0`.
- Remaining blocker: full `bash scripts/verify-atlas.sh --all` still cannot pass in the clean Windows shell because `pnpm` is unavailable on PATH. The script printed `RC=127` at `pnpm exec tsc --noEmit` and exited `1`.

## Fix Slice F003: Benchmark key safety and API model baseline

- Product changes: added central redaction coverage for OpenRouter, Groq, and Gemini-style keys; blocked whole-environment dump commands in `bash_run`; redacted shell stdout/stderr and background logs before returning tool results.
- Product changes: added a loop-efficiency prompt supplement for both full and lite prompts: no intent-only final messages, batch independent reads, avoid unrelated git commands, and never dump the environment.
- Benchmark changes: `.env` is ignored; the benchmark runner loads local `.env` keys without printing values, rotates key env names per provider, redacts shell results and provider errors, refuses env-dump commands, records token/latency totals, uses collision-proof run IDs, fixes absolute path resolution, normalizes Python commands through `BENCH_PYTHON`, and clarifies the hidden-check todo task.
- API baseline: OpenRouter `openai/gpt-4.1-mini` run `local-agent-bug-bench-2026-06-04T18-43-16-282Z-26924-jl5p25` returned `RC=0`, passed `12/12`, used real tool calls on `12/12`, raw JSON on `0/12`, total tokens `43512`, and duration `120.6s`.
- API comparison: OpenRouter `google/gemini-3.5-flash` run `local-agent-bug-bench-2026-06-04T18-36-39-541Z-8136-r7h1k0` returned `RC=0`, passed `9/12`, used real tool calls on `12/12`, raw JSON on `0/12`, total tokens `67626`, and duration `160.1s`; failures were reasoning/intent-stop or benchmark ambiguity.
- Groq comparison: Groq `llama-3.3-70b-versatile` run `local-agent-bug-bench-2026-06-04T18-47-13-279Z-25644-9xvicf` returned `RC=0`, passed `4/12`, with many provider-side `tool_use_failed` errors before Atlas received tool calls.
- Local comparison: Ollama `qwen2.5-coder:7b` strict run `local-agent-bug-bench-2026-06-04T18-45-30-960Z-30908-q20nxb` returned `RC=0`, passed `1/12`, emitted raw JSON content on `12/12`, and emitted strict OpenAI tool calls on `0/12`. Raw-JSON compatibility run `local-agent-bug-bench-2026-06-04T18-45-57-619Z-29584-z67xzv` returned `RC=0`, passed `6/12`, proving a local shim may help but is not enough for parity.
- Current default recommendation: use OpenRouter `openai/gpt-4.1-mini` for API benchmark/default harness validation; keep Gemini as compatible but reasoning-heavy; do not use Groq llama or Ollama qwen as default tool-call baselines.
- Verification receipts: clean-shell focused Vitest for shell/errors/todo/ablation returned `0` with `15/15` tests; clean-shell TypeScript returned `0`; clean-shell full frontend Vitest returned `0` with `255/255` tests across `52` files; clean-shell Vite build returned `0`; clean-shell `node --check scripts/local-agent-bug-bench.mjs` returned `0`; clean-shell `git diff --check` returned `0`.
- Superseded blocker: full `bash scripts/verify-atlas.sh --all` previously failed in the strict clean shell because `pnpm` was unavailable on PATH. After the host PATH was fixed, the gate reached product checks.

## Fix Slice F004: Windows verification floor recovery

- Product/test changes: `authorize_spawn_cwd_blocks_symlink_escape` now skips only the Windows symlink fixture when the host denies symlink privilege with OS error `1314`, while preserving the symlink-escape assertion whenever the fixture can be created.
- Product/test changes: `scripts/release-preflight.mjs` normalizes `pnpm-lock.yaml` line endings before matching the signed-release dependency contract, so Windows CRLF does not fail a semantic check.
- Host guidance: do not create environment variables for individual executables like `bash.exe` or `git.exe`; add their directories to `PATH`. For the Atlas gate on Windows, the stable form is `& "C:\Program Files\Git\bin\bash.exe" --noprofile --norc -lc "cd /c/Users/name/Downloads/Atlas-ai && bash scripts/verify-atlas.sh --all"`.
- Focused receipts: explicit Git Bash `node scripts/release-preflight.mjs` returned `0` with `"status": "passed"`; explicit Git Bash `cargo test --locked --manifest-path src-tauri/Cargo.toml authorize_spawn_cwd_blocks_symlink_escape` returned `0` with the targeted test passing.
- Full gate receipt: explicit Git Bash `bash scripts/verify-atlas.sh --all` returned exit code `0` and printed `verify-atlas --all: OK`; frontend Vitest reported `255/255` tests across `52` files; Rust reported `157 passed`, `0 failed`, `3 ignored`, plus harness `3 passed`; launchability audit remained advisory-blocked on external environment items only: Docker daemon, `SWE_BENCH_ROOT`, Harbor CLI, and updater endpoint publication.
