# Plan

## Slice

Workspace/session/agent binding only. No repo graph, LSP, memory system, MCP, skills, proof panels, or broad app rename.

## Files to touch

- `source_pack.md`: keep inspected files and final status current.
- `live_canvas.md`: keep assumptions, risks, and decisions current.
- `plan.md`: keep implementation and verification status current.
- `src/modules/ai/tools/context.ts`: introduce workspace-aware project context, execution cwd mode, path resolver, workspace boundary checks.
- `src/modules/ai/tools/fs.ts`: use centralized resolver for read/list/write/create directory and update tool descriptions.
- `src/modules/ai/tools/edit.ts`: use centralized resolver and workspace write guard.
- `src/modules/ai/tools/search.ts`: default root to workspace root and resolve explicit roots with workspace-aware resolver.
- `src/modules/ai/tools/shell.ts`: use `executionCwd`, record cwd separately, and only use active terminal cwd when selected.
- `src/modules/ai/tools/tools.ts`: update tool context docs.
- `src/modules/ai/lib/transport.ts`: replace `<env>` with required `<atlas_context>` shape.
- `src/modules/ai/config.ts`: replace terminal-first prompt wording with workspace-first path and shell policy.
- `src/modules/ai/lib/sessions.ts`: add `projectId`, `projectName`, `workspaceRoot`, and no-project compatibility helpers.
- `src/modules/ai/store/chatStore.ts`: bind sessions to project context, restore project binding on session switch, expose active project/session context to tools.
- `src/app/App.tsx`: derive project context, execution cwd, active file/folder/terminal fields, and pass them into the AI live bridge.
- `src/modules/ai/components/AiInputBar.tsx`: show active project, workspace root, execution cwd, secondary active terminal cwd, and execution cwd mode control.
- `src/modules/ai/components/SessionsPanel.tsx`: show project binding per session and restore workspace on selection.
- `src/modules/ai/components/AiToolApproval.tsx`: show execution cwd for shell approvals.
- Tests to add or update under `src/modules/ai/tools/*.test.ts` and `src/modules/ai/lib/*.test.ts` for resolver and session metadata behavior.

## Implementation steps

1. Add project context types and centralized workspace-aware resolver.
2. Wire resolver into fs, edit, search, shell, and diff approval path usage.
3. Add session metadata fields and bind new/restored sessions to project.
4. Update live context and prompt injection to `<atlas_context>`.
5. Update composer/session UI with project and execution cwd controls.
6. Add focused tests for resolver, shell execution cwd, write boundary rejection, and session project preservation.
7. Run targeted tests, then broader checks as time permits.

## Rollback

No Git repository is available in this workspace. Rollback is file-level: restore the files listed above from backup or reverse the applied patches.

## Verification target

- Relative path resolves to active file parent when active file exists.
- Relative path resolves to active folder when no active file exists.
- Relative path resolves to workspace root when no active folder exists.
- Relative path never resolves to active terminal cwd by default.
- Shell execution uses `executionCwd`.
- Out-of-workspace write is rejected or approval-gated.
- Restored session preserves `projectId` and `workspaceRoot`.
- `pnpm exec tsc --noEmit`.
- `pnpm test` for touched TypeScript tests.
- `cd src-tauri && cargo test --locked`.
- `cd src-tauri && cargo clippy --all-targets --locked -D warnings`.
- `pnpm tauri dev` smoke check if the codebase reaches a runnable state.

## Final status

Complete for this slice.

Touched files:

- `source_pack.md`
- `live_canvas.md`
- `plan.md`
- `src/modules/workspace/workspaceStore.ts`
- `src/modules/ai/tools/context.ts`
- `src/modules/ai/tools/context.test.ts`
- `src/modules/ai/tools/fs.ts`
- `src/modules/ai/tools/edit.ts`
- `src/modules/ai/tools/search.ts`
- `src/modules/ai/tools/shell.ts`
- `src/modules/ai/tools/tools.ts`
- `src/modules/ai/lib/transport.ts`
- `src/modules/ai/lib/sessions.ts`
- `src/modules/ai/lib/sessions.test.ts`
- `src/modules/ai/store/chatStore.ts`
- `src/modules/ai/config.ts`
- `src/modules/ai/components/AiInputBar.tsx`
- `src/modules/ai/components/AiToolApproval.tsx`
- `src/modules/ai/components/AgentRunBridge.tsx`
- `src/app/App.tsx`

