
## Qualification harness correction - real Atlas vs shim boundary (2026-06-08)

Problem: previous benchmark evidence mixed production agent-loop code with a Node Tauri-invoke shim, then risked being read as proof that the real Atlas desktop UI/session/native boundary worked. That was not honest enough for paid model testing.

Applied:

- Added `scripts/atlas-qualification.mjs` and `pnpm qualify:atlas`.
- The runner creates `runs/atlas-qualification/<run-id>/summary.json`, `report.md`, and per-phase stdout/stderr logs.
- Every phase records whether it is `realAtlasUi`, `headlessShim`, and/or `paid`.
- Paid model generation is skipped unless `--allow-paid` is passed.
- Added stable UI selectors for future WebDriver tests: `atlas-ai-input`, `atlas-project-chip`, `atlas-sessions-panel`, `atlas-receipt-strip`.
- Fixed the source-parity hook line-ending failure by normalizing `scripts/consult-opensrc.sh` to LF.
- The runner now prefers Git Bash on Windows for source-parity checks.

Latest evidence:

- `node scripts/atlas-qualification.mjs` RC=0.
- Report: `C:\Users\name\Downloads\Atlas-ai\runs\atlas-qualification\2026-06-08T18-25-16-775Z\report.md`
- Passed phases: source-parity hook RC=0, desktop static contract RC=0, TypeScript RC=0, focused Vitest RC=0, native git worktree tests RC=0.
- Real Atlas desktop UI phase: blocked, not faked. Missing `tauri-driver` and a platform WebDriver (`msedgedriver`/`chromedriver`/`geckodriver`).
- Paid SWE-bench smoke: skipped by design until real UI automation is installed.

Blunt conclusion: we currently have good headless agent-loop instrumentation, but we do not yet have product-level proof that the UI creates a project-bound session and drives the same native boundary a user sees. Next highest ROI is installing/adding Tauri WebDriver E2E and making that phase submit one cheap deterministic mock-model task before any paid LLM benchmark.

## Design note: smart plan replan (deferred, agent-loop)

User decision on comment-on-plan: do NOT blind-incorporate per-line comments
(users put comments anywhere / all in the header, so line attachment is
unreliable and would desync plan text from comments). Instead, smart replan:

- Collect all comments regardless of where they were placed.
- Preserve completed and in-progress plan items (never discard done work).
- Regenerate only the not-yet-started tail of the plan, with the comments as
  steering constraints, keeping stable item identity where possible.
- Show the user a plan-diff (kept items vs revised/new items) so the change is
  visible, not a silent regeneration.

Status: design only. Touches the agent loop + needs a textual-plan-with-comments
UI (todos are currently a flat list, no comment field). Build deliberately after
GUI verification; not part of the safe UI-polish batch.

## Benchmark-ready milestone (GPT review response)

Five-item pre-benchmark pass before the Windows local-model run:

1. Honest 5-tier proof verdict (verified/smoke_checked/completed/unverified/failed) — echo-ok no longer reads as verified; recognized test/build/typecheck/lint commands earn "verified". Soft, non-blocking.
2. Atlas Harness Eval trace (buildHarnessTrace) — per-run JSON: tool counts by name, edited files, checks, diagnostics, repo-map usage, duration. The instrument for "did the substrate help".
3. Ablation modes (buildTools mode: plain | repo_map | repo_map_lsp | full) — restrict the toolbelt so a benchmark can compare layers. Default full = unchanged product behavior.
4. README honesty — verified already clean (no universal/zero-halluc/SWE-ready overclaims; only disclaimers present). No change needed.
5. Ollama path — verified: OLLAMA_DEFAULT_BASE_URL=http://localhost:11434/v1 via createOpenAICompatible. qwen2.5-coder:7b benchmark path is sound.

Green (clean shell verify-atlas.sh --all): tsc 0, vitest 244 passed, build 0, cargo check/clippy 0, cargo test 144 + 3 harness.

Next (user): Windows + Ollama qwen2.5-coder:7b, run mini-SWE-agent baseline vs Atlas on the same 3-5 SWE-bench Lite tasks, compare harness traces.

## Windows benchmark/verification correction

After the local/API benchmark pass, the Windows verification floor was recovered.

- Host PATH now exposes Git Bash, pnpm, Cargo, Python, and git to explicit Git Bash runs. The stable command is `& "C:\Program Files\Git\bin\bash.exe" --noprofile --norc -lc "cd /c/Users/name/Downloads/Atlas-ai && bash scripts/verify-atlas.sh --all"`.
- The Rust symlink escape test still verifies the security invariant when symlinks can be created, but skips the fixture on Windows hosts that deny symlink privilege with OS error `1314`.
- Release preflight now normalizes lockfile line endings before matching the Tauri dependency contract, so CRLF does not create a false blocker.
- Final receipt: explicit Git Bash `bash scripts/verify-atlas.sh --all` exited `0` and printed `verify-atlas --all: OK`; frontend Vitest `255/255`, Rust `157 passed / 0 failed / 3 ignored`, harness `3 passed`.

