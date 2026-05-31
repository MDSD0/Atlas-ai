# Live Canvas

## Current understanding

Atlas already has a partial workspace-first foundation:

- `workspaceRoot` is stored in `useWorkspaceStore`.
- Explorer root comes from `workspaceRoot`.
- `activeFolder` exists in `App.tsx` and is used for new terminal default cwd through `useWorkspaceCwd`.
- Terminal cwd updates are terminal-local in `useTabs` and `useTerminalSession`.

The breakage is in the AI path and shell context:

- `ToolContext.getCwd()` is treated as active terminal cwd.
- `resolvePath(rawPath, cwd)` resolves bare paths against that cwd.
- File, edit, and explicit search roots call that resolver.
- `bash_run` and `bash_background` default to `ctx.getCwd()`.
- The system prompt and injected context tell the model that terminal cwd is ground truth.

## Desired invariant for this slice

- Project/session binding is based on `workspaceRoot`, not terminal cwd.
- A session stores its project binding and switching sessions restores that binding.
- File tools resolve relative paths against active file parent, then active folder, then workspace root.
- Shell tools use `executionCwd`, which defaults to active folder or workspace root.
- Active terminal cwd is informational unless the user explicitly selects or requests terminal-cwd execution.

## Decisions

- Use `workspaceRoot` as the initial `projectId` value for this slice. It is stable enough for current local projects and avoids introducing a database or repo graph.
- Add `projectName` as basename of `workspaceRoot`, with `No project` for unbound mode.
- Keep terminal tab cwd persistence as-is. Terminal cwd must keep updating terminal UI, but it must not feed file path resolution.
- Add a frontend-only project context type in AI tool context first. Rust commands already receive absolute paths from tools and already authorize agent shell cwd.
- Keep Rust workspace authorization changes minimal unless frontend path policy exposes a backend gap.
- Keep no-project mode explicit: file tools that need a base path should error clearly unless an absolute safe path is supplied and approved by existing security.

## Assumptions

- This turn should not implement repo graph, LSP, memory beyond existing `ATLAS.md`, MCP, skills, or proof panels.
- Existing provider/model settings and approval cards should remain unchanged except for cwd labels.
- `workspaceRoot` paths are canonical enough for UI display and path prefix checks after frontend normalization.
- WSL project roots are still represented as frontend strings and passed through the existing workspace env IPC path.

## Risks

- Existing malformed duplicate lines may cause typecheck failures unrelated to this change. I will avoid broad cleanup, but may need to fix syntax in touched files if it blocks verification.
- Session restore currently does not load the persisted `activeId` from storage. Changing that behavior could affect startup UX, so this slice will focus on binding metadata and switch behavior.
- Mutating tools need out-of-workspace rejection. Frontend canonicalization can guard normal local paths, but missing new files cannot be canonicalized directly. The resolver must canonicalize existing parent directories for new paths.
- Persistent shell sessions currently keep cwd across tool calls. Switching execution mode or project must key shell sessions by session plus project plus execution cwd mode to avoid stale cwd.

## Final status

Implemented.

- File, edit, search, and shell tools now use a centralized Atlas project context.
- Bare file paths resolve against active file parent, then active folder, then workspace root.
- Active terminal cwd is informational for file tools and only affects shell cwd when the execution mode is `activeTerminal`.
- Shell execution uses `executionCwd` and persistent shells are keyed by session plus execution cwd.
- Sessions now carry `projectId`, `projectName`, and `workspaceRoot`; switching sessions restores the bound workspace.
- Composer shows project selector, workspace root, execution cwd, execution mode, and secondary terminal cwd.
- Prompt injection now uses `<atlas_context>` with the required path policy shape.
- Mutating file tools refuse to run when no project is bound and reject paths outside the workspace root.

Verification completed:

- `pnpm test src/modules/ai/tools/context.test.ts src/modules/ai/lib/sessions.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm test`
- `cd src-tauri && cargo test --locked`
- `cd src-tauri && cargo clippy --all-targets --locked -- -D warnings`
- `pnpm tauri dev`