Checks:

- Passed: `pnpm test src/modules/ai/tools/context.test.ts src/modules/ai/lib/sessions.test.ts`
- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test`
- Passed: `cd src-tauri && cargo test --locked`
- Passed after `cargo clean`: `cd src-tauri && cargo clippy --all-targets --locked -- -D warnings`
- Passed smoke launch: `pnpm tauri dev`

Manual observation:

- `pnpm tauri dev` reached the Vite server at `http://localhost:1420/` and launched `target/debug/atlas`.
- The dev app logged an updater endpoint error, which did not block launch.

## Follow-up status: screenshot UX fixes

Additional touched files:

- `src/modules/ai/components/AiMiniWindow.tsx`
- `src/modules/ai/components/SessionsPanel.tsx`
- `src/modules/ai/lib/miniWindowGeometry.ts`
- `src/modules/ai/lib/miniWindowGeometry.test.ts`
- `src/modules/ai/lib/useMiniWindowGeometry.ts`
- `src/modules/workspace/WelcomeScreen.tsx`

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test src/modules/ai/lib/miniWindowGeometry.test.ts src/modules/ai/lib/sessions.test.ts src/modules/ai/tools/context.test.ts`
- Passed: `pnpm test`

Smoke note:

- `pnpm tauri dev` could not start a second instance because port `1420` was already occupied by an existing Atlas dev server and `target/debug/atlas` process.
- Opening the Vite URL in a normal browser is not a valid smoke check for this app because Tauri window APIs are required and fail outside the Tauri webview.

## Follow-up correction: right sidebar dock

Additional touched files:

- `src/modules/ai/components/lazy.tsx`
- `src/modules/ai/index.ts`
- `src/app/App.tsx`

Correction:

- Replaced the edge-pinned dock behavior with an actual right-side resizable panel in the main workspace split.
- The floating mini panel remains floating and compact.
- The right-side agent panel uses its own stored width under `atlas.ai.rightPanel.width`.

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test`

## Follow-up correction: home unbound state and composer cleanup

Additional touched files:

- `src/modules/ai/components/AiInputBar.tsx`
- `src/modules/ai/store/chatStore.ts`
- `src/modules/workspace/WelcomeScreen.tsx`
- `src/app/App.tsx`

Correction:

- Removed project/workspace/execution cwd metadata from inside the composer card.
- Added sessions dropdown to the home page top-right corner.
- Stopped boot hydration from restoring the last active project into the visible workspace.
- Stopped workspace environment switches from setting `$HOME` as `workspaceRoot`.

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test src/modules/ai/lib/sessions.test.ts src/modules/ai/tools/context.test.ts`
- Passed: `pnpm test`

## Follow-up correction: history icon and scroll preservation

Additional touched files:

- `src/components/ai-elements/conversation.tsx`
- `src/modules/ai/components/AiChat.tsx`
- `src/modules/ai/components/AiMiniWindow.tsx`
- `src/modules/workspace/WelcomeScreen.tsx`

Correction:

- Home-page session control is icon-only and exposes project/session names without full paths.
- Home and mini chat scroll positions are remembered independently by session.
- Conversation resize no longer forces a full smooth scroll-to-bottom.

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test src/modules/ai/lib/sessions.test.ts src/modules/ai/tools/context.test.ts`
- Passed: `pnpm test`

## Follow-up correction: Agent tab authority

Additional touched files:

- `src/modules/tabs/lib/useTabs.ts`
- `src/modules/tabs/TabBar.tsx`
- `src/modules/shortcuts/shortcuts.ts`
- `src/app/App.tsx`

Correction:

- Renamed the home/welcome tab to `Agent`.
- Moved `Agent` to the top of the new-tab menu and displayed Cmd+I there.
- Changed Cmd+I to toggle the Agent tab.
- Removed terminal creation from project/session restore and workspace environment switch.

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test src/modules/ai/lib/sessions.test.ts src/modules/ai/tools/context.test.ts`
- Passed: `pnpm test`

## Follow-up correction: history dropdown blinking

Correction:

- Removed hover open/close timers from the Agent home history dropdown.
- The history dropdown now opens by click/focus and closes through Radix menu state or session selection, avoiding portal-boundary flicker.

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test src/modules/ai/lib/sessions.test.ts src/modules/ai/tools/context.test.ts`