Next: commit and push the benchmark safety, API-first loop, UX error normalization, and Windows verification-floor fixes.

## Calculator-flow UX correction

Observed user run: Atlas eventually opened `http://localhost:8000`, but the mini agent still showed stale todos (`3/4`) and a spinner. The model also called list with an empty path and hit `cannot resolve empty path`, then tried `file://` preview even though the in-app preview is restricted to localhost HTTP.

Applied:

- Normal finish completes the final dangling `in_progress` todo only when there are no pending todos, then the todo strip hides once all todos are complete.
- Empty paths resolve to the default project base, so list/read-style tool calls can mean "here".
- Prompt/tool guidance now distinguishes static HTML external open commands from localhost preview: use `cmd.exe /c start "" "index.html"` on Windows, `open` on macOS, or `xdg-open` on Linux when explicitly asked to use the OS opener.

Focused verification: explicit Git Bash TypeScript `0`; focused Vitest `30/30`.

## Static web lane policy correction

Observed failure class: calculator/static HTML tasks were being run through the
same full Atlas harness surface as repository patching. That packed memory
index, LocalRecords recall, SimpleMem loopback, active work packets, local
skills, repo/LSP/MCP tools, terminal tools, and todo tools before the model
acted. The result was slower turns, todo churn, and fragile run/open behavior.

Applied:

- Added a request-time lane policy before `streamText`.
- Static HTML/CSS/JS app prompts now select a `static_web_app` lane.
- Added `simple` tool mode for static flows: fs/edit/search/shell/preview and
  verification only, with no `todo_write`.
- Static web turns skip optional memory index, local memory recall, SimpleMem
  observer/context, active work packet, and local skill prompt packing.
- Full harness behavior remains the default for repo work, plan mode, and
  ambiguous prompts.
- Prompt-submit proof payload now records the selected lane and tool mode.

Verification receipts:

- Focused TypeScript `0`.
- Focused Vitest `9/9` for lane policy plus ablation.
- Full frontend Vitest `263/263`.
- Vite build `0`.
- Clean-shell `bash scripts/verify-atlas.sh --all` `RC=0`, printed
  `verify-atlas --all: OK`; Rust `157 passed / 0 failed / 3 ignored`, harness
  `3 passed`.

## Corrective slice: provider/API benchmark robustness and Reality/LSP recovery

Observed during real Atlas UI and headless API smokes:

- TypeScript LSP could remain visibly `broken` after a transient spawn failure,
  even after the language server or Windows command shim was fixed.
- CodeReality map/detail clicks passed repo-relative paths to editor tabs, so
  files could open as inaccessible breadcrumb paths on Windows.
- Exact edit misses returned only `old_string not found`, which let weaker
  models repeat the same stale replacement instead of rereading.
- The headless benchmark shim returned Windows backslash canonical paths, while
  the production native boundary returns forward-slash canonical paths; this
  caused false `outside workspace root` tool failures in benchmark traces.
- OpenRouter requests for tiny tasks were rejected because Atlas did not set an
  agent output-token ceiling, so providers inferred context-sized maxima
  (observed 65,536 requested output tokens).

Applied:

- LSP broken state is now a short retry cooldown, not a permanent provider
  poison. Status/diagnostic calls can recover without an app restart.
- Reality file opens now resolve repo-relative display paths against the
  workspace root before opening editor tabs.
- Edit misses return structured `old_string_not_found` plus recovery guidance:
  reread, copy exact current text, then issue one corrected edit.
- Progressive benchmark metrics now record tool errors, repeated identical tool
  failures, and sampled error text.
- Progressive benchmark supports `BENCH_PROVIDERS`, `BENCH_MAX_STEPS`, and
  `BENCH_MAX_OUTPUT_TOKENS`.
- Production agent stream now sets a conservative per-step output cap:
  8,192 tokens for frontier/default models and 4,096 for lite/local models.

Receipts:

- Focused frontend Vitest: `15 passed / 1 skipped`, `RC=0`.
- Rust LSP tests: `11 passed / 0 failed / 1 ignored`, `RC=0`.
- External benchmark preflight: SWE-bench adapter `RC=0`, but host blocked by
  missing Docker and unset `SWE_BENCH_ROOT`.
- Terminal-Bench preflight: Harbor adapter `RC=0`, but host blocked by missing
  Docker and missing Harbor CLI.
- Codebase-memory preflight: `RC=0`, external MCP binary not installed.
- Launchability audit: advisory blocked by missing Docker/SWE_BENCH_ROOT/Harbor
  and updater endpoint publication, with static adapters present.
