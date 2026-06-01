# Source Pack

Scope: Atlas workspace, session, agent, terminal cwd, path resolution, and shell execution binding.

## Files inspected

- `ATLAS.md`: project instructions, architecture map, checks, coding conventions, and existing AI subsystem notes.
- `src/modules/workspace/workspaceStore.ts`: frontend workspace root store and recent workspace persistence. It currently owns `workspaceRoot` and recents, but not `projectId`, `projectName`, `activeFolder`, or session binding.
- `src/modules/workspace/env.ts`: frontend local versus WSL workspace environment store. This is environment scope, not project identity.
- `src/modules/workspace/openFolderDialog.ts`: native folder picker wrapper used by welcome, explorer, and sessions.
- `src/modules/workspace/WelcomeScreen.tsx`: no-workspace landing/chat surface and recent workspace opener.
- `src/modules/tabs/lib/useWorkspaceCwd.ts`: workspace-first terminal start policy. It already says new terminals start at `activeFolder` or `workspaceRoot`, and explorer root is `workspaceRoot`.
- `src/modules/tabs/lib/useTabs.ts`: tab source of truth, terminal tab `cwd`, pane tree cwd, active terminal leaf, editor active file path, terminal reset.
- `src/modules/terminal/TerminalStack.tsx`: keeps terminal tabs mounted and forwards cwd updates from pane leaves.
- `src/modules/terminal/TerminalPane.tsx`: wraps a single terminal leaf and exposes buffer, selection, focus, write.
- `src/modules/terminal/PaneTreeView.tsx`: pane tree view, active leaf focus, passes `initialCwd` into terminal panes.
- `src/modules/terminal/lib/useTerminalSession.ts`: opens PTY sessions, persists `lastCwd` per terminal leaf from OSC 7, exposes terminal buffer and selection.
- `src/modules/terminal/lib/osc-handlers.ts`: parses OSC 7 cwd and OSC 133 prompt state. Terminal cwd tracking is shell-local.
- `src/app/App.tsx`: main coordinator. Owns active tab, active terminal leaf cwd, active editor file, `activeFolder`, `workspaceRoot`, live AI context bridge, terminal cwd authorization, terminal spawn cwd, and sidebar/project surfaces.
- `src/modules/ai/config.ts`: system prompts. Current prompt is terminal-first and explicitly tells the agent bare paths resolve against `active_terminal_cwd`.
- `src/modules/ai/lib/agent.ts`: model setup, system prompt assembly, AI SDK `streamText`, tool labels.
- `src/modules/ai/lib/transport.ts`: injects the live context block into the latest user message. Current shape is `<env>` with `workspace_root`, `active_terminal_cwd`, and optional `active_file`.
- `src/modules/ai/lib/sessions.ts`: persisted session metadata and message store. Current `SessionMeta` has optional `workspaceRoot` for backward compatibility, but no `projectId` or project name.
- `src/modules/ai/store/chatStore.ts`: chat/session Zustand store, live context contract, `ToolContext` construction, new session creation, session switching, and persisted session list updates.
- `src/modules/ai/lib/native.ts`: frontend IPC facade for fs, search, shell, git, workspace authorization. It passes the current workspace env to Rust commands.
- `src/modules/ai/tools/context.ts`: current path resolver and tool context type. This is the main terminal-first bug: relative paths resolve against active terminal cwd.
- `src/modules/ai/tools/fs.ts`: read, list, write, and create directory tools. They call `resolvePath(path, ctx.getCwd())` and describe paths as relative to active terminal cwd.
- `src/modules/ai/tools/edit.ts`: edit and multi-edit tools. They call the same terminal-cwd resolver.
- `src/modules/ai/tools/search.ts`: grep and glob tools. Search root defaults to workspace root, then active cwd. Explicit roots still use terminal-cwd resolution.
- `src/modules/ai/tools/shell.ts`: `bash_run` persistent agent shell and `bash_background`. Both currently use `ctx.getCwd()` as the default cwd.
- `src/modules/ai/tools/terminal.ts`: terminal output, preview, and command suggestion tools. Terminal output remains a view/tool, not project authority.
- `src/modules/ai/tools/tools.ts`: tool composition and comments. Current docs say the model sees paths resolved against active terminal cwd.
- `src/modules/ai/components/AiInputBar.tsx`: composer UI. Current composer shows model and attachments, but not project selector, workspace root, execution cwd, or terminal cwd.
- `src/modules/ai/components/SessionsPanel.tsx`: session sidebar grouped by `workspaceRoot`. It has stale workspace detection and open workspace action, but session selection does not restore project binding.
- `src/modules/ai/components/AiMiniWindow.tsx`: floating agent surface, persisted geometry hook, session label, and mini header controls.
- `src/modules/ai/lib/miniWindowGeometry.ts`: mini agent panel placement and resize math.
- `src/modules/ai/lib/useMiniWindowGeometry.ts`: mini agent panel DOM geometry persistence and pointer gestures.
- `src/modules/ai/components/AiToolApproval.tsx`: shell approval card displays input cwd when present.
- `src/modules/ai/components/AgentRunBridge.tsx`: opens AI diff tabs from tool calls and uses the exported resolver for approval paths.
- `src/modules/explorer/FileExplorer.tsx`: explorer root is `workspaceRoot`, and explicit folder navigation calls `onFolderSelected`.
- `src/modules/sidebar/WorkspaceSidebarHeader.tsx`: displays current workspace root label in sidebar header.
- `src/modules/statusbar/StatusBar.tsx`: passes active terminal cwd and active file to the status bar.
- `src/modules/statusbar/CwdBreadcrumb.tsx`: displays terminal cwd breadcrumbs and can send `cd` to a terminal.
- `src-tauri/src/modules/workspace.rs`: Rust authorization registry, launch cwd snapshot, local/WSL path mapping, user PTY spawn cwd authorization, agent shell cwd authorization.
- `src-tauri/src/modules/pty/mod.rs`: PTY command surface. `pty_open` authorizes user spawn cwd and then opens terminal sessions.
- `src-tauri/src/modules/pty/session.rs`: PTY spawn lifecycle and shell command construction.
- `src-tauri/src/modules/pty/shell_init.rs`: builds shell commands for local and WSL terminals and applies cwd.
- `src-tauri/src/modules/shell/mod.rs`: one-shot shell command, persistent agent shell commands, background shell process commands, cwd authorization.
- `src-tauri/src/modules/shell/session.rs`: persistent agent shell state, cwd sentinel tracking, cwd after command.
- `src-tauri/src/modules/shell/background.rs`: background process spawn, cwd storage, process info.
- `src-tauri/src/modules/fs/file.rs`: Rust read/write/canonicalize/stat commands. They resolve with workspace env but do not know project root policy.
- `src-tauri/src/modules/fs/mutate.rs`: Rust create/rename/delete commands. They resolve with workspace env and rely on frontend approval/security.
- `src-tauri/src/modules/fs/search.rs`: file search and file listing under a given root.
- `src-tauri/src/modules/fs/grep.rs`: grep and glob under a given root.