Note: clippy initially failed due a stale generated Tauri permission path under `/Users/home/Downloads/terax-ai-main`. Running `cargo clean` regenerated the build artifacts and clippy then passed. `pnpm tauri dev` launched successfully and logged a non-blocking updater endpoint error.

## Follow-up status: session UI and panel docking

Implemented the UX correction requested after screenshots:

- "No project" is now presented as `Unbound`, making it clear this is an explicit no-workspace chat mode rather than a hidden project.
- Opening a folder from the welcome screen creates a fresh project-bound chat instead of mutating an older unbound chat.
- Switching sessions restores the session workspace through the live app bridge. If that would cross projects, terminal panes are reset to the session workspace root so the visible directory and agent binding stay aligned.
- Dirty editor tabs block cross-project session switching with a warning.
- The mini agent header now exposes a Codex-style project/session dropdown at the top right.
- The first docked implementation was too close to a giant edge-pinned overlay. It has been corrected to a VS Code Copilot-style right sidebar inside the main resizable layout.
- Floating mode remains the compact floating mini panel.
- Right-docked mode now uses a normal app panel that gives the workspace usable remaining width and stores its own width separately from the left directory panel.

## Follow-up status: home and composer cleanup

Implemented after the home screenshot:

- Removed workspace root, execution cwd, and terminal cwd details from the composer input card. That information is app chrome, not text-box content.
- Added a top-right sessions dropdown to the home/welcome surface.
- Changed session hydration so app boot starts in an unbound home chat instead of restoring the last project-bound session as the current workspace.
- Changed workspace environment switching so `$HOME` is not promoted to `workspaceRoot`.
- Opening a recent workspace or folder still creates a new project-bound chat explicitly.

## Follow-up status: history affordance and scroll memory

Implemented after main-page session feedback:

- Replaced the full home-page session label with an icon-only history button.
- The history button hover/title shows project display name plus session name, not the full workspace path.
- The home chat and mini agent chat now use separate remembered scroll positions keyed by surface and session.
- The shared conversation wrapper no longer forces smooth scroll-to-bottom on every mount/resize.

## Follow-up status: Agent tab authority

Implemented after the Agent home feedback:

- The welcome/home tab is now named `Agent`.
- The new-tab menu puts `Agent` first and shows the Cmd+I binding there.
- Cmd+I now toggles the Agent tab instead of using the mini overlay route.
- Project/session restore no longer creates or focuses a terminal. It updates project binding and resets the visible surface to Agent.
- Workspace environment switches no longer create a default terminal at `$HOME`.

## Pre-plan learning status: opensrc-first hook

The active repo now has a durable source-parity rule:

- `ATLAS.md` requires relevant opensrc inspection before non-trivial subsystem edits.
- `docs/opensrc-references.tsv` maps Atlas topics to the upstream repositories recommended by the final backend analysis.
- `scripts/consult-opensrc.sh` resolves the relevant cached source paths without forcing a blind read of every upstream.
- The manifest currently resolves 50 upstream source trees. If GitHub rate-limits refresh traffic, the script labels the fallback and uses the existing local opensrc cache.

Interpretation rule:

- `plans/ATLAS_PLAN.md` is legacy evidence from the archived Python/FastAPI backend.
- The final sections of `Backend analysis and feedback.md` provide the current product direction.
- Active implementation decisions must be reconciled against the React/Tauri codebase and current upstream source before a new slice is planned.

## Canonical execution plan

Added `ATLAS_EXECUTION_PLAN.md` as the evidence-backed implementation roadmap.

The roadmap is built around the active React/Tauri substrate and requires:

- A source-parity packet before every non-trivial slice.
- Explicit `COPY`, `ADAPT`, `WRAP`, `BENCHMARK`, `STUDY`, or `REJECT` disposition for each consulted upstream.
- Fixture-backed unit, native integration, frontend integration, desktop, scripted-agent, and cross-platform test layers.
- A trusted-editing milestone before CodeReality, LSP, memory-provider, skill, or MCP expansion.
- Primary-documentation and focused opensrc refresh when a slice begins.

Immediate risk queue:

- Restore reproducible clippy and Vitest baseline.
- Gate raw native filesystem IPC through workspace authorization.
- Stop swallowing frontend workspace authorization failures.
- Fix case-sensitive frontend path containment.
- Replace cache-presence edit checks with real stale-content fingerprints.
- Serialize same-file mutations using a Pi-informed realpath queue.

## Follow-up status: authenticated opensrc refresh

Updated `scripts/consult-opensrc.sh` to use the existing GitHub CLI login automatically:

- Prefer an explicit `GITHUB_TOKEN`.
- Accept `GH_TOKEN` as a bridge.
- Otherwise read the active `gh` keyring token at runtime, including common Homebrew paths when the desktop app shell has a minimal `PATH`.
- Pass the token only to the `opensrc` subprocess without printing or persisting it.
- Refresh upstreams in bounded batches so a complete manifest pass stays controlled and a failed batch can use its local cache paths.

## Slice 0.2 status: verification floor (M0)

Baseline restored and gated.

- `B1` root cause: active Node v16.20.2 vs pnpm's Node >= 22.13 requirement. Use Node 22.16. Codified by a Node-version guard in `scripts/verify-atlas.sh`.
- `B0` clippy: already clean in current source (earlier failure was stale artifacts).
- Added `scripts/verify-atlas.sh` (`--fast`/`--native`/`--all`; `--desktop`/`--eval` are explicit stubs).
- Green: tsc 0, vitest 91 passed, build 0, cargo clippy 0, cargo test 53 passed.

Source-parity hook now also enforced at the harness level: `.claude/settings.json` PreToolUse runs `scripts/opensrc-hook.sh` on Edit/Write/MultiEdit, printing the relevant upstreams for files under `src-tauri/src/modules/**` and `src/modules/**`.

Memory decision locked: `LocalRecordsProvider` default (always on, no dependency), SimpleMem `WRAP` optional advanced provider, Mem0 `BENCHMARK`. New invariant: boot never depends on memory-provider health.

Next: Slice 0.3 fixture harness, then Phase 1 trust boundary (S0 native fs authorization first).

## Slice 0.3 status: fixture harness (M0)

Done.

- `tests/fixtures/`: `simple-ts`, `stale-edit`, `ignore-heavy` ready; five others deferred to the slice that needs them (`tests/fixtures/README.md`).
- `src-tauri/tests/common/mod.rs` + `harness.rs`: `copy_fixture()` over `tempfile::TempDir`; 3 integration tests (idempotence, drop cleanup, parallel isolation).
- `vite.config.ts`: `test.include` scoped to `src/**` so fixture tests stay out of Atlas's suite.

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 91, build 0, clippy 0, cargo test 104.

M0 done except Slice 0.4 CI matrix (deferred to first push). Next: Phase 1 S0 native filesystem authorization.

## Slice 1.1 status: native filesystem authorization (S0)

Done.

- Two helpers in `workspace.rs`: `authorize_existing_path` (Mode A, follow symlinks, target authorized) and `authorize_path_target` (Mode B, canonicalize parent only, preserve symlink delete/rename, support nested create).
- All 7 fs commands gated (`fs_read_file`, `fs_write_file`, `fs_stat`, `fs_canonicalize`, `fs_read_dir`, `list_subdirs`, `fs_search`, `fs_list_files`, `fs_grep`, `fs_glob`) via `_inner` + thin `State`-injecting shell. `fs_watch` was already gated.
- Frontend unchanged (Tauri injects `State`). App-level boundary = registry (home + launch + authorized workspaces); narrower agent policy stays in `context.ts` (Slices 1.2/1.3).

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 91, build 0, clippy 0, cargo test 106 lib + 3 harness = 109; 5 new auth tests pass, symlink-delete preservation intact. grep.rs (`fs_grep`/`fs_glob`) gated too.

Risk: GUI explorer/editor smoke not run here (needs display; phantom dev shell unreliable). Recommended user test: `pnpm tauri dev`, open a folder, confirm explorer lists + file opens + edit saves.

Next: Slice 1.2 fail-closed workspace binding (S1).