## Follow-up correction: terminal Ask Atlas and Agent path bar

Additional touched files:

- `src/modules/statusbar/StatusBar.tsx`
- `src/modules/statusbar/CwdBreadcrumb.tsx`
- `src/app/App.tsx`

Correction:

- Cmd+L Ask Atlas from terminal/editor selection now opens the agent mini surface when the Agent tab is not active.
- Terminal status path remains terminal-local and sends `cd` to the active terminal.
- Agent status path now shows the project or active folder instead of `no directory`.
- Agent status path changes are constrained to folders inside the current workspace and update `activeFolder` plus explorer reveal.

Checks:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm test src/modules/ai/lib/sessions.test.ts src/modules/ai/tools/context.test.ts`
- Passed: `pnpm test`

## Pre-plan learning phase

No feature slice is active yet.

Completed setup:

- Read the final architecture record and legacy Atlas queue as learning material.
- Added `docs/opensrc-references.tsv` with the recommended upstream source inventory.
- Added `scripts/consult-opensrc.sh` to resolve topic-relevant upstreams through opensrc.
- Added the mandatory source-parity hook to `ATLAS.md`.

Before the next implementation plan:

1. Run `bash scripts/consult-opensrc.sh <topic>` for the candidate slice.
2. Inspect the active Atlas path and the returned reference paths.
3. Update `source_pack.md` with exact files and copy/adapt/reject decisions.
4. Write the smallest vertical slice and its acceptance checks here.

## Canonical evidence-backed execution roadmap

The post-learning implementation overview now lives in `ATLAS_EXECUTION_PLAN.md`.

It replaces the executable meaning of `plans/ATLAS_PLAN.md`, which remains useful only as historical evidence from the archived Python/FastAPI and Svelte direction.

The first active queue is intentionally narrow:

1. Freeze refreshed source evidence and exact commits.
2. Restore a reproducible verification baseline and add the fixture harness.
3. Enforce native filesystem authorization.
4. Make workspace binding fail closed.
5. Fix platform-aware path containment.
6. Reject stale edits and serialize same-file mutations.
7. Ship one visible read-edit-run-proof vertical slice before CodeReality, LSP, memory-provider, skills, or MCP expansion.

## Slice 0.2 status: verification floor

Plan followed: `ATLAS_EXECUTION_PLAN.md` Slice 0.2.

Done:

- `B0` (clippy): fixed. On macOS the only `builder =` reassignment (`lib.rs:64`) is gated `#[cfg(not(target_os = "macos"))]` and the macOS branch shadows with `let builder = builder...`, so `mut` on `lib.rs:49` is unused on macOS. Fix: `#[allow(unused_mut)]` on that `let` (keeps `mut` for the non-macOS reassignment, no runtime change). `cargo clippy --all-targets --locked -- -D warnings` now returns 0 errors.
- `B1` (vitest blocked): root cause was active Node v16.20.2 while pnpm requires Node >= 22.13. Resolved by using Node 22.16. Documented with a fail-fast Node-version guard in `scripts/verify-atlas.sh`.
- Added `scripts/verify-atlas.sh` with `--fast`, `--native`, `--all` working and `--desktop`/`--eval` as explicit not-implemented stubs.

Baseline (Node 22.16, definitive clean-shell run, `verify-atlas.sh --all` exit 0):

- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm test`: 91 passed (8 files).
- `pnpm build`: exit 0 (3142 modules).
- `cargo check/clippy/test --locked`: exit 0; 101 Rust tests pass.

Not done in this slice: Slice 0.3 fixture harness, Slice 0.4 CI matrix.

Environment note: the dev shell profile injects phantom text into command stdout, which produced false pass/fail readings mid-slice. Reliable runs use `env -i HOME=$HOME PATH=<node>:<cargo>:/usr/bin:/bin /bin/bash --noprofile --norc`. The `--all` receipt above came from that clean shell.

## Slice 0.3 status: fixture harness

Plan followed: `ATLAS_EXECUTION_PLAN.md` Slice 0.3.

Done:

- Added `tests/fixtures/` with three ready fixtures: `simple-ts`, `stale-edit`, `ignore-heavy` (the last has `.gitignore`, generated `dist/`, `node_modules/`, and a binary `assets/data.bin`). Five other fixtures from section 7.2 are deferred and listed in `tests/fixtures/README.md`; each is built with the slice that first needs its exact shape.
- Added `src-tauri/tests/common/mod.rs`: `copy_fixture()` (pristine copy into a temp dir) and re-exported `tempfile::TempDir`. Used the existing `tempfile` dependency instead of a hand-rolled temp dir.
- Added `src-tauri/tests/harness.rs`: 3 integration tests proving copy idempotence, temp cleanup on drop, and no shared state between parallel copies.
- Added `test.include = ["src/**/*.{test,spec}.{ts,tsx}"]` to `vite.config.ts` so future intentionally-failing fixture tests (e.g. `proof-failure`) never enter Atlas's own vitest run.

Verified (clean shell, `verify-atlas.sh --all` exit 0): tsc 0, vitest 91 passed (8 files), build 0, cargo clippy 0, cargo test 104 passed (101 + 3 new harness).

M0 complete except Slice 0.4 (CI matrix), which needs the GitHub Actions runner and is deferred until first push.

## Slice 1.1 status: native filesystem authorization

Done. Native filesystem IPC is gated through the workspace registry. Existing-path operations canonicalize the target; mutation operations canonicalize the deepest existing parent so delete and rename do not follow a final-component symlink.

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 91 passed, build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

## Slice 1.2 status: fail-closed workspace binding

Done.

- Frontend workspace binding now mutates state only after native authorization succeeds.
- Failed folder opens and session restores preserve the existing project and recents while surfacing a readable error.
- WSL keeps the selected logical workspace path after authorization; Rust's canonical host path is an authorization result, not the frontend shell path.
- Added store tests for authorization ordering and rejection preservation.

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 93 passed (9 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Next: Slice 1.3 platform-aware path containment.

## Slice 1.3 status: platform-correct path containment

Done.

- Frontend project containment no longer lowercases every canonical path.
- Native canonical display paths compare case-exactly; raw Windows drive and UNC input normalize separators only while locating an existing ancestor for new targets.
- Unix filenames containing backslashes cannot be mistaken for descendants.
- Added eight regressions for case-sensitive siblings, macOS canonical behavior, drive paths, UNC paths, missing descendants, and traversal.

Green (clean shell final `verify-atlas.sh --all`): tsc 0, vitest 101 passed (9 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Next: Slice 1.4 real stale-edit fingerprint rejection.

## Slice 1.4 status: real stale-edit fingerprint rejection

Done.

- Added shared UTF-8 fingerprints for agent read caches.
- Direct edits reject stale prior reads with `code: "stale_read"` before writing.
- Delayed Plan Mode writes carry and revalidate the reviewed source fingerprint.
- Added five regressions for changed, unchanged non-ASCII, binary, queued stale, and queued fresh paths.

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 106 passed (11 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Next: Slice 1.5 serialize same-file mutations.

## Feature slice: shared project/session binding flow

User-requested UX slice (open/add project from composer + sidebar + welcome, one shared flow). Not a numbered plan slice; supports M1 trusted-editing usability.

Files added:

- `src/modules/workspace/projectFlow.ts`: shared `openProjectFromDialog`, `openProjectFromPath`, `startUnboundSession`, `switchToProject`, `listKnownProjects`.
- `src/modules/ai/components/ProjectChip.tsx`: composer project chip.

Files changed:

- `src/modules/ai/components/AiInputBar.tsx`: mount `ProjectChip` left of the model pill.
- `src/modules/explorer/FileExplorer.tsx`: header "Open project" icon; no-folder + broken-workspace states route through the shared flow; broken state offers Locate folder / Open unbound copy / Remove.
- `src/modules/workspace/WelcomeScreen.tsx`: open-folder/open-recent route through the shared flow.
- `src/modules/workspace/index.ts`: export the shared flow + `workspaceBindingErrorMessage`.
- `src/modules/ai/tools/context.ts`: add `checkMutationAllowed` + `UNBOUND_MUTATION_ERROR`.
- `src/modules/ai/tools/fs.ts`, `edit.ts`: use `checkMutationAllowed` in `write_file`, `create_directory`, `edit`, `multi_edit`.
- `src/modules/ai/tools/context.test.ts`: 2 tests for unbound mutation guard.

Behavior: selecting/adding a folder creates or switches to a project-bound session; unbound creates an unbound chat session without model-driven filesystem access; switching sessions restores the bound workspace; missing-path degraded state has Locate/Open-unbound/Remove. Branch chip + dirty-state path untouched. Vague progress/grid icons not repurposed.

Verified (clean shell): `pnpm exec tsc --noEmit` 0, `pnpm test` 112 passed (12 files; +2 unbound-guard), `verify-atlas.sh --fast` OK. GUI flows are user-verify (listed in live_canvas.md).

## Feature slice: approval modes + auto-run safe shell

User-requested. Reduce prompt fatigue for low-risk actions via Claude-Code-style modes + a read-only allow-list, without weakening the deny layer.

Files added:

- `src/modules/ai/lib/permissions.ts`: pure classifier (ApprovalMode, isAutoRunShell, editNeedsApproval, shellNeedsApproval).
- `src/modules/ai/lib/permissions.test.ts`: 7 tests.
- `src/modules/ai/components/AccessChip.tsx`: composer Ask/Accept-edits/Full-access control.

Files changed:

- `src/modules/ai/store/chatStore.ts`: active-session `approvalMode` (default), reset on new/switch session, exposed via ToolContext.getApprovalMode.
- `src/modules/ai/tools/context.ts`: ToolContext.getApprovalMode.
- `src/modules/ai/tools/fs.ts`, `edit.ts`: edit/create needsApproval = editNeedsApproval(mode).
- `src/modules/ai/tools/shell.ts`: bash needsApproval = shellNeedsApproval(command, mode).
- `src/modules/ai/components/AiInputBar.tsx`: mount AccessChip.

Invariant preserved (plan 5.1): modes suppress prompts only; checkShellCommand circuit breaker, secret deny-list, and native S0 boundary still apply in every mode incl. full access. Model tool choice never overridden.

Decisions: default = Ask; access mode resets on new/switch.

Verified (clean shell): tsc 0, pnpm test 119 passed (13 files; +7), verify-atlas.sh --fast OK.

## Slice 1.5 status: serialize same-file mutations

Done.

- Added `src/modules/ai/tools/fileMutationQueue.ts`: native-canonical-path-keyed promise queue with a resolved-path fallback for new files.
- Wrapped direct edits, direct full-file writes, and delayed Plan Mode writes.
- Different files remain parallel; alias paths serialize; rejection releases the next waiter.
- Added four queue regressions.
- Hardened the approval-mode auto-run classifier after opensrc refresh: broad read-looking shell commands now prompt unless their complete argument shape is bounded.

Green (clean shell final combined `verify-atlas.sh --all`): tsc 0, vitest 121 passed (13 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Next: Slice 1.6 native secret-path deny-list.

## Slice 1.6 status: native agent project and secret-path boundary

Done.

- Added `agent_fs_*` native wrappers and a separate explicit agent-project root registry.
- Added a Rust sensitive-path policy after canonicalization while leaving manual editor/explorer IO available.
- Switched built-in model reads, searches, mutations, delayed Plan Mode writes, and project-memory reads to `agentNative`.
- Unbound chat sessions reject all model-driven filesystem access.
- Added regressions for app-vs-agent authorization, `.env`, protected parents, symlink-to-secret paths, filtered recursive search, and unbound reads.

Green (clean shell final `verify-atlas.sh --all`): tsc 0, vitest 123 passed (13 files), build 0 across 3148 modules, cargo check/clippy 0, cargo test 115 lib + 3 harness = 118.

Next: Phase 2 Slice 2.1 minimal event journal and proof receipt foundation.

## Slice 2.1 status: durable proof-journal contracts

Done.

- Added bounded provider-independent run, event, artifact, and verdict contracts.
- Added a serialized proof repository with ordered events, stable artifact IDs, SHA-256 content hashes, restart restore, explicit durable saves, final verdicts, and bounded retention.
- Reused the existing Tauri Store backend behind a thin adapter. Added no database, Rust persistence module, dependency, watcher, or boot service.
- Added six regressions for ordered append, UTF-8 truncation, restore, cancellation, artifact identity, and retention caps.

Green (clean shell final `verify-atlas.sh --all`): tsc 0, vitest 129 passed (14 files), build 0 across 3148 modules, cargo check/clippy 0, cargo test 115 lib + 3 harness = 118.

Next: Phase 2 Slice 2.2 hard hooks around the existing tool runtime.