## Current ownership

- Workspace source today: `useWorkspaceStore.workspaceRoot`.
- Project identity today: not explicit. Existing sessions only optionally store `workspaceRoot`.
- Active folder today: `App.tsx` local state from explorer `onFolderSelected`.
- Active file today: derived in `App.tsx` from active editor or git diff tab, but the AI live bridge currently exposes only editor tabs as active file.
- Active terminal cwd today: terminal tab and pane leaf `cwd`, updated from OSC 7 and mirrored into `activeTerminalLeafCwd`.
- Agent path authority today: `ToolContext.getCwd()` flows to `resolvePath`, which makes active terminal cwd authoritative for relative file paths.
- Shell execution cwd today: `ctx.getCwd()` for agent shell and background shell. This couples shell cwd to active terminal cwd.
- Rust authorization today: terminal user spawns can authorize arbitrary cwd, while agent shell cwd must already be under an authorized root.

## Existing concerns found during inspection

- Several files contain duplicate or malformed lines that appear pre-existing, including `src/app/App.tsx`, `src/modules/ai/config.ts`, `src/modules/ai/lib/native.ts`, `src/modules/ai/components/AiInputBar.tsx`, `src/modules/ai/components/SessionsPanel.tsx`, and Rust tests. These are noted as risk and will only be touched where required for this workspace/session binding slice.
- The workspace folder is not a Git repository, so rollback must be done by reverting individual file edits.

## Final status

Implemented the workspace/session/agent binding slice. The central ownership after this change is:

- `useWorkspaceStore`: project source of truth for `projectId`, `projectName`, and `workspaceRoot`.
- `App.tsx`: derives `activeFolder`, `activeFile`, `activeTerminalId`, `activeTerminalCwd`, and `executionCwd`.
- `chatStore.ts`: binds sessions to project metadata and exposes execution mode.
- `tools/context.ts`: single path policy and workspace boundary module for agent tools.
- `transport.ts` and `config.ts`: model-facing Atlas context and workspace-first prompt semantics.

## Follow-up status: Codex-style session switcher and panel binding

Implemented after UI review:

- Session switching now goes through the live app bridge so the bound workspace is restored before the active session changes.
- Workspace restore resets terminal panes for cross-project switches and refuses to switch while editor tabs are dirty.
- The mini agent header now has a top-right session dropdown using the same project-grouped session data as the sidebar.
- Unbound mode is labeled as `Unbound` in UI-facing project names instead of looking like a real "No project" project.
- The mini agent panel defaults to the top-right corner and supports a persisted right-docked mode with separate saved geometry.

Correction after UI review:

- Right-docked mode is now implemented as a real resizable panel in `App.tsx`, similar to a VS Code Copilot sidebar.
- The floating mini panel is still the only floating overlay; docking no longer creates a large edge-pinned floating surface.
- Agent right-panel width is persisted separately from the directory sidebar width.

Correction after home screenshot:

- `WelcomeScreen.tsx` now owns the home-page top-right sessions dropdown.
- `AiInputBar.tsx` no longer renders workspace/execution/terminal cwd metadata inside the composer.
- `chatStore.ts` hydration now starts with an unbound home chat and does not auto-restore the last project into the current workspace.
- `App.tsx` workspace environment switching no longer promotes `$HOME` to `workspaceRoot`.

Correction after history/scroll feedback:

- `WelcomeScreen.tsx` uses an icon-only history control for home sessions.
- `AiChat.tsx` stores scroll position per surface and session.
- `AiMiniWindow.tsx` passes a mini-specific scroll key.
- `conversation.tsx` no longer applies global smooth scroll-to-bottom on every mount or resize.

Correction after Agent authority feedback:

- `useTabs.ts` now names the welcome surface `Agent` and can reset to Agent without creating a terminal.
- `TabBar.tsx` puts Agent first in the new-tab menu and labels Cmd+I there.
- `shortcuts.ts` labels Cmd+I as the Agent-tab toggle.
- `App.tsx` no longer uses terminal reset during project/session restore or workspace environment switching.

## Pre-plan learning pass: source-parity discipline

Read thoroughly:

- `Backend analysis and feedback.md`: accumulated architecture discussion. The final ROI-ranked sections are the current learning surface; earlier Python-backend recommendations are historical.
- `plans/ATLAS_PLAN.md`: legacy executable queue for the archived Python/FastAPI and Svelte build. Useful for doctrine and failure lessons, but not executable against the active React/Tauri repo.
- `ATLAS.md`: active project architecture and quality contract.

Added:

- `docs/opensrc-references.tsv`: curated upstream manifest grouped by topic and ROI tier.
- `scripts/consult-opensrc.sh`: mandatory pre-edit resolver for relevant upstream source trees.
- `ATLAS.md` source-parity hook: inspect active Atlas plus relevant opensrc upstream, then record copy/adapt/reject before non-trivial edits.

Cache refresh note:

- The recommended GitHub repository set was fetched through opensrc.
- A later full refresh hit GitHub's unauthenticated API rate limit. The resolver now prefers opensrc and falls back to already-fetched local source trees when refresh traffic is rate-limited.
- Verified: `bash scripts/consult-opensrc.sh --all` resolves all 50 curated upstream entries from the local opensrc cache.
- Freshness-sensitive slices should refresh through the authenticated hook and record cached versus refreshed source use.

Initial source reads already completed through opensrc:

- `Aider-AI/aider:aider/repomap.py`: budgeted repo-map ranking and projection behavior.
- `anomalyco/opencode:packages/opencode/src/lsp/lsp.ts`: lazy LSP lifecycle and language-server routing.
- `anomalyco/opencode:packages/opencode/src/tool/edit.ts`: edit flow that notifies LSP and returns diagnostics.
- `DeusData/codebase-memory-mcp:README.md`: tree-sitter graph, watcher, ignore, and selective query scaffold.
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/models.py`: memory-unit schema.
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/retriever.py`: adaptive retrieval signals.
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/consolidator.py`: dry-run consolidation behavior.
- `All-Hands-AI/OpenHands`: runtime and sandbox boundary study.
- `crynta/terax-ai`: substrate lineage comparison.

Decision:

- Never implement a non-trivial subsystem from a blank page.
- Prefer reference, adapter, parity test, then the smallest Atlas-native ownership layer.
- Keep repo reality, memory, and proof separate even when studying systems that combine them.

## Roadmap evidence packet: 2026-05-31

Purpose:

- Produce the canonical post-learning execution roadmap without implementing product features.
- Reconcile the final backend memo, the legacy plan, current primary documentation, opensrc upstreams, and the active React/Tauri repository.

Active Atlas paths inspected:

- `src-tauri/src/modules/workspace.rs`
- `src-tauri/src/modules/fs/file.rs`
- `src-tauri/src/modules/fs/tree.rs`
- `src-tauri/src/modules/fs/mutate.rs`
- `src-tauri/src/modules/fs/search.rs`
- `src-tauri/src/modules/fs/grep.rs`
- `src-tauri/src/modules/fs/watch.rs`
- `src-tauri/src/modules/shell/mod.rs`
- `src-tauri/src/modules/shell/session.rs`
- `src-tauri/src/lib.rs`
- `src/modules/workspace/workspaceStore.ts`
- `src/modules/ai/tools/context.ts`
- `src/modules/ai/tools/edit.ts`
- `src/modules/ai/tools/fs.ts`
- `src/modules/ai/tools/search.ts`
- `src/modules/ai/lib/agent.ts`
- `src/modules/ai/store/chatStore.ts`
- `src/modules/explorer/lib/watch.ts`
- `.github/workflows/ci.yml`

Primary sources selected:

- Tauri 2 commands, capabilities, and testing documentation.
- Language Server Protocol 3.17 specification.
- Tree-sitter parser usage documentation.
- Aider repo-map documentation.
- Model Context Protocol official documentation and latest specification.
- Claude Code memory, hooks, skills, and MCP documentation.

opensrc upstream files inspected:

- `Aider-AI/aider:aider/repomap.py`
- `Aider-AI/aider:tests/basic/test_repomap.py`
- `anomalyco/opencode:packages/opencode/src/lsp/lsp.ts`
- `anomalyco/opencode:packages/opencode/src/lsp/client.ts`
- `anomalyco/opencode:packages/opencode/src/permission/index.ts`
- `anomalyco/opencode:packages/opencode/src/tool/edit.ts`
- `DeusData/codebase-memory-mcp:README.md`
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/models.py`
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/retriever.py`
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/consolidator.py`
- `earendil-works/pi:packages/coding-agent/src/core/extensions/types.ts`
- `earendil-works/pi:packages/coding-agent/src/core/tools/file-mutation-queue.ts`
- `All-Hands-AI/OpenHands:openhands/app_server/event/README.md`
- `All-Hands-AI/OpenHands:openhands/app_server/sandbox/README.md`
- `modelcontextprotocol/typescript-sdk:README.md`
- `modelcontextprotocol/typescript-sdk:packages/core/src/types/spec.types.ts`
- `modelcontextprotocol/typescript-sdk:test/conformance/README.md`

Key decisions:

- `ATLAS_EXECUTION_PLAN.md` is the canonical roadmap.
- "Implement every reference" means every consulted upstream receives an explicit `COPY`, `ADAPT`, `WRAP`, `BENCHMARK`, `STUDY`, or `REJECT` disposition with the required evidence.
- Existing Rust grep is benchmarked before any ripgrep subprocess is introduced.
- Native filesystem authorization, fail-closed binding, platform-aware containment, stale-edit rejection, and same-file serialization precede CodeReality.
- Minimal proof receipts ship before graph, LSP, memory-provider, skills, or MCP expansion.
- MCP must use a pinned tested stable protocol and SDK release. SDK development `main` is not a release pin.

Freshness:

- Mixed: opensrc cached fallback was used after GitHub unauthenticated API rate limiting.
- Before implementing a freshness-sensitive slice, refresh focused upstreams through the authenticated hook and record exact commits.

## Follow-up correction: GitHub CLI token bridge

Inspected opensrc source:

- `vercel-labs/opensrc:packages/opensrc/cli/src/core/registries/mod.rs`
- `vercel-labs/opensrc:packages/opensrc/cli/src/core/registries/repo.rs`
- `vercel-labs/opensrc:packages/opensrc/cli/src/core/git.rs`

Decision:

- `opensrc` reads `GITHUB_TOKEN` for GitHub API requests.
- `scripts/consult-opensrc.sh` now uses `GITHUB_TOKEN` or `GH_TOKEN` when present and otherwise reads the active `gh` keyring token at runtime.
- The token is passed only to the `opensrc` subprocess. The hook never prints or writes it.
- The inspected opensrc clone flow removes `.git` after fetch, so its cache does not retain an authenticated Git remote.
- The hook refreshes repositories in bounded batches so `--all` does not create one resource-heavy 50-repository opensrc process. A failed batch falls back to the corresponding local cache paths.
- The globally installed opensrc binary currently hangs even for `--help` on this machine, so the minimal desktop shell fallback continues to use the working `pnpm dlx opensrc` path.

## Slice 0.2: verification floor (M0)

Tiny-fix exemption: `B0`/`B1` repair and `scripts/verify-atlas.sh` wrap existing commands with no subsystem design decision, so upstream source inspection is not required.

Files inspected: `package.json`, `vite.config.ts`, `src-tauri/src/lib.rs`.

Files changed: `src-tauri/src/lib.rs` (one attribute), added `scripts/verify-atlas.sh`.

Findings:

- `B1` was an environment trap, not a code defect: active Node was v16.20.2; pnpm requires Node >= 22.13. With Node 22.16 the full suite passes.
- `B0` clippy is fixed with `#[allow(unused_mut)]` on `lib.rs:49`. On macOS the `builder =` reassignment is gated `#[cfg(not(target_os = "macos"))]`, so `mut` is unused on that platform but required elsewhere; the attribute keeps both correct with no runtime change.

Decision: keep `verify-atlas.sh` minimal and add a Node-version guard so the `B1` trap fails fast with a clear message instead of a cryptic pnpm error.

Verified (clean-shell, Node 22.16 + cargo, `verify-atlas.sh --all` exit 0): tsc exit 0, vitest 91 passed, pnpm build exit 0 (3142 modules), cargo check/clippy/test exit 0 with 101 Rust tests.

Process note: the dev shell profile injected phantom text into command stdout and produced false clippy pass/fail readings mid-slice. Ground truth was re-established with the Read tool and an `env -i ... --noprofile --norc` shell. Lesson: trust exit codes from a clean shell and file reads, not decorated stdout.

## Slice 0.3: fixture harness

Tiny-fix exemption: deterministic test fixtures and a temp-copy helper introduce no subsystem design decision, so upstream inspection is not required. The temp-dir helper reuses the existing `tempfile` crate rather than hand-rolling one (CLAUDE.md simplicity rule).

Files inspected: `tsconfig.json`, `package.json` (vitest defaults), `src-tauri/Cargo.toml` (confirmed `tempfile = "3"` present), `vite.config.ts`, `src/modules/ai/lib/sessions.test.ts` (test style).

Files added: `tests/fixtures/{README.md,simple-ts,stale-edit,ignore-heavy}`, `src-tauri/tests/common/mod.rs`, `src-tauri/tests/harness.rs`.
Files changed: `vite.config.ts` (`test.include` scoped to `src/**`).

Decisions:

- Build only the three fixtures the near-term slices need (`simple-ts`, `stale-edit`, `ignore-heavy`). Defer the other five; create each with the slice that defines its exact test shape. Recorded in `tests/fixtures/README.md`.
- `symlink-escape` is intentionally not committed as static files; symlinks are created at runtime in Slice 1.1 tests to avoid platform-dependent committed symlinks.
- Scope vitest to `src/**` so fixture `*.test.ts` (written for the agent-under-test, sometimes intentionally failing) never join Atlas's own suite.

Verified (clean shell, `verify-atlas.sh --all` exit 0): tsc 0, vitest 91 passed, build 0, cargo clippy 0, cargo test 104 passed (3 new harness tests: copy idempotence, drop cleanup, parallel isolation).

## Slice 1.1: native filesystem authorization (S0)

Source-parity packet:

- Slice: native fs IPC authorization against the workspace registry.
- Atlas files inspected: `src-tauri/src/modules/workspace.rs`, `fs/file.rs`, `fs/mutate.rs`, `fs/tree.rs`, `fs/search.rs`, `fs/grep.rs`, `fs/watch.rs`, `fs/mod.rs`, `src/lib.rs`, `src/modules/workspace/workspaceStore.ts`, `src/modules/ai/lib/native.ts`.
- opensrc resolved (cache): `crynta/terax-ai` (substrate), `anomalyco/opencode` (permission model), `tauri-apps/tauri` (IPC/State). Freshness: cached fallback (Node 16 in dev shell blocked refresh; non-blocking, the resolver fell back to local cache).
- Disposition: `ADAPT` Atlas's own `fs/watch.rs` registry gate (`registry.is_authorized` after canonicalize) - it is the established in-repo precedent for exactly this check. opencode allow/ask/deny is for the frontend agent-tool layer (later slice), not this native root gate, so `STUDY` here.
- Atlas-owned integration: two helpers in `workspace.rs` - `authorize_existing_path` (Mode A: canonicalize following symlinks, target must be under an authorized root; for read/stat/list/search/grep) and `authorize_path_target` (Mode B: canonicalize the deepest existing ancestor of the parent only, never a final-component symlink, then re-attach tail; for write/create/rename/delete so symlink delete/rename act on the link and nested create authorizes by the real ancestor).
- Rejected behavior: gating against the final-component symlink for delete/rename (would follow the link and act on the target). Mode B avoids it; the preserved `delete_does_not_follow_symlink_into_target` test proves it.

Applied to every fs command by splitting each into a testable `_inner(..., &WorkspaceRegistry)` plus a thin `#[tauri::command]` shell that injects `tauri::State<WorkspaceRegistry>`. The `generate_handler!` registration is unchanged and the frontend invoke calls are unchanged (Tauri injects `State` server-side), so this is transparent to the webview.

