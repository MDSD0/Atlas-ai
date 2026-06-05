
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