- API smoke after output cap, OpenRouter `openai/gpt-4.1-mini`, 5 tasks:
  `5/5 pass`, `RC=0`, no tool errors, no repeated failures. Summary:
  T1 21.3s / 2 steps / 1 tool / in 5547 / out 38;
  T2 5.2s / 3 steps / 3 tools / in 4488 / out 42;
  T3 8.9s / 7 steps / 6 tools / in 4730 / out 33;
  T4 8.7s / 6 steps / 5 tools / in 4655 / out 43;
  T5 7.3s / 3 steps / 3 tools / in 4629 / out 49.

Next: install or provision host-level Docker/Harbor/SWE-bench checkout before
claiming official SWE-bench/Terminal-Bench execution; current repo adapters and
preflights are wired, but the host is not ready.

Follow-up during the same slice:

- Installed global `opensrc@0.7.2`; `opensrc --help` works.
- Fetched local opensrc checkouts for Harbor, SWE-bench, mini-swe-agent,
  opencode, MCP TS SDK, Claude/system prompt repos, harness engineering list,
  and Karpathy skills.
- Installed user-level Python packages `harbor`, `mini-swe-agent`, and
  `swebench` via `python -m pip install --user ...`.
- Python user scripts are in
  `C:\Users\name\AppData\Roaming\Python\Python314\Scripts`, which is not on
  PATH by default.
- Terminal-Bench preflight now detects installed Harbor when that scripts dir is
  on PATH; `RC=0`, Docker still unavailable.
- mini-swe-agent import/CLI is installed, but the interactive CLI cannot render
  in this non-console PowerShell capture (`NoConsoleScreenBufferError`).
- PyPI `swebench` installs, but importing the harness on Windows Python 3.14
  hits Unix-only `resource`; official Atlas sample path remains the opensrc
  checkout plus Docker host readiness.
- Full gate after the slice: `bash scripts/verify-atlas.sh --all` `RC=0`
  when run from a VS 2022 vcvars64 shell with
  `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` pinned to the MSVC linker.
  Frontend Vitest reported `306 passed / 3 skipped`; Rust check/clippy/tests
  and doc-tests completed. Plain Git Bash can pick up Git's Unix `link.exe`,
  which breaks Rust linking on Windows.

## Stop/cancellation resource correction

Observed failure class: Stop could abort the visible model stream while leaving
run-owned background resources alive. In the calculator flow this showed up as a
server continuing after the user tried to stop, plus todo UI that could remain
visibly stuck on an `in_progress` item.

Applied:

- Added a small per-run resource tracker keyed by the AI SDK `AbortSignal`.
- `serve_preview` and `bash_background` now register only newly spawned handles
  against the active run. Reused preview servers are not run-owned and survive
  cancellation.
- Transport abort handling now kills active run-owned background handles and
  pauses any `in_progress` todo back to `pending`.
- Composer and chat-store stop paths now share the same session-level stop
  behavior.
- Normal successful runs release resource tracking without killing preview
  servers, preserving the expected "run then inspect" workflow.

Focused verification:

- TypeScript `0`.
- Focused Vitest `14/14` for run resource cancellation, todo cancellation, and
  shell preview spawned-vs-reused behavior.
- Full frontend Vitest `270/270`.
- Vite build `0`.
- Clean-shell `bash scripts/verify-atlas.sh --all` `RC=0`, printed
  `verify-atlas --all: OK`; Rust `157 passed / 0 failed / 3 ignored`, harness
  `3 passed`.
## Corrective slice: worktree core plus real localization campaign

Done for the verifiable core, not the full UI feature.

- Added native git worktree primitives:
  `git_worktree_list`, `git_worktree_create`, `git_worktree_remove`, and
  `git_worktree_merge`.
- Worktrees are intentionally narrow: Atlas-created only, stored under
  `.atlas/worktrees/<name>`, with branches under `atlas/<name>`.
- Added frontend native wrappers for later UI integration.
- Added parser, safety guard, and real temp-repo create/list/remove tests.
- Added `REPO_INTEL=minimal`, a mini-swe-agent-like four-tool control arm:
  `bash_run`, `read_file`, `write_file`, and `edit`.
- Added `BENCH_INSTANCE_LIMIT` so paid smokes cannot accidentally run all
  instances.
- Added capability usage metrics: unlocked, used, promoted-unused.
- Fixed benchmark token accounting to accumulate per-step usage.
- Capped benchmark shim shell output after a real run showed a 7.8M-token
  baseline outlier from uncapped bash output.

Paid OpenRouter Gemini 2.5 Flash receipts:

- Key status before campaign: `is_free_tier=false`.
- One-instance smoke, `minimal`, max steps `8`, max output `200`: `RC=0`,
  `steps=6`, `tools=5`, no patch.