Boundary note (app vs agent): the native gate authorizes against the registry, which bootstraps home + launch dir and gains workspace roots via `workspace_authorize`. This is the app-level OS boundary that blocks forged IPC outside all roots. The narrower agent-project policy (only the bound project) stays in the frontend tool layer (`context.ts`) and is hardened in Slices 1.2/1.3. Native secret-path deny-list is a separate invariant (frontend `security.ts` already enforces it for the agent surface); a native version is a Phase 1 follow-up, not this slice.

L2 forged-IPC note: `mod modules` is private, so a `tests/` harness cannot call the commands without widening the crate API. Not widened (surgical). The inner-function tests cover the forged-IPC case because the command shell is a one-line pass-through: a path outside roots is rejected by the inner fn regardless of how it arrived.

All 10 fs commands gated: `fs_read_file`, `fs_write_file`, `fs_stat`, `fs_canonicalize` (file.rs); `fs_create_file`, `fs_create_dir`, `fs_rename`, `fs_delete` (mutate.rs); `fs_read_dir`, `list_subdirs` (tree.rs); `fs_search`, `fs_list_files` (search.rs); `fs_grep`, `fs_glob` (grep.rs). `fs_watch_add` was already gated.

Process note: a first commit (23f0174) was pushed with a broken build because verify and commit were batched in one turn, so the commit landed before the RC=101 result was read. Two real defects were hidden: (a) the new read-reject tests used `.expect_err()` on `ReadResult`, which is not `Debug` (fixed by matching on the result in the test, leaving the production enum untouched); (b) grep.rs was never actually edited because a `/tmp` copy was read instead of the real file, so the Edit calls were rejected and grep stayed ungated. Both fixed and the commit amended. Lesson reinforced: never batch verify with commit; read the receipt first.

Verified (clean shell, `verify-atlas.sh --all` exit 0): tsc 0, vitest 91, build 0, clippy 0, cargo test 106 lib + 3 harness = 109 (5 new auth tests: read-outside reject, read symlink-escape reject, write-outside reject, create-outside reject, delete-outside reject; all prior fs tests including symlink-delete preservation still pass).

## Slice 1.2: fail-closed workspace binding (S1)

Source-parity packet:

