
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