- One-instance smoke, `map`, max steps `8`, max output `400`: `RC=0`,
  `steps=5`, tools `repo_map/find_symbol/read_file`, `used=repo_intel`, no
  patch.
- Full 15-instance localization, max steps `28`, max output `1024`, all arms
  `RC=0`.

Localization table:

| arm | hitRate | recall | precision | non-empty | avg input | avg output | avg steps | step caps | stream JSON errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| map | 0.067 | 0.067 | 0.067 | 1/15 | 266,323 | 1,805 | 10.9 | 0 | 12 |
| off | 0.267 | 0.267 | 0.267 | 8/15 | 331,599 | 2,448 | 12.2 | 1 | 3 |
| minimal | 0.333 | 0.333 | 0.333 | 9/15 | 632,892 | 1,488 | 10.1 | 0 | 2 |

Verdict:

- Gate 1 result is `STRIP/RETHINK`, not GO. On this run, repo-intel underperformed
  grep-only and the minimal control on hard-localization large-repo tasks.
- The result is not "minimal is perfect": minimal had the best hit rate but the
  worst token behavior because bash output was uncapped in the headless shim.
- Do not run official Docker eval from this result. Fix benchmark output capping,
  inspect why map produced many empty patches, and rerun a smaller confirmation
  before spending more.
- OpenRouter key usage after campaign: `2.5897409`.

Verification receipts:

- TypeScript `RC=0`.
- Focused bench/shim/capability Vitest `RC=0`, `13 passed / 1 skipped`.
- Focused git operations tests `RC=0`, `5/5`.

Left intentionally:

- Native-app worktree UX: run agent in isolated worktree, review diff, merge on
  accept. This needs real desktop interaction evidence, not headless pretending.

## Corrective slice: truthful receipts and composer attachments

Done:

- Lifecycle journal rows no longer count as user-visible agent actions.
- Chat-only turns keep the last meaningful receipt instead of replacing it
  with `Unverified`.
- Successful read-only runs finish as completed.
- Verification recognizes actual test, lint, build, and type-check runners;
  printed words such as `echo test` do not qualify.
- Composer files can be selected, pasted, or dropped.
- Images and PDFs are bounded file parts; text/code files are bounded inline
  context. Duplicate, oversized, unsupported, and `.env` inputs are rejected
  with visible feedback.
- Sent image/PDF parts remain visible in conversation history.

Verification receipts:

- Focused Vitest: `32 passed`.
- Full Vitest: `408 passed / 4 paid suites intentionally skipped`.
- TypeScript: `RC=0`.

Not claimed:

- DOCX parsing is not present. It remains explicitly unsupported rather than
  being decoded as corrupt text.
- Live UI inspection was excluded by request.

## Corrective slice: concurrency, boundaries, and graph truth

Done:

- MCP no longer serializes unrelated servers behind one global call lock.
- Persistent shell output is bounded on success, timeout, and process-exit
  paths while retaining completion markers.
- Legacy full-access IPC cannot escape the bound project root. Product
  autonomy is workspace-scoped; arbitrary shell execution still requires an
  explicit approval except in the internal benchmark mode.
- Session persistence is byte-bounded and inactive streams flush completion.
- Code Reality omits ambiguous duplicate-symbol edges and synthetic self-links
  instead of presenting them as repository relationships.
- The agent can list, create, remove, and merge Atlas-managed Git worktrees
  through progressive disclosure. Mutating operations require approval.
- Unbound chats skip project-only persistence context without using prompt or
  active-editor heuristics.

Verification receipts:

- Full Vitest: `415 passed / 4 paid suites intentionally skipped`.
- Full Rust library tests: `199 passed / 0 failed / 3 intentional ignores`.
- TypeScript: `RC=0`.
- Live UI inspection remains excluded by request.

## Corrective slice: parallel workers, browser behavior, worktree handoff

Done:

- Subagents inherit cancellation and can run in bounded parallel batches.
- MCP tool discovery is real, server processes are project-cwd bound, Windows
  npm shims launch through `cmd.exe`, and browser-length calls have a realistic
  timeout.
- The pinned official Playwright MCP preset runs isolated and headless. A real
  Edge host test discovered tools, navigated to a local fixture, and verified
  the expected button in the accessibility snapshot.
- Worktrees now provide an isolated file-editing worker plus inspect, stage,
  unstage, commit, merge, and removal. Parent verification is explicit because
  the child does not receive an unsandboxed shell.
- `.atlas` artifacts are hidden through repository-local Git exclusion.
- Known text-only models reject binary attachments before submission.

Verification receipts:

- Full Vitest: `423 passed / 4 paid suites intentionally skipped`.
- Full Rust: `201 passed / 0 failed / 4 intentional ignores`.
- Official Playwright host smoke: `1 passed`.
- Production build, TypeScript, Rust formatting, and diff hygiene: passed.