- Slice: make frontend project binding fail closed when native workspace authorization rejects a selected root.
- Atlas files inspected: `src/modules/workspace/workspaceStore.ts`, `WelcomeScreen.tsx`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/ai/components/SessionsPanel.tsx`, `src/modules/ai/store/chatStore.ts`, `src/app/App.tsx`, `src/modules/ai/lib/native.ts`, `src-tauri/src/modules/workspace.rs`.
- Primary docs refreshed: Tauri 2 `Calling Rust from the Frontend` and `Capabilities`. Tauri commands return errors across the IPC boundary; Atlas must treat a rejected custom command as a failed project-binding transition.
- opensrc inspected: `crynta/terax-ai:src/app/App.tsx`, `anomalyco/opencode:packages/opencode/src/permission/index.ts`, `tauri-apps/tauri` cached source. Freshness: cached fallback because the active `gh auth token` lookup was unavailable in this shell.
- Disposition: `ADAPT` OpenCode's explicit fail/deny shape at the project-binding boundary. `REJECT` Terax's ambient-cwd tolerance for this operation: a terminal cwd authorization may be best-effort, but selecting an Atlas project is an explicit trust transition and cannot mutate frontend state after native rejection.
- WSL decision: preserve the selected logical workspace path after native authorization succeeds. Do not bind the canonical string returned by Rust because WSL resolution canonicalizes to a host UNC or drive path while frontend shell and workspace context still need the logical WSL path.
- Tests required: successful authorization binds only after the promise resolves; rejected authorization leaves the prior project and recents unchanged; user-facing open and session-restore paths surface a readable error without tearing down the current workspace first.

Applied:

- `src/modules/workspace/workspaceStore.ts` now throws a readable error when `workspaceAuthorize` rejects and mutates the bound root plus recents only after authorization succeeds.
- Folder-opening surfaces catch and display that error: `WelcomeScreen.tsx`, `FileExplorer.tsx`, and `SessionsPanel.tsx`.
- `src/app/App.tsx` authorizes a session workspace before disposing the current panes, so a rejected switch preserves the visible workspace. `chatStore.ts` also catches fallback restore failures to avoid an unhandled promise rejection.
- Added `src/modules/workspace/workspaceStore.test.ts` with success-ordering and rejection-preservation coverage.

Verified (clean shell, `verify-atlas.sh --all` exit 0): tsc 0, vitest 93 passed (9 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Environment note: macOS `trustd` / `syspolicyd` delayed fresh Node process startup during verification. No project change was needed; the bounded Node 22.16 probe recovered and the serialized full gate completed successfully.

## Slice 1.3: platform-correct path comparison (S1)

Source-parity packet:

- Slice: remove false frontend workspace authorization caused by unconditional case-folding and separator rewriting.
- Atlas files inspected: `src/modules/ai/tools/context.ts`, `context.test.ts`, `src/modules/ai/lib/security.ts`, `src/modules/ai/lib/native.ts`, `src-tauri/src/modules/fs/mod.rs`, `fs/file.rs`, `src-tauri/src/modules/workspace.rs`, `src/lib/platform.ts`.
- Primary docs refreshed: Tauri 2 `@tauri-apps/plugin-os` `platform()` reference, Node.js 22.16 `path` platform notes, Microsoft WSL `Case Sensitivity`, and Apple's APFS FAQ.
- opensrc inspected: `crynta/terax-ai:src/modules/ai/tools/context.ts`, `anomalyco/opencode:packages/opencode/src/tool/external-directory.ts`, `anomalyco/opencode:packages/opencode/src/permission/index.ts`, `tauri-apps/plugins-workspace:plugins/os/guest-js/index.ts`. Freshness: cached fallback; the bounded focused hook was unavailable during the local process-startup delay.
- Disposition: `ADAPT` Atlas's native `fs_canonicalize` / `to_canon` contract and Rust registry `Path::starts_with` shape for the narrower frontend project boundary. Native canonicalization already resolves platform filesystem behavior and emits forward slashes on Windows while deliberately preserving legal backslashes in Unix filenames.
- Disposition: `STUDY` Tauri `platform()` and OpenCode's host-platform normalization. `REJECT` using a host-OS lowercase switch for authorization: Microsoft documents Windows per-directory case sensitivity and WSL Linux case-sensitive paths; Apple documents both case-sensitive and case-insensitive APFS variants. Host OS alone cannot prove the mounted filesystem's comparison semantics.
- Atlas-owned integration: compare canonical native display paths case-exactly; normalize backslashes only while walking raw Windows-style drive or UNC input to find a canonical existing ancestor. Never reinterpret a Unix backslash filename as a separator.
- Tests required: Linux case-variant sibling rejection, Unix backslash sibling rejection, prefix-sibling rejection, macOS native-canonical behavior, Windows drive and UNC coverage, missing Windows-style descendant resolution, and traversal rejection after canonicalization.

Applied:

- `src/modules/ai/tools/context.ts` now separates canonical comparison from raw Windows-style parent walking. Canonical native paths compare case-exactly; only raw drive or UNC input rewrites backslashes while locating an existing ancestor.
- `context.test.ts` adds eight regressions: case-variant sibling, Unix backslash sibling, raw prefix sibling, macOS native-canonical behavior, Windows drive, UNC, missing Windows descendant, and canonical traversal rejection.
- The new workspace-binding error helper imports point directly at `workspaceStore.ts`, so Slice 1.2 does not add another warning to the existing workspace barrel circular-chunk warning family.

Verified (clean shell, final `verify-atlas.sh --all` exit 0): tsc 0, vitest 101 passed (9 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

## Slice 1.4: real stale-edit fingerprint rejection (S1)

Source-parity packet:

- Slice: replace cache-presence edit checks with content fingerprints validated immediately before direct and queued-plan writes.
- Atlas files inspected: `src/modules/ai/tools/edit.ts`, `fs.ts`, `context.ts`, `src/modules/ai/store/chatStore.ts`, `planStore.ts`, `src/modules/ai/components/AgentRunBridge.tsx`, `tests/fixtures/stale-edit/value.ts`.
- opensrc inspected: `anomalyco/opencode:packages/opencode/src/tool/edit.ts`, `anomalyco/opencode:packages/opencode/test/tool/edit.test.ts`, `earendil-works/pi:packages/coding-agent/src/core/tools/edit.ts`, `earendil-works/pi:packages/coding-agent/src/core/tools/file-mutation-queue.ts`. Freshness: cached fallback; the bounded focused hook remained unavailable during the local process-startup delay.
- Disposition: `ADAPT` Pi and OpenCode's read-transform-write placement: reread the actual file at the mutation boundary, then compute the replacement from that fresh text. Atlas adds a stronger session invariant: the fresh text must match the fingerprint recorded by the agent's prior `read_file`.
- Disposition: `ADAPT` the same freshness check for Atlas Plan Mode. A queued edit is a delayed reviewed write; applying it without revalidation would allow external work created after review to be overwritten.
- Atlas-owned integration: one shared UTF-8 fingerprint utility used by reads, direct writes, direct edits, and queued-plan checks. Do not mix Rust UTF-8 byte sizes with JavaScript UTF-16 string lengths.
- Tests required: no-prior-read refusal remains intact; external modification rejects before write with `code: "stale_read"`; same-content edit succeeds including non-ASCII content; binary refusal remains intact; queued plan application rejects a changed file and accepts an unchanged file.

Applied:

- Added `src/modules/ai/tools/fingerprint.ts` with shared UTF-8 byte-size plus hash fingerprints and the structured stale-read refusal text.
- `read_file`, direct `write_file`, and direct edit cache updates now store the same fingerprint representation.
- `edit` and `multi_edit` reread the file immediately before replacement and refuse with `code: "stale_read"` when it differs from the prior agent read.
- Plan Mode queues the reviewed source fingerprint and `planStore.applyAll()` revalidates it immediately before delayed writes.
- Added `edit.test.ts` and `planStore.test.ts` covering external modification refusal, unchanged non-ASCII acceptance, binary refusal, queued stale rejection, and queued fresh acceptance.

Verified (clean shell, `verify-atlas.sh --all` exit 0): tsc 0, vitest 106 passed (11 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

## Slice 1.5: serialize same-file mutations (S1)

Source-parity packet:

- Slice: serialize concurrent agent writes to the same canonical file while preserving parallelism across different files.
- Atlas files inspected: `src/modules/ai/tools/edit.ts`, `fs.ts`, `fingerprint.ts`, `src/modules/ai/store/planStore.ts`, `src/modules/ai/lib/native.ts`.
- opensrc inspected: `earendil-works/pi:packages/coding-agent/src/core/tools/file-mutation-queue.ts`, `earendil-works/pi:packages/coding-agent/src/core/tools/edit.ts`, `anomalyco/opencode:packages/opencode/src/tool/edit.ts`. Freshness: cached fallback.
- Disposition: `ADAPT` Pi's canonical-realpath-keyed promise queue and registration queue. Atlas runs in a webview, so it cannot use Node `realpath`; use the existing native `fs_canonicalize` bridge and fall back to the already-resolved target path for new files.
- Disposition: `STUDY` OpenCode's per-resolved-file semaphore. Atlas keeps a small promise queue because it matches the current TypeScript substrate without importing an effect runtime.
- Atlas-owned integration: wrap direct edits, direct full-file writes, and delayed Plan Mode writes. Different canonical files remain parallel; rejected operations release the queue.
- Tests required: same canonical key serializes, canonical aliases serialize, different files run concurrently, and a rejected mutation releases the next waiter.

## Feature slice: shared project/session binding flow

Source-parity packet:

- Slice: composer project chip, sidebar "Open project" affordance, and welcome open-folder, all sharing one project/session binding flow; unbound mode fails mutation closed.
- Atlas files inspected: `src/modules/ai/store/chatStore.ts`, `src/modules/ai/lib/sessions.ts`, `src/modules/workspace/workspaceStore.ts`, `WelcomeScreen.tsx`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/ai/components/AiInputBar.tsx`, `src/modules/ai/tools/context.ts`, `fs.ts`, `edit.ts`.
- Reference: the Codex / Claude Code session+project switcher UX (composer project chip with existing projects, add-project, and unbound; sidebar open-project) supplied by the user as the target shape. Disposition `ADAPT` the affordance shape only; Atlas owns all binding logic against its existing `useWorkspaceStore` + `chatStore` session model. No upstream code copied. opensrc not consulted: this is UI composition over existing Atlas stores with no new subsystem or protocol (recorded exception per ATLAS.md source-parity hook).
- Atlas-owned integration: `src/modules/workspace/projectFlow.ts` is the single flow (`openProjectFromDialog`/`FromPath`, `startUnboundSession`, `switchToProject`, `listKnownProjects`). It reuses the existing `setWorkspaceRoot` (fail-closed native authorize), `newSession` (binds current root), and `switchSession` (restores bound workspace) without changing them.
- Fail-closed: extracted `checkMutationAllowed`/`UNBOUND_MUTATION_ERROR` in `context.ts`, replacing the duplicated inline `!project.workspaceRoot` guard in `write_file`, `create_directory`, `edit`, `multi_edit`. Unbound sessions chat and read but never mutate.
- Rejected: repurposing the agent-panel dock/grid icons for project actions (they are not project/folder semantics).
- Tests: two unit tests in `context.test.ts` prove the unbound guard blocks mutation (the "Create TODO.md" case) and allows it when bound. GUI flows (composer/sidebar/welcome open, A/B session switch restoring workspaceRoot) are user-verify because they need the Tauri window.

Verified (clean shell): `pnpm exec tsc --noEmit` 0, `pnpm test` 112 passed (12 files), `verify-atlas.sh --fast` OK.
