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

Applied:

- Added `src/modules/ai/tools/fileMutationQueue.ts`: a canonical-path-keyed promise queue with a short registration queue so aliases cannot race queue creation.
- Wrapped direct edits, direct full-file writes, and delayed Plan Mode writes. New files fall back to the already-resolved target path when native canonicalization cannot resolve them yet.
- Added `fileMutationQueue.test.ts` for same-key ordering, canonical aliases, cross-file parallelism, and rejection release.

Verified (clean shell, final combined `verify-atlas.sh --all` exit 0): tsc 0, vitest 121 passed (13 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

## Follow-up correction: bound shell auto-run arguments

Source-parity packet:

- Slice: harden the approval-mode safe shell shortcut added in `d2bccb1`.
- Atlas files inspected: `src/modules/ai/lib/permissions.ts`, `permissions.test.ts`, `src/modules/ai/tools/shell.ts`, `src/modules/ai/lib/security.ts`.
- opensrc refreshed: `anomalyco/opencode:packages/opencode/src/tool/shell.ts`, `packages/opencode/src/permission/arity.ts`, `packages/opencode/src/permission/index.ts`. The authenticated opensrc hook resolved the active cached checkout through the GitHub CLI keyring.
- Disposition: `ADAPT` OpenCode's parsed, pattern-oriented shell permission stance. `REJECT` first-token-only auto-run classification: arguments can turn apparently read-only tools into mutation or secret-exfiltration paths (`env rm -rf /`, `find . -delete`, `git branch -D old`, `cat ~/.ssh/id_rsa`).
- Atlas-owned integration: keep the lightweight classifier, but auto-run only fully bounded shapes: no-argument `pwd` / `date` / `whoami`, current-directory `ls` with flags only, `git status` with safe flags only, and one simple relative `open` target. All other shell calls still work through the approval path.
- Tests required: preserve `open index.html`, `ls -la`, and `git status --short`; reject secret reads, environment output, executable wrappers, mutating `find` / `diff` / Git shapes, external or flagged `open`, and shell compounding.

Applied:

- Replaced first-token-only safe-shell classification with bounded argument checks.
- Removed automatic approval for broad read-looking commands such as `cat`, `rg`, `find`, `diff`, and `env`; those remain available through the approval prompt.
- Added regressions for secret reads, environment output, wrappers, mutating flags, Git mutations, external or flagged `open`, and compounded commands.

Verified (clean shell, final combined `verify-atlas.sh --all` exit 0): tsc 0, vitest 121 passed (13 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

## Feature slice: shared project/session binding flow

Source-parity packet:

- Slice: composer project chip, sidebar "Open project" affordance, and welcome open-folder, all sharing one project/session binding flow; unbound mode fails mutation closed.
- Atlas files inspected: `src/modules/ai/store/chatStore.ts`, `src/modules/ai/lib/sessions.ts`, `src/modules/workspace/workspaceStore.ts`, `WelcomeScreen.tsx`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/ai/components/AiInputBar.tsx`, `src/modules/ai/tools/context.ts`, `fs.ts`, `edit.ts`.
- Reference: the Codex / Claude Code session+project switcher UX (composer project chip with existing projects, add-project, and unbound; sidebar open-project) supplied by the user as the target shape. Disposition `ADAPT` the affordance shape only; Atlas owns all binding logic against its existing `useWorkspaceStore` + `chatStore` session model. No upstream code copied. opensrc not consulted: this is UI composition over existing Atlas stores with no new subsystem or protocol (recorded exception per ATLAS.md source-parity hook).
- Atlas-owned integration: `src/modules/workspace/projectFlow.ts` is the single flow (`openProjectFromDialog`/`FromPath`, `startUnboundSession`, `switchToProject`, `listKnownProjects`). It reuses the existing `setWorkspaceRoot` (fail-closed native authorize), `newSession` (binds current root), and `switchSession` (restores bound workspace) without changing them.
- Fail-closed: extracted `checkMutationAllowed`/`UNBOUND_MUTATION_ERROR` in `context.ts`, replacing the duplicated inline `!project.workspaceRoot` guard in `write_file`, `create_directory`, `edit`, `multi_edit`. Slice 1.6 tightens unbound sessions further: they chat without inheriting filesystem access from bootstrapped app roots.
- Rejected: repurposing the agent-panel dock/grid icons for project actions (they are not project/folder semantics).
- Tests: two unit tests in `context.test.ts` prove the unbound guard blocks mutation (the "Create TODO.md" case) and allows it when bound. GUI flows (composer/sidebar/welcome open, A/B session switch restoring workspaceRoot) are user-verify because they need the Tauri window.

Verified (clean shell): `pnpm exec tsc --noEmit` 0, `pnpm test` 112 passed (12 files), `verify-atlas.sh --fast` OK.

## Feature slice: approval modes and auto-run safe shell

Source-parity packet:

- Slice: active-session approval modes (default / acceptEdits / full) plus a bounded safe-shell auto-run allow-list, so low-risk actions flow without prompts while edits, shell, and protected areas stay controlled.
- Atlas files inspected: `src/modules/ai/lib/security.ts` (checkShellCommand circuit breaker, checkReadable/Writable deny-lists), `src/modules/ai/tools/{fs,edit,shell,terminal,tools}.ts`, `src/modules/ai/store/chatStore.ts`, `src/modules/ai/tools/context.ts`, `node_modules/@ai-sdk/provider-utils` (needsApproval type).
- opensrc inspected (cache): `anomalyco/opencode:packages/opencode/src/permission/index.ts` (allow/ask/deny model). Freshness: cached fallback. Primary docs referenced: Claude Code permission modes and read-only bash allow-list (default/acceptEdits/bypassPermissions, protected paths never auto-approved, rm -rf circuit breaker) as the product pattern.
- Disposition: `ADAPT` the allow/ask/deny shape into three named modes plus a read-only command allow-list. Atlas owns the classifier; no upstream code copied.
- Key invariant (plan section 5.1 merge-blocker preserved): a mode only suppresses the approval PROMPT for an otherwise-permitted call. The deny layer is untouched and runs inside each tool's execute (checkShellCommand) and in Rust (native out-of-workspace, S0). "Full access" skips prompts but NOT the circuit breaker, secret deny-list, or native boundary. Verified by an explicit test that compounded commands (`open x && rm -rf /`) never classify as auto-run.
- AI SDK: `needsApproval` accepts `boolean | (input, opts) => boolean | Promise<boolean>` (confirmed in `@ai-sdk/provider-utils` types), so modes are read at tool-call time without forking the SDK. The model's tool choice is never overridden; only the prompt is gated. If the model picks a propose-only tool over running, that is the model, not the harness.
- Atlas-owned integration: `permissions.ts` (pure), `approvalMode` in chatStore (active session, resets on new/switch), `getApprovalMode` on ToolContext, `AccessChip.tsx` composer control.
- Tests: 7 unit tests in `permissions.test.ts` (auto-run allow-list, operator rejection, edit-mode matrix, shell-mode matrix, compounded-command safety). GUI mode switching is user-verify (Tauri window).

Verified (clean shell): `pnpm exec tsc --noEmit` 0, `pnpm test` 119 passed (13 files), `verify-atlas.sh --fast` OK.

## Slice 1.6: native agent project and secret-path boundary (S5)

Source-parity packet:

- Slice: separate app-authorized filesystem IPC from agent project IO so the agent cannot inherit bootstrapped home or launch-directory access, and enforce secret-path checks in Rust after canonicalization.
- Atlas files inspected: `ATLAS.md`, `ATLAS_EXECUTION_PLAN.md`, `src-tauri/src/modules/workspace.rs`, `src-tauri/src/modules/fs/{file,tree,mutate,grep,search,watch}.rs`, `src-tauri/src/lib.rs`, `src/modules/ai/lib/{native,security,transport}.ts`, `src/modules/ai/tools/{context,fs,edit,search}.ts`, `src/modules/ai/store/planStore.ts`, `src/modules/editor/lib/useDocument.ts`, and `src/modules/explorer/lib/useFileTree.ts`.
- Primary docs refreshed: Tauri 2 `Calling Rust from the Frontend` and `Capabilities`. Tauri commands are JavaScript-invokable Rust functions and can consume managed `State`, so Atlas policy belongs in thin Rust command shells backed by the registry.
- opensrc refreshed through the authenticated GitHub CLI keyring: `crynta/terax-ai:src/modules/ai/lib/security.ts`, `anomalyco/opencode:packages/opencode/src/agent/agent.ts`, `packages/opencode/src/tool/read.ts`, `packages/opencode/src/tool/external-directory.ts`, and `packages/opencode/src/config/permission.ts`.
- Disposition: `ADAPT` Terax's frontend sensitive-path classifier into a small dependency-free Rust policy core. Keep the existing frontend pass as defense in depth; Rust becomes authoritative for agent file IPC.
- Disposition: `ADAPT` OpenCode's separate read and external-directory permission stance. Atlas keeps a stricter fixed deny-list for obvious secrets and uses an explicit project-root registry rather than exposing bootstrapped app roots to agent commands.
- Disposition: `WRAP` Tauri managed `State` and custom commands. Add narrow `agent_fs_*` shells over existing filesystem primitives instead of changing editor and explorer IO.
- Rejected behavior: applying the native secret deny-list to all `fs_*` commands. That would close the agent gap but also prevent a user from manually opening or editing `.env` in the desktop editor. App IO and model IO are distinct trust concepts.
- Atlas-owned integration: track explicitly selected project roots separately from app-authorized roots; require one for every `agent_fs_*` command; re-check canonical existing paths and canonical existing parents for sensitive names and directories; filter recursive agent grep/glob traversal.
- Tests required: project roots are distinct from bootstrapped app roots; agent read rejects `.env`, protected directories, and symlink-to-secret paths; agent write/create reject sensitive targets and protected parents; manual app IO remains usable; agent grep/glob never return sensitive files.
- Freshness: refreshed.

Applied:

- Added `src-tauri/src/modules/workspace/agent_policy.rs`: a dependency-free native sensitive-path policy for agent reads and writes, including `.env*`, key files, credential filenames, protected directories, Windows verbatim paths, alternate data streams, and trailing dot/space normalization.
- Split the registry into app-authorized roots and explicit agent project roots. `workspace_authorize_agent_project` registers selected projects without granting agent access to bootstrapped home or launch roots.
- Added `agent_fs_*` wrappers for read, write, canonicalize, create-directory, read-directory, grep, and glob. Existing `fs_*` commands remain the manual editor/explorer lane.
- Added the frontend `agentNative` facade and switched built-in model filesystem access, transport project-memory reads, and delayed Plan Mode writes to that lane.
- Unbound chat sessions now reject all model-driven filesystem access, not only mutations.
- Added native and frontend regressions for app-vs-agent root separation, `.env` refusal, protected-parent refusal, symlink-to-secret refusal after canonicalization, filtered recursive grep/glob, and bound/unbound file access.

Verified (clean shell, final `verify-atlas.sh --all` exit 0): tsc 0, vitest 123 passed (13 files), build 0 across 3148 modules, cargo check/clippy 0, cargo test 115 lib + 3 harness = 118.

Known limitation: Tauri custom commands identify the invoking webview, not the JavaScript call site. This lane makes built-in model IO and forged `agent_fs_*` calls fail closed, but it is not a sandbox against fully compromised trusted webview code invoking the manual app lane. The distinction is explicit and intentional.

## Slice 2.1: durable run, event, artifact, and verdict contracts

Source-parity packet:

- Slice: define the smallest provider-independent local proof journal before instrumenting tool hooks or building receipt UI.
- Atlas files inspected: `ATLAS.md`, `ATLAS_EXECUTION_PLAN.md`, `src/modules/ai/lib/sessions.ts`, `src/modules/ai/store/chatStore.ts`, `src/modules/settings/store.ts`, `src/modules/ai/lib/agent.ts`, `src/modules/ai/components/AgentRunBridge.tsx`, `node_modules/@tauri-apps/plugin-store/dist-js/index.js`, and `tests/fixtures/README.md`.
- Primary docs refreshed: Tauri 2 `@tauri-apps/plugin-store` JavaScript reference, Tauri 2 `Calling Rust from the Frontend`, Claude Code `Hooks reference`, and Claude Code `Automate workflows with hooks`. The Store reference documents `LazyStore` as a backend-persisted key-value store under `app_data_dir` and `save()` as the explicit disk flush. Claude documents distinct lifecycle events and structured post-tool success/failure inputs.
- opensrc refreshed through the authenticated GitHub CLI keyring: `All-Hands-AI/OpenHands:openhands/app_server/event/{event_service,event_service_base,filesystem_event_service}.py`, `anomalyco/opencode:packages/opencode/src/storage/storage.ts`, `packages/opencode/src/acp/event.ts`, and `openai/codex:codex-rs/app-server-client/src/lib.rs`.
- Disposition: `ADAPT` OpenHands' independently addressable local event persistence and OpenCode's key-addressed local structured storage into a bounded Atlas journal. Keep `Run`, `Event`, `Artifact`, and `Verdict` provider-independent.
- Disposition: `ADAPT` Codex's lossless-vs-noisy event distinction by bounding stored payload previews and preserving final verdict state separately from event previews. Slice 2.2 will decide which hook events are authoritative; Slice 2.1 only provides the contract.
- Disposition: `WRAP` the existing Tauri Store plugin already used by Atlas sessions and settings. Explicit `save()` after journal mutations provides durable local receipts without a new database, Rust persistence module, dependency, watcher, or boot service.
- Rejected behavior: adding SQLite, a custom Rust JSONL subsystem, or full tool-output persistence before measured need. This slice stores bounded UTF-8 previews and hashes, retains a bounded number of runs/events/artifacts, and keeps the core testable behind a tiny persistence interface.
- Atlas-owned integration: `src/modules/ai/proof/` contains pure contracts plus a serialized journal repository and a thin Tauri Store adapter. Instrumentation belongs to Slice 2.2, not this slice.
- Tests required: ordered append, UTF-8 payload truncation, restart restore, cancelled verdict, stable artifact IDs, and bounded retention.
- Freshness: refreshed.

Applied:

- Added `src/modules/ai/proof/contracts.ts`: provider-independent `ProofRun`, `ProofEvent`, `ProofArtifact`, and `ProofVerdict` contracts with bounded UTF-8 previews, bounded lists, SHA-256 content hashing, and stable artifact IDs.
- Added `src/modules/ai/proof/journal.ts`: a serialized local repository with explicit durable saves, ordered event sequences, restart restore, bounded retained runs, rolling bounded events/artifacts, dropped-item counters, and final verdict persistence.
- Added `src/modules/ai/proof/persistence.ts`: a thin `LazyStore` adapter using `atlas-ai-proof-receipts.json` with `autoSave: false`; the journal explicitly flushes each mutation through `save()`.
- Added `src/modules/ai/proof/index.ts`: the default journal export. Nothing imports it yet, so Slice 2.1 adds no boot work, runtime hook, IPC call, or extra dependency.
- Added `src/modules/ai/proof/journal.test.ts` with six regressions covering ordered concurrent append, UTF-8 truncation, restart restore, cancelled verdicts, stable artifact IDs, and bounded run/event/artifact retention.

Verified (clean shell, final `verify-atlas.sh --all` exit 0): tsc 0, vitest 129 passed (14 files), build 0 across 3148 modules, cargo check/clippy 0, cargo test 115 lib + 3 harness = 118.

Performance note: retained storage is capped at 100 runs, 500 events per run, 100 artifacts per run, and 100 items per verdict list. Preview payloads cap at 2048 UTF-8 bytes, summaries at 256 bytes, and paths or commands at 4096 bytes.

## Slice 2.2: hard hooks around the existing tool runtime

Source-parity packet:

- Slice: instrument the existing agent loop and tool wrappers to emit proof-journal events without adding a second tool runtime.
- Atlas files inspected: `src/modules/ai/lib/agent.ts`, `lib/transport.ts`, `proof/{contracts,journal,persistence,index}.ts`, `store/chatStore.ts`, `node_modules/ai` (StreamTextResult.finishReason, onStepFinish toolResults/toolCalls).
- opensrc resolved (cache): `All-Hands-AI/OpenHands` (independently addressable event trace), `princeton-nlp/SWE-agent` + `SWE-agent/mini-swe-agent` (ACI tool feedback shape). Freshness: refreshed via authenticated opensrc this slice. Disposition: STUDY (the durable contract shapes were already ADAPTed in Slice 2.1). No upstream code copied.
- Atlas-owned integration: `proof/recorder.ts` (`RunRecorder`) adapts run-start / per-tool-result / finish onto the journal. The only loop change is an observation callback (`onToolResult`) in `runAgentStream`, populated from the existing `onStepFinish` step (toolResults matched to toolCalls by `toolCallId`). The transport owns the run lifecycle: start at the turn boundary, finish on `result.finishReason` resolve, on abort (cancelled), and on thrown error (errored).
- Structured failures (not strings): a tool result with `{error}` becomes a `.failed` event and is added to `unresolvedFailures`; a failed mutation is never counted as a changed file. User explorer/editor IO stays on the app lane and is not recorded as an agent action (only model-driven tool calls flow through `onToolResult`).
- Safety: every recorder call is guarded (`.catch`) so a journal failure can never block or crash the agent turn. Shell output is bounded by the journal payload cap, proven by a 50k-output truncation test.
- Tests: `proof/recorder.test.ts` (4) — complete read-edit-test trace with passed verdict + changed-file artifact + checks; failed result visible and run failed; cancelled verdict + idempotent finish; bounded shell summary.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, vitest 133 passed (15 files), build 0, cargo check/clippy 0, cargo test 115 lib + 3 harness.

## Slice 2.3: minimal proof UI

Source-parity packet:

- Slice: surface the Slice 2.2 proof receipts in the agent UI.
- Atlas files inspected: `proof/recorder.ts`, `lib/transport.ts`, `components/TodoStrip.tsx` (compact-strip pattern), `components/AiMiniWindow.tsx` (mount point + TodoStrip placement), `components/AiChat.tsx`, `vite.config.ts`/`package.json` (test infra check).
- Disposition: this is UI composition over the existing journal + the established TodoStrip strip pattern. No new subsystem or protocol, no upstream code copied (recorded exception per ATLAS.md source-parity hook). Reference shape: Claude Code / Codex proof-of-work surfaces, already STUDY in the Phase 2 references.
- Atlas-owned integration: synchronous `ReceiptSummary` on the recorder (no journal reload for render), a small `proofStore` (zustand) fed by the recorder's `onUpdate`, and `ReceiptStrip` mounted under `TodoStrip`.
- Test convention: the repo has no jsdom/testing-library and zero `.test.tsx`. Rather than add component-test infra for one strip, the real logic (`shouldShowReceipt`) is a pure exported function unit-tested in `receiptStrip.test.ts`; the component body stays thin presentation. Verdict-mapping and accumulation are already covered by `recorder.test.ts`.
- Deferred (avoids overbuild): mini-window click-through needs the live file-open bridge (optional `onOpenFile` left unwired there); run-history list and receipt→terminal/diff deep links are later slices.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, vitest 136 passed (16 files), build 0, cargo check/clippy 0, cargo test 115 + 3 harness.

## Slice 3.1: shared repository ignore policy

Source-parity packet:

- Slice: centralize the repository traversal policy before adding CodeReality inventory, so watcher, explorer search, native grep, glob, and the future inventory agree on one bounded tree.
- Atlas files inspected: `src-tauri/src/modules/fs/{mod,watch,search,grep,ignore_policy}.rs`, `src/modules/ai/lib/native.ts`, `src/modules/ai/tools/search.ts`, `ATLAS.md`, and `ATLAS_EXECUTION_PLAN.md`.
- Primary documentation inspected: `ignore` crate `WalkBuilder` docs (`ignore` 0.4.25) and Aider's repository-map documentation. `WalkBuilder` already supports `.ignore`, `.gitignore`, `.git/info/exclude`, global gitignore, hidden-file filtering, symlink policy, and `filter_entry` directory pruning.
- opensrc refreshed through the authenticated GitHub CLI keyring: `Aider-AI/aider`, `Aider-AI/grep-ast`, `oraios/serena`, `DeusData/codebase-memory-mcp`, `QuantaAlpha/RepoMaster`, `tree-sitter/tree-sitter`, `sourcegraph/scip`, and `microsoft/language-server-protocol`.
- Exact upstream files inspected: `DeusData/codebase-memory-mcp:src/discover/discover.c` and `Aider-AI/aider:aider/watch.py`.
- Disposition: `WRAP` the Rust `ignore::WalkBuilder` traversal engine rather than reimplementing ignore-file semantics. `ADAPT` codebase-memory's layered approach: unconditional generated and dependency directory pruning on top of gitignore traversal, skip symlink traversal, and expose a skipped-directory count. `ADAPT` Aider's stance that watcher scope must apply the same ignore rules as the repository view.
- Atlas-owned integration: add `src-tauri/src/modules/fs/ignore_policy.rs` as the small shared policy module. Keep existing native grep and file-walk implementations; replace their duplicated walker setup and local skip arrays with the shared adapter. Future CodeReality inventory must use the same adapter.
- Rejected behavior: do not import codebase-memory's custom C gitignore matcher or add a new `.atlasignore` format in this slice. The existing Rust crate already owns standard ignore behavior, and a new Atlas-specific format has no measured need yet.
- Parity tests required: known generated directories prune by basename; `.gitignore` entries prune through the shared walker; app and agent grep/glob both skip generated trees; agent grep/glob continue to remove sensitive files.
- Freshness: refreshed upstream snapshots through `scripts/consult-opensrc.sh`; resolved opensrc snapshots do not expose Git metadata, so no snapshot commit hash is available. Official `ignore` documentation inspected at version `0.4.25`.

Applied:

- Added `src-tauri/src/modules/fs/ignore_policy.rs` with the shared generated/dependency directory list, the shared `WalkBuilder` adapter, the default content-size cap, and a thread-safe skipped-directory counter.
- Replaced the watcher-local directory list and the duplicated search, list-files, grep, and glob walker configuration with the shared policy.
- Added `skipped_dirs` to native search, list-files, grep, and glob responses. Agent grep and glob tool results now surface the count.
- Added regressions for repository-scoped `.gitignore` handling, generated-directory pruning, monotonic skip counts, and continued agent sensitive-file filtering.
- Patched `ATLAS_EXECUTION_PLAN.md` with the accelerated `M2-V` delivery mode: one measured CodeReality vertical slice after Slice 3.1, with explicit recall, decoy, token-budget, leakage, refresh, degradation, and grep-benchmark gates.

Focused verification: `pnpm exec tsc --noEmit` 0, `git diff --check` 0, `cargo test --locked modules::fs` 26 passed.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, vitest 136 passed (16 files), build 0 across 3155 modules, cargo check/clippy 0, cargo test 118 lib + 3 harness.

## M2-V: lazy CodeReality snapshot and budgeted task projection

Source-parity packet:

- Slice: collapse Phase 3 inventory, first-language symbol extraction, bounded local graph use, watcher invalidation, and task projection into one measured vertical implementation.
- Atlas files inspected: `src-tauri/Cargo.toml`, `src-tauri/src/{lib,modules/mod}.rs`, `src-tauri/src/modules/fs/{ignore_policy,watch}.rs`, `src/modules/ai/lib/native.ts`, `src/modules/ai/tools/{tools,search,context}.ts`, `src/modules/ai/agents/runSubagent.ts`, and `tests/fixtures/`.
- Primary documentation inspected: Tree-sitter `Using Parsers`, Tree-sitter `tags` CLI documentation, `tree-sitter-tags` crate documentation, and the language-crate Rust bindings for JavaScript `0.25.0`, TypeScript/TSX `0.23.2`, Python `0.25.0`, and Rust `0.24.2`.
- opensrc refreshed through the authenticated GitHub CLI keyring: `Aider-AI/aider`, `DeusData/codebase-memory-mcp`, `tree-sitter/tree-sitter`, `tree-sitter/tree-sitter-javascript`, `tree-sitter/tree-sitter-typescript`, `tree-sitter/tree-sitter-python`, and `tree-sitter/tree-sitter-rust`.
- Exact upstream files inspected: `Aider-AI/aider:aider/repomap.py`; `DeusData/codebase-memory-mcp:src/{discover/discover.c,graph_buffer/graph_buffer.h,watcher/watcher.c}`; `tree-sitter/tree-sitter:crates/tags/src/tags.rs`; each grammar's `bindings/rust/lib.rs` and `queries/tags.scm`.
- Disposition: `WRAP` `tree-sitter-tags::TagsConfiguration` and `TagsContext`, plus maintained grammar `LANGUAGE`, `TAGS_QUERY`, and available `LOCALS_QUERY` constants. `ADAPT` Aider's cached tag inventory, identifier mention boosts, related definition/reference ranking, and strict token-budget fitting. `ADAPT` codebase-memory's bounded local graph buffer and file-level invalidation, but keep Atlas's first implementation in memory and lazy.
- Atlas-owned integration: add a Rust `reality` module with a lazy per-root cache, authorized command shell, shared-ignore walk, compact file and symbol records, watcher-triggered root invalidation, deterministic task ranking, and inspectable projection metadata. Add one read-only `repo_context` tool over the narrow native command.
- Rejected behavior: no SQLite graph store, custom parser, custom tags query, background boot indexer, semantic embedding layer, Cypher engine, or full PageRank dependency in this milestone. They add cost before the fixture metrics justify them. No context-panel UI yet; the agent tool result is the first inspectable surface.
- Parity tests required: official tag-query extraction for JavaScript, TypeScript/TSX, Python, and Rust; ignored/generated exclusion; strict projection budget; deterministic mentioned-symbol ranking; parse errors become explicit degraded records; watcher invalidation removes stale cached roots.
- Freshness: refreshed upstream snapshots and registry-resolved crate sources.

Follow-up freshness evidence:

- Exact upstream inspected: `notify-rs/notify:notify/src/lib.rs` at registry package `notify 8.2.0`. The maintained documentation identifies `PollWatcher` as the fallback when native event delivery is unavailable and warns that filesystem backends vary.
- Atlas decision: keep the existing shared native watcher as the low-latency invalidation path, but do not make CodeReality correctness depend on native delivery. A lazy snapshot expires after `4000ms`, so each later `repo_context` request rebuilds within the `<5s` fixture bound even on hosts where native FSEvents do not deliver.
- Host probe: the ignored `native_recursive_watch_probe_observes_nested_change_within_five_seconds` diagnostic did not receive FSEvents in this macOS host process. It remains available for platform qualification and is intentionally not a merge-blocking unit test.

Applied:

- Added `src-tauri/src/modules/reality/` with an authorized, lazy per-project snapshot; shared-ignore traversal; official Tree-sitter tag extraction for JavaScript, TypeScript/TSX, Python, and Rust; compact file and symbol records; explicit degradation; deterministic relation-aware scoring; and strict token-budget projection.
- Added a read-only `repo_context` agent tool for the normal loop and sub-agents. Prompt policy says to use current repository evidence for broad work and to let it outrank memory.
- Reused Atlas's existing filesystem watcher for recursive project-root invalidation. The command reports `watch_status`, and the snapshot layer enforces a separate `rescan_bound_ms: 4000` correctness fallback.
- Added the deterministic `mixed-stack` fixture with a same-name archive decoy. Its first gate proves four-language extraction, key-file recall `>=85%`, zero decoy selection, ignored/generated exclusion, and projection `<=40%` of naive context.
- Added an ignored native-grep benchmark: 25 fixture iterations measured Atlas native grep at `68.198333ms` and an `rg` subprocess at `138.564584ms`. Preserve the existing native implementation.

Focused verification: `pnpm exec tsc --noEmit` 0, `git diff --check` 0, `cargo test --locked modules::reality` 9 passed, `cargo test --locked modules::fs::watch` 1 passed + 1 host probe ignored, explicit native-grep benchmark passed.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, vitest 136 passed (16 files), build 0 across 3156 modules, cargo check/clippy 0, cargo test 127 lib passed + 2 intentional diagnostics ignored + 3 harness passed.

## Accelerated V1 Slice A: selective repo tools, semantic boundary, and truthful receipts

Source-parity packet:

- Slice: expose CodeReality through narrow selective tools, add the optional semantic-provider boundary without pretending an unavailable language server is connected, and make receipt verdicts depend on real command exit status.
- Atlas files inspected: `src-tauri/src/modules/reality/{mod,index,projection}.rs`, `src-tauri/src/modules/proc.rs`, `src-tauri/src/lib.rs`, `src/modules/ai/tools/{reality,shell,tools}.ts`, `src/modules/ai/lib/native.ts`, and `src/modules/ai/proof/{contracts,recorder,journal}.ts`.
- Primary documentation refreshed: official LSP `3.17` specification server lifecycle, initialize handshake, synchronization requirements, and language-feature request model.
- opensrc refreshed through the authenticated GitHub CLI keyring: `anomalyco/opencode`, `microsoft/language-server-protocol`, `typescript-language-server/typescript-language-server`, `princeton-nlp/SWE-agent`, `SWE-agent/mini-swe-agent`, and `All-Hands-AI/OpenHands`.
- Exact upstream files inspected: `anomalyco/opencode:packages/opencode/src/lsp/{lsp,client}.ts`; `microsoft/language-server-protocol:_specifications/lsp/3.17/{specification.md,general/initialize.md}`; `typescript-language-server:README.md`, `package.json`, and `src/cli.ts`; `SWE-agent/mini-swe-agent:tests/environments/test_local.py`, `tests/config/test_swebench_template.py`, and `src/minisweagent/models/utils/actions_toolcall.py`; `All-Hands-AI/OpenHands:openhands/app_server/event/{event_service,event_service_base,filesystem_event_service}.py`.
- Disposition: `ADAPT` OpenCode's provider status, extension routing, lazy-start boundary, broken-provider visibility, and bounded semantic surface. Slice A lands the provider registry and availability shell first; semantic process startup remains lazy and belongs to Slice B. `REJECT` silently installing language servers or claiming semantic evidence while the provider is unavailable.
- Disposition: `ADAPT` mini-SWE-agent's structured command observation: command exit status and timeout state are authoritative receipt inputs. `REJECT` the existing Atlas behavior where any shell tool result counted as a passing check.
- Disposition: `ADAPT` OpenHands' independently addressable event records through the existing Atlas proof journal. Keep the small local receipt contract; do not add a second trace engine.
- Atlas-owned integration: reuse the M2-V snapshot and projection response for bounded `repo_status`, `repo_map`, `find_symbol`, `find_references`, and `impact_candidates`; add an optional native semantic provider registry; add a pure verification planner; classify shell checks by actual exit and timeout fields; and make unverified runs visibly `incomplete`.
- Tests required: bounded selective-tool helpers, missing semantic provider status, verification suggestions, nonzero exit failure, timeout failure, successful exit pass, and changed-without-check incomplete verdict.

Applied:

- Added selective CodeReality wrappers without a second index: `repo_status`, `repo_map`, `find_symbol`, `find_references`, and `impact_candidates` all project from the existing lazy M2-V snapshot.
- Added `agent_lsp_status` with extension routing for TypeScript, Python, and Rust. It checks real executable availability, including Unix execute bits and Windows command extensions, but never starts a server or claims semantic evidence.
- Added `lsp_status` to the main loop and read-only subagents. Its response states `semantic_requests: not_started`.
- Added `verification_plan` as a pure suggestion surface. Suggested commands are explicitly not executed evidence.
- Added shell-command durations and changed proof receipts so only a successful foreground `bash_run` result records a verification check. Nonzero exits, timeouts, and malformed results fail the run; runs with no successful check finish as `incomplete`.
- Added frontend and native regressions for selective projection helpers, semantic status summaries, verification suggestions, successful exits, nonzero exits, timeouts, mutation-only incompleteness, executable discovery, and non-executable rejection.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, focused Vitest 17 passed, `cargo test --locked lsp::` 3 passed.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, Vitest 146 passed (19 files), production build 0 across 3158 modules, cargo check/clippy 0, cargo test 130 lib passed + 2 intentional diagnostics ignored + 3 harness passed.

## Accelerated V1 Slice B: lazy TypeScript LSP diagnostics lifecycle

Source-parity packet:

- Slice: start the first semantic client lazily, honor the LSP initialize lifecycle, synchronize the requested document, and surface bounded TypeScript diagnostics without making boot depend on any language server.
- Atlas files inspected: `src-tauri/src/modules/{lsp,proc}.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/modules/ai/lib/native.ts`, and `src/modules/ai/tools/{semantic,tools}.ts`.
- Primary documentation refreshed: official LSP `3.17` lifecycle, initialize request, initialized notification, shutdown/exit sequence, mandatory `textDocument/didOpen` and `textDocument/didChange` synchronization, `textDocument/publishDiagnostics`, and crash-loop guidance.
- opensrc refreshed through the authenticated GitHub CLI keyring: `anomalyco/opencode`, `microsoft/language-server-protocol`, and `typescript-language-server/typescript-language-server`.
- Exact upstream files inspected: `anomalyco/opencode:packages/opencode/src/lsp/{lsp,client}.ts`; `microsoft/language-server-protocol:_specifications/lsp/3.17/{specification.md,general/initialize.md}`; `typescript-language-server:README.md`, `src/{cli,lsp-connection,lsp-server,diagnosticsManager}.ts`.
- Disposition: `ADAPT` OpenCode's lazy per-root client creation, first TypeScript push-diagnostic seeding, bounded waits, explicit broken-provider state, and finalizer shutdown. Keep Atlas V1 smaller: TypeScript push diagnostics first, one process per project root, no pull-diagnostics negotiation, no hover/definition/reference requests yet, and no restart loop.
- Disposition: `WRAP` the installed `typescript-language-server --stdio` executable. `REJECT` auto-installing servers, starting them during app boot, hiding initialization failures, or making repo tools depend on semantic availability.
- Atlas-owned integration: extend the existing optional LSP registry with a small framed JSON-RPC client, authorize root and file at the native boundary, spawn only on `lsp_diagnostics`, send initialize once, then initialized and didOpen/didChange, capture bounded publishDiagnostics, and report connected, pending, unavailable, or broken states explicitly.
- Tests required: JSON-RPC framing, diagnostic notification parsing, existing provider-routing regressions, lazy-start state, broken-provider visibility, and a Unix fake-server lifecycle test covering initialize before initialized before didOpen and a published diagnostic response.

Applied:

- Added `lsp/client.rs`, a small framed JSON-RPC client. It starts only from `agent_lsp_diagnostics`, sends initialize once, then initialized, synchronizes didOpen/didChange, captures push diagnostics, and performs shutdown then exit when dropped.
- Kept the first semantic slice intentionally TypeScript-only. Python and Rust providers remain visible but diagnostics return an explicit deferred/unavailable result.
- Added native `LspState` with one lazy client per project-root/provider pair and sticky broken-provider visibility. `agent_lsp_status` remains a probe and never starts a process.
- Added `lsp_diagnostics` to the normal loop and read-only subagents. The frontend contract preserves fresh, cached, pending, unavailable, and broken statuses.
- Used UTF-16 code-unit positions for didChange ranges and case-insensitive JSON-RPC header parsing.
- Added a self-contained Rust socket-pair lifecycle test, avoiding an interpreter or external language-server dependency in the verification floor.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, focused semantic Vitest 3 passed, `cargo check --locked --lib` 0, `cargo clippy --all-targets --locked -- -D warnings` 0, `cargo test --locked lsp::` 8 passed.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, Vitest 147 passed (19 files), production build 0 across 3158 modules, cargo check/clippy 0, cargo test 135 lib passed + 2 intentional diagnostics ignored + 3 harness passed.

## Accelerated V1 Slice C: post-edit diagnostic refresh and receipt attachment

Source-parity packet:

- Slice: refresh optional TypeScript diagnostics after a successful file mutation and attach bounded semantic evidence to the existing proof receipt.
- Atlas files inspected: `src/modules/ai/tools/{fs,edit,semantic}.ts`, `src/modules/ai/store/planStore.ts`, `src/modules/ai/proof/{contracts,journal,recorder}.ts`, `src/modules/ai/components/ReceiptStrip.tsx`, and `src/modules/ai/lib/{agent,transport}.ts`.
- Primary documentation refreshed by web search: official LSP documentation for JSON-RPC language-server features and official Claude Code hooks documentation for `PostToolUse`, `PostToolUseFailure`, and `PostToolBatch`. The hook docs state that post-tool hooks run after the action and may add context; Atlas adapts that lifecycle point inside its existing tool wrapper and recorder path.
- opensrc hook attempted: `bash scripts/consult-opensrc.sh lsp evidence tools agent-loop`. Restricted DNS prevented npm and GitHub refresh, so this slice uses the already inspected local cache paths from Slice B and records the fallback rather than bypassing the hook.
- Cached upstream files reused: `anomalyco/opencode:packages/opencode/src/lsp/{lsp,client}.ts`; `microsoft/language-server-protocol:_specifications/lsp/3.17/{specification.md,general/initialize.md}`; `SWE-agent/mini-swe-agent:tests/environments/test_local.py`; `All-Hands-AI/OpenHands:openhands/app_server/event/{event_service,event_service_base,filesystem_event_service}.py`.
- Disposition: `ADAPT` post-tool lifecycle feedback into the existing Atlas mutation output. A successful write refreshes optional TypeScript diagnostics; the existing recorder observes that output and attaches bounded evidence. `REJECT` a second runtime, background boot service, hard dependency on LSP health, or turning unavailable semantics into a mutation failure.
- Atlas-owned integration: add a small best-effort post-edit diagnostic helper, invoke it after direct and delayed writes, summarize semantic evidence in the proof layer, persist it through the existing verdict diagnostics field, and expose it in the compact receipt strip.
- Tests required: TypeScript vs non-TypeScript refresh routing, unavailable fallback, mutation output attachment, explicit `lsp_diagnostics` attachment, verdict persistence, and receipt-summary/UI visibility.

Applied:

- Added `tools/postEditDiagnostics.ts` as a small best-effort adapter. TypeScript-family writes invoke the lazy LSP client; unsupported files return `not_applicable`; unavailable semantics remain non-fatal.
- Attached post-edit diagnostic envelopes to direct `write_file`, `edit`, and `multi_edit` results. Accepted Plan Mode writes refresh the same optional semantic cache after the delayed mutation.
- Added `proof/diagnostics.ts` to summarize nested mutation evidence and explicit `lsp_diagnostics` results into bounded, one-based receipt lines.
- Extended `RunRecorder`, verdict persistence, `ReceiptSummary`, and `ReceiptStrip` with semantic evidence. The recorder still observes the existing tool-result hook only.
- Added focused regressions for helper routing and fallback, direct edit attachment, delayed plan refresh, nested and explicit evidence extraction, one-based summary formatting, verdict persistence, and receipt-summary compatibility.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, focused Vitest 23 passed.

Verified (clean shell `verify-atlas.sh --all` exit 0): tsc 0, Vitest 155 passed (21 files), production build 0 across 3160 modules, cargo check/clippy 0, cargo test 135 lib passed + 2 intentional diagnostics ignored + 3 harness passed.

## Accelerated V1 Slices D-F: controlled local memory and optional provider boundary

Source-parity packet:

- Slice: add the smallest inspectable `LocalRecordsProvider`, stale linked records after Atlas writes, and expose an optional SimpleMem health boundary plus deterministic MemoryLab fixture without making advanced memory a boot dependency.
- Atlas files inspected: `ATLAS.md`, `ATLAS_EXECUTION_PLAN.md`, `src/modules/ai/lib/transport.ts`, `src/modules/ai/tools/{tools,fs,edit,postEditDiagnostics}.ts`, `src/modules/ai/store/planStore.ts`, and `src/modules/ai/proof/{persistence,journal,index}.ts`.
- Primary evidence refreshed: official Claude Code memory documentation (`https://code.claude.com/docs/en/memory`) and the SimpleMem paper (`https://arxiv.org/abs/2601.02553`). Claude distinguishes concise project instructions from machine-local cross-session notes and treats memory as context rather than enforced configuration. SimpleMem describes semantic structured compression, recursive consolidation, and adaptive query-aware retrieval.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh memory persistence simplemem`. Outbound GitHub refresh was unavailable in the sandbox, so the resolver used cached snapshots and reported that fallback explicitly.
- opensrc inspected (cached): `aiming-lab/SimpleMem:cross/types.py`, `cross/context_injector.py`, `cross/storage_sqlite.py`, `cross/orchestrator.py`, `cross/hooks.py`, `cross/collectors.py`, `cross/tests/test_context_injector.py`, `cross/tests/test_session_lifecycle.py`, and `cross/tests/test_e2e.py`.
- opensrc inspected (cached): `mem0ai/mem0:openclaw/recall.ts`, `openclaw/filtering.ts`, `openclaw/backend/base.ts`, `openclaw/tools/memory-add.ts`, and `openclaw/tools/memory-search.ts`.
- Disposition: `ADAPT` SimpleMem-Cross's project-scoped provenance records and greedily token-budgeted context bundle into a tiny TypeScript ledger. Keep only explicit records, linked artifacts, timestamps, confidence, lifecycle status, and bounded recall.
- Disposition: `ADAPT` Mem0's inspectable add/search surface, project isolation, category tags, ranking, and pre-storage filtering. Atlas adds a stricter fail-closed secret-text guard because the local ledger must never become a credential sink.
- Disposition: `WRAP` the Tauri Store plugin already used by proof receipts. Use explicit `save()` calls, serialized writes, bounded retention, and a documented `atlas-ai-memory.json` app-data store. No database, watcher service, embedding runtime, Python install, or network call is added to the default lane.
- Disposition: `WRAP` SimpleMem behind a loopback-only health probe and a visible optional-provider status. The cached SimpleMem snapshot now includes a heavier `cross/` facade with SQLite, LanceDB, hooks, and lifecycle orchestration. Atlas rejects that stack as the V1 default and keeps it behind an adapter boundary.
- Repo-truth invariant: recalled records are historical hints only. Current repository evidence outranks memory. Atlas edits stale records whose linked source artifacts changed, and code-question answers still require current file inspection.
- MemoryLab scope: a fixed local fixture measures LocalRecords retrieval, stale-fact rejection, token cost, latency, disk-shape counts, provider dependency, privacy posture, and consolidation availability. SimpleMem and Mem0 remain visible candidates rather than implied passing providers.
- Tests required: CRUD and restart restore; project isolation; clear-project behavior; secret rejection; deterministic budgeted recall; linked-artifact stale marking; post-edit invalidation; loopback-only SimpleMem health status; MemoryLab candidate report with LocalRecords default.
- Freshness: official web evidence refreshed on 2026-06-02; upstream source used cached opensrc fallback because sandbox network refresh was unavailable.

Applied:

- Added `src/modules/ai/memory/`: the provider contract, bounded `LocalRecordsProvider`, explicit-save Tauri Store adapter, advisory context renderer, loopback-only optional SimpleMem health adapter, and deterministic MemoryLab report.
- Added inspectable main-loop memory tools for status, recall, remember, list, soft delete, clear-project, and MemoryLab. Memory mutations require approval. Read-only subagents receive only status, recall, list, and MemoryLab.
- Reused the existing post-edit lifecycle point: direct writes, direct edits, multi-edits, and accepted Plan writes now refresh optional diagnostics and stale linked local-memory records together.
- Added stale marking for external source changes through the existing global `fs:changed` listener. The native watcher continues to own delivery and CodeReality invalidation.
- Extended project-memory injection with bounded LocalRecords recall. The injected block says that historical memory is advisory and current repository evidence wins for code questions.
- Added the `memory-stale` deterministic fixture and focused regressions for restart restore, project isolation, clear-project, secret refusal, bounded recall, linked-artifact stale marking, combined post-edit observation, loopback-only SimpleMem probing, and the MemoryLab default-provider report.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, `pnpm test` 164 passed (25 files).

## Accelerated V1 Slice G: scoped local skills and bounded lifecycle hooks

Source-parity packet:

- Slice: add inspectable local skill packages and bounded in-process lifecycle hooks without turning Atlas into a general plugin runtime or allowing extensions to bypass policy.
- Atlas files inspected: `src/modules/ai/lib/snippets.ts`, `src/modules/ai/store/snippetsStore.ts`, `src/modules/ai/lib/composer.tsx`, `src/modules/ai/lib/agent.ts`, `src/modules/ai/lib/transport.ts`, `src/modules/ai/proof/{journal,recorder}.ts`, and `src-tauri/src/modules/agent.rs`.
- Primary evidence refreshed: official Claude Code skills documentation (`https://code.claude.com/docs/en/skills`), hooks reference (`https://code.claude.com/docs/en/hooks`), and hooks guide (`https://code.claude.com/docs/en/hooks-guide`). Skills require `SKILL.md` frontmatter and load instructions progressively. Hooks fire at lifecycle points; `SessionStart` must stay fast, `PreToolUse` can block before execution, and post-tool output is bounded context rather than a time machine.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh skills hooks examples`. Outbound refresh was unavailable, so the resolver used cached snapshots explicitly.
- opensrc inspected (cached): `anthropics/skills:template/SKILL.md`, `spec/agent-skills-spec.md`, and `skills/webapp-testing/SKILL.md`.
- opensrc inspected (cached): `earendil-works/pi:packages/coding-agent/docs/skills.md`, `src/core/skills.ts`, `src/core/extensions/{types,runner}.ts`, `test/skills.test.ts`, and `test/extensions-runner.test.ts`.
- Disposition: `ADAPT` Agent Skills progressive disclosure into an Atlas-local package ledger: name, description, prompt material, advisory allowed-tool subset, optional fixture, enabled state, and inspectable persistence. Preserve the existing snippet picker; packages are a separate bounded extension lane.
- Disposition: `ADAPT` Claude's lifecycle names into an in-process runner with explicit timeout, failure isolation, enable/disable state, and receipt visibility. Keep the first hook API dependency-light and callback-based. Do not execute arbitrary scripts, HTTP hooks, or MCP hooks in Slice G.
- Disposition: `REJECT` Pi's broad dynamic extension runtime for V1. Atlas skills cannot register executable tools, shortcuts, providers, or policy exceptions. An `allowedTools` list can only narrow the existing Atlas tool names and never suppress approval, native authorization, secret guards, or proof recording.
- Tests required: valid package install; invalid rejection; enable/disable/remove; tool subset cannot expand permissions; context is bounded and visible; lifecycle order; timeout; failure isolation; disabled hook inert.
- Freshness: official web evidence refreshed on 2026-06-02; upstream source used cached opensrc fallback because sandbox network refresh was unavailable.

Applied:

- Added `src/modules/ai/skills/`: a bounded local package contract, explicit-save Tauri Store registry, progressive prompt context renderer, and in-process lifecycle runner.
- Added inspectable tools for list, inspect, install, enable, disable, and remove. Skill mutations require approval. Read-only subagents receive only list and inspect.
- Skill `allowedTools` is advisory and resolved as an intersection with the existing Atlas tools. Skills cannot register executable tools, expand permissions, or suppress existing policy.
- Added `tools/lifecycle.ts` to wrap the existing Atlas tool execute functions. Enabled hooks observe actual `before_tool` and `after_tool` lifecycle points with bounded output, timeouts, and failure isolation.
- Added lifecycle receipt events through the existing `RunRecorder`; verdict and run-finish hooks execute before journal closure.
- Added focused regressions for package CRUD, invalid metadata, permission narrowing, ordered hooks, disabled hooks, timeout/failure isolation, and before/execute/after ordering.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, focused Vitest 14 passed.

## Accelerated V1 Slice H: optional disabled-by-default MCP boundary

Source-parity packet:

- Slice: add an inspectable MCP policy boundary and connector studies without making MCP part of Atlas core or attaching an unreviewed process transport.
- Atlas files inspected: `src/modules/ai/tools/{tools,skills,subagent}.ts`, `src/modules/ai/agents/runSubagent.ts`, `src/modules/ai/lib/agent.ts`, `src/modules/ai/lib/redact.ts`, and the existing memory and skill persistence adapters.
- Primary evidence refreshed: official MCP `2025-11-25` lifecycle, tools, and resources specifications (`https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle`, `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`, and `https://modelcontextprotocol.io/specification/2025-11-25/server/resources`). Initialization and capability negotiation precede normal operation. Tool clients should validate inputs, enforce access controls and timeouts, sanitize output, and expose confirmation for sensitive operations.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh mcp protocol typescript connectors`. Outbound refresh was unavailable, so the resolver used cached snapshots explicitly.
- opensrc inspected (cached): `modelcontextprotocol/typescript-sdk:docs/client.md`, `packages/client/src/client/{client,stdio}.ts`, and `packages/client/package.json`. The cached `main` snapshot is `@modelcontextprotocol/client 2.0.0-alpha.2`, so it is a study reference rather than a blindly imported runtime dependency.
- opensrc inspected (cached): `github/github-mcp-server:docs/{server-configuration,toolsets-and-icons}.md`. The server supports selective tools and toolsets, exclusions, read-only mode, lockdown mode, and scope filtering.
- opensrc inspected (cached): `microsoft/playwright-mcp:README.md`. Its own guidance distinguishes MCP persistent-state workflows from the more token-efficient CLI plus skill path for coding agents.
- Disposition: `ADAPT` the SDK's lazy connection and bounded-request posture into a small Atlas policy boundary. Persist only inert stdio configuration; default every server disabled; default every tool denied; require explicit approval for `ask`; cap calls, concurrent work, arguments, and output; and keep failures visible.
- Disposition: `STUDY` GitHub and Playwright connectors. Do not auto-enable either connector, persist credentials, spawn a process, import an alpha SDK snapshot, or add MCP resources to the prompt in Slice H.
- Tests required: disabled default, persisted registry CRUD, secret refusal, deny and ask policy enforcement, lazy invocation, timeout, crash visibility, output bounding, malformed input refusal, and connector-study defaults.

Applied:

- Added `src/modules/ai/mcp/`: inert stdio configuration contracts, explicit-save persistence, serialized registry CRUD, a bounded lazy invocation policy boundary, and inspectable connector-study records.
- MCP servers default disabled and tools default denied. Calls enforce tool-name and object-input validation, policy checks, explicit `ask` approval, concurrency limits, timeout limits, and bounded outputs.
- Added inspectable agent tools for status, list, studies, configure, enable, disable, remove, and call. All mutation and invocation tools require approval. Read-only subagents receive status, list, and studies only.
- Kept the product honest: no server process starts, no SDK dependency is added, no credentials are persisted, and the runtime boundary returns a visible deferred-transport error until a connector is explicitly adopted.
- Added focused regressions for disabled default, registry lifecycle, secret refusal, deny and ask enforcement, lazy call, timeout, crash, output bounding, malformed input, and connector-study defaults.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, focused Vitest 6 passed.

## Accelerated V1 Slice I: local metrics and compact context inspector

Source-parity packet:

- Slice: add inspectable local measurements and one compact on-demand context inspector covering reality, LSP, memory, skills, MCP, and proof without a remote telemetry exporter or background collector.
- Atlas files inspected: `src/modules/ai/proof/recorder.ts`, `store/proofStore.ts`, `tools/{context,reality,semantic,memory,mcp,tools}.ts`, `lib/native.ts`, and the existing explicit-save persistence adapters.
- Primary evidence refreshed: OpenTelemetry signals documentation (`https://opentelemetry.io/docs/concepts/signals/`) and stable metrics data model (`https://opentelemetry.io/docs/specs/otel/metrics/data-model/`). Metrics are runtime measurements. Streams are identified by metric name and attributes, and raw high-volume events should be transformed or bounded rather than exported indiscriminately.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh metrics observability context event-traces`. Outbound refresh was unavailable, so the resolver used cached snapshots explicitly.
- opensrc inspected (cached): `All-Hands-AI/OpenHands:openhands/app_server/event/event_service_base.py`. Its event service exposes independently retrievable, filterable, countable records rather than hiding activity in prose logs.
- opensrc inspected (cached): `earendil-works/pi:packages/coding-agent/test/agent-session-stats.test.ts` and `src/core/agent-session.ts`. Pi keeps compact session stats and current context usage separately from the detailed session transcript.
- Disposition: `ADAPT` OpenTelemetry's separation of measurements from detailed logs: retain detailed proof in the existing journal, record only bounded local counters and durations with low-cardinality attributes, and expose explicit local inspection. Do not add OTLP, network export, a collector, or a telemetry dependency.
- Disposition: `ADAPT` Pi's compact-stats posture into an Atlas inspector that asks existing subsystem boundaries for current state only when invoked. Repository truth remains current and memory remains advisory.
- Tests required: bounded local retention, secret refusal, low-cardinality attribute validation, explicit-save restore, recorder measurements, inspector aggregation, graceful degraded subsystem state, and bounded metric export.

Applied:

- Added `src/modules/ai/metrics/`: a bounded explicit-save local metric ledger, validation for low-cardinality secret-free attributes, and a compact on-demand inspector.
- The existing proof recorder emits local `run.started`, `tool.completed`, `run.duration`, and `run.completed` measurements. Detailed action payloads remain in proof receipts rather than metric attributes.
- Added inspectable `metrics_status`, bounded `metrics_export`, and `context_inspector` tools. The inspector asks existing reality, LSP, memory, skill, MCP, and proof boundaries for current state only when invoked.
- Inspector sections degrade independently. Optional-provider failures stay visible without breaking the rest of the snapshot.
- No collector, OTLP exporter, network call, dependency, background watcher, or boot-time work was added.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, focused Vitest 12 passed.

## Accelerated V1 Slice J: scripted evals and release qualification

Source-parity packet:

- Slice: finish the V1 queue with executable eval, desktop-contract smoke, dependency review, CI qualification steps, a golden fixture, and an honest release report.
- Atlas files inspected: `scripts/verify-atlas.sh`, `.github/workflows/{ci,release}.yml`, `package.json`, `src-tauri/{Cargo.toml,tauri.conf.json,src/lib.rs}`, `tests/fixtures/README.md`, and `src/modules/ai/components/AiMiniWindow.tsx`.
- Primary evidence refreshed: official Tauri v2 testing documentation (`https://v2.tauri.app/develop/tests/`) and GitHub Actions matrix documentation (`https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs`). Tauri documents unit and mock-runtime testing, plus WebDriver support on Linux and Windows; desktop WebDriver is not available on macOS because WKWebView has no driver tool.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh eval workflow validation release desktop smoke fixture`. Outbound refresh was unavailable, so the resolver used cached snapshots explicitly.
- opensrc inspected (cached): `SWE-agent/mini-swe-agent:tests/environments/test_local.py` and `tests/run/test_local.py`. It preserves structured command return codes and runs a deterministic model trajectory against a real local environment.
- opensrc inspected (cached): `earendil-works/pi:.github/workflows/ci.yml`. It keeps a conventional install, build, check, and test gate in CI.
- opensrc inspected (cached): `tauri-apps/tauri:crates/tauri/src/test/{mod,mock_runtime}.rs`, `crates/tauri/test/fixture/`, and `.github/workflows/test-core.yml`. Tauri keeps small fixtures and layered native tests rather than pretending one UI automation layer proves every platform.
- Disposition: `ADAPT` mini-SWE-agent's deterministic real-environment posture into a tiny golden repository: first prove the narrow test fails, make the expected one-line correction in a temp copy, prove the test passes, and report definition/reference evidence.
- Disposition: `ADAPT` Tauri's layered qualification posture: keep Rust and frontend checks, add a static desktop-contract smoke on every host, preserve the existing native OS matrix, and publish a manual interactive desktop checklist. Do not claim automated macOS WKWebView interaction.
- Dependency review: compare direct runtime manifests against a checked-in approved release baseline so shallow CI clones remain deterministic. The reviewed accelerated-queue delta is Rust `url = "2"` from lazy LSP URL handling. It is already transitive in the desktop graph and adds no boot service.
- Tests required: golden fail-then-fix pass, one-line correction, definition/reference evidence, desktop contract assertions, dependency delta allow-list, CI invocation, and `verify-atlas.sh --all` coverage.

Applied:

- Replaced the `--desktop` and `--eval` placeholders in `scripts/verify-atlas.sh` with executable checks, added `--deps`, and included all three in `--all`.
- Added `tests/fixtures/golden-v1/` and `scripts/run-v1-evals.mjs`. The script copies the intentionally buggy fixture into a temp directory, proves the narrow test exits `1`, applies one line, proves the same test exits `0`, and reports definition/reference evidence.
- Added `scripts/desktop-smoke.mjs`. It verifies the Tauri build contract, core native commands, registered subsystem tool lanes, and mounted proof receipt without claiming unavailable macOS WKWebView automation.
- Added `tests/fixtures/release-v1/dependency-baseline.json` and `scripts/review-dependencies.mjs`. The release baseline is clone-local and shallow-CI safe. It fails on unreviewed direct runtime dependency drift.
- Added `scripts/release-qualify.sh`, CI qualification steps, and `RELEASE_QUALIFICATION.md` with the manual interactive desktop checklist and platform limits.

Measured verification on macOS:

- `git diff --check` 0.
- `bash scripts/verify-atlas.sh --eval` passed in `2.20s`: golden narrow test exit `1 -> 0`, one-line correction, one definition and one reference.
- `bash scripts/verify-atlas.sh --desktop` passed in `1.37s`: static desktop contract on `darwin`; interactive macOS automation remains manual because WKWebView has no WebDriver.
- `bash scripts/verify-atlas.sh --deps` passed: `81` frontend and `32` Rust direct runtime dependencies match the approved baseline; Rust `url` is reviewed and already transitive.
- Clean-shell `bash scripts/release-qualify.sh` passed: TypeScript 0, Vitest `180` passed, production build `3188` modules, Cargo check 0, Clippy 0, Rust `135` passed plus `2` intentional diagnostic ignores, fixture harness `3` passed, eval passed, desktop contract passed, dependency review passed.

## Post-V1 corrective program: real coding-harness adapters

Source-parity packet:

- Trigger: the accelerated V1 proved a trustworthy desktop shell, but its optional-provider surfaces remain deliberately narrow. The next program converts the strongest stubs into real adapters without replacing the Atlas core or inventing blank-page subsystems.
- Launch probe on `2026-06-02`: `PATH="$HOME/.nvm/versions/node/v22.16.0/bin:$HOME/.cargo/bin:/usr/bin:/bin" pnpm tauri dev` built and launched `target/debug/atlas`. It also exposed two release blockers: Tauri Rust `2.11.2` is ahead of `@tauri-apps/api` `2.10.1`, and the configured updater endpoint did not return a successful response.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh memory simplemem evolvemem lsp semantic aider repomap graph mcp benchmark desktop`. The resolver authenticated through the GitHub CLI keyring and refreshed the curated cache paths.
- Primary documentation refreshed: official LSP `3.17` specification; Aider repository-map documentation; MCP TypeScript SDK V1 documentation; MCP transport documentation; SimpleMem upstream README and Cross README.
- opensrc inspected: `aiming-lab/SimpleMem:cross/{README.md,api_http.py,orchestrator.py,session_manager.py,context_injector.py,types.py}`, `Aider-AI/aider:aider/repomap.py`, `DeusData/codebase-memory-mcp:README.md`, `modelcontextprotocol/typescript-sdk:docs/{client,server}.md`, and `microsoft/language-server-protocol:_specifications/lsp/3.17/specification.md`.
- SimpleMem finding: Atlas currently probes `GET /health`, but the upstream Cross HTTP app mounts its complete API at `/cross/*`. The real upstream surface includes session start, message/tool recording, stop, end, search, stats, and health. Atlas must wrap that contract through an explicit loopback-only provider and retain LocalRecords as the offline default.
- LSP finding: Atlas owns a real lazy JSON-RPC lifecycle, but diagnostics are enabled only for TypeScript. The next LSP slice generalizes request handling and provider capabilities before exposing definitions, references, document symbols, workspace symbols, hover, and multi-language diagnostics.
- Repo-map finding: Atlas owns official Tree-sitter extraction and bounded projections, but not Aider ranking parity. The next reality slice ports the measured file graph ranking behavior and compares selective graph quality against `codebase-memory-mcp`.
- MCP finding: Atlas owns the disabled-by-default policy boundary, but no transport. The next MCP slice wraps a pinned stable SDK path or a native-equivalent process boundary with conformance tests; it does not hand-roll a new protocol.
- Qualification finding: the static desktop smoke remains useful but is not an interactive desktop proof. Add external benchmark sample adapters and click-driven host qualification where the platform supports it.
- Performance rule: all new providers remain lazy, bounded, opt-in, inspectable, and independently degradable.

Corrective execution order:

1. Replace the SimpleMem health-only stub with a real optional Cross HTTP adapter and focused fake-sidecar tests.
2. Generalize the existing LSP client and expose semantic requests across registered providers.
3. Add Aider-style repo-map ranking parity tests and selective graph comparison.
4. Attach a real pinned MCP transport adapter behind the existing disabled policy boundary.
5. Add external benchmark samples and interactive desktop qualification evidence.

## Corrective Slice C1: real optional SimpleMem Cross adapter

Source-parity packet:

- Slice: replace the health-only candidate stub with the smallest real adapter over upstream SimpleMem Cross HTTP, keeping all advanced-memory work optional and independently degradable.
- Atlas files inspected: `src/modules/ai/memory/{index,contracts,localRecords,memoryLab,persistence,simpleMem}.ts`, `src/modules/ai/tools/memory.ts`, `src/modules/ai/lib/{agent,transport}.ts`, and `src/modules/ai/store/statusStore.ts`.
- opensrc inspected: `aiming-lab/SimpleMem:cross/{README.md,api_http.py,orchestrator.py,session_manager.py,context_injector.py,types.py}` and `cross/tests/test_session_lifecycle.py`.
- Upstream contract adapted: `GET /cross/health`, `POST /cross/sessions/start`, message, tool-use, stop, end, `POST /cross/search`, and `GET /cross/stats`. Upstream stop runs observation extraction, optional SimpleMem pipeline finalization, and summary persistence. Atlas wraps that lifecycle; it does not recreate the Python provider.
- Security posture: accept only credential-free loopback HTTP endpoints, bound outbound text and response bytes, refuse recognized secret material before network calls, require explicit approval for sidecar configuration, search, and write-and-retrieve probe, and preserve LocalRecords as the default offline ledger.
- Context posture: sidecar run recording starts lazily only when enabled. Prior sidecar context remains advisory and is injected only when the separately persisted `injectContext` switch is explicitly enabled. Current repository evidence remains authoritative.
- MemoryLab posture: add an explicit probe that records one isolated marker session, finalizes it, searches for the marker, reads aggregate stats, and reports retrieval observation. It reports stale-fact invalidation and consolidation false-merge gates as unsupported until a provider contract and seeded benchmark exist.
- Tests required: disabled boot, corrected `/cross/health` path, complete lifecycle routing, secret refusal before fetch, invalid JSON failure, inert persisted config, normalized loopback origin, remote endpoint refusal, observer context and idempotent finalization, unbound-project inactivity, measured probe, and absent-sidecar degradation.

Applied:

- Replaced `simpleMem.ts` with a loopback-only bounded Cross HTTP adapter covering health, lifecycle, search, and stats.
- Added `simpleMemConfig.ts`: explicit-save opt-in config with separate `enabled` and `injectContext` switches.
- Added `simpleMemObserver.ts`: lazy turn-level start, user-message and tool-event recording, advisory prior-context rendering, and idempotent stop/end finalization. Failures are swallowed by the transport boundary so the default agent loop keeps working.
- Added `simpleMemLab.ts`: an approval-gated write-and-retrieve marker probe with honest unsupported-gate reporting.
- Added `memory_simplemem_configure`, `memory_simplemem_search`, `memory_simplemem_stats`, and `memory_simplemem_probe` agent tools.
- Updated the CodeReality status probe to read persisted provider configuration while continuing to hide disabled-sidecar noise.
- Added focused adapter, config, observer, and probe regressions.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, Vitest `204` passed across `38` files.

Full clean-shell qualification: `scripts/release-qualify.sh` exit `0`; TypeScript 0, Vitest `204` passed across `38` files, production build `3195` modules, Cargo check 0, Clippy 0, Rust `135` passed plus `2` intentional diagnostic ignores, fixture harness `3` passed, golden eval passed, desktop contract smoke passed, and dependency review passed. Existing Rollup circular-chunk warnings remain visible and unchanged.

## Corrective Slice C2: multi-language semantic LSP client

Source-parity packet:

- Slice: generalize the existing lazy native LSP client instead of adding a second semantic runtime.
- Atlas files inspected: `src-tauri/src/modules/lsp{.rs,/client.rs}`, `src-tauri/src/lib.rs`, `src/modules/ai/lib/native.ts`, `src/modules/ai/tools/semantic.ts`, `src/modules/ai/agents/registry.ts`, and `scripts/desktop-smoke.mjs`.
- opensrc hook: ran `PNPM_CONFIG_OFFLINE=true bash scripts/consult-opensrc.sh lsp semantic diagnostics definitions references hover symbols opencode`; authenticated refresh resolved OpenCode, Serena, the official LSP repository, TypeScript Language Server, Pyright, rust-analyzer, Helix, Zed, Lapce, and VS Code.
- Primary documentation refreshed: official LSP `3.17` specification capability model and request methods for hover, definition, references, document symbols, and workspace symbols.
- opensrc inspected: `anomalyco/opencode:packages/opencode/src/lsp/{lsp,client,server}.ts`; `microsoft/language-server-protocol:_specifications/lsp/3.17/specification.md`; and `typescript-language-server:README.md`.
- Host probe: `rust-analyzer` resolves from `$HOME/.cargo/bin` and `clangd` resolves from `/usr/bin`; TypeScript Language Server and Pyright are absent on this host. Atlas must degrade per provider and must not install servers implicitly.
- Disposition: `ADAPT` OpenCode's extension routing, one lazy client per provider/root, shared open-document state, bounded request posture, and failure isolation. `WRAP` the official LSP JSON-RPC methods through Atlas's existing process client. `REJECT` server auto-install, server download, an additional JSON-RPC dependency, and unbounded result injection.
- Tests required: provider routing across new language families, generic request framing, document synchronization before semantic requests, bounded result behavior, graceful unavailable provider state, and desktop-contract registration.

Applied:

- Extended the existing provider registry to TypeScript/JavaScript, Python, Rust, C/C++, Java, HTML, CSS, and JSON adapters. Every adapter remains optional, executable-detected, lazy, and independently degradable.
- Generalized the native client with bounded `textDocument/definition`, `textDocument/references`, `textDocument/documentSymbol`, `workspace/symbol`, and `textDocument/hover` requests on the existing initialized process.
- Preserved the existing document synchronization and diagnostics cache. Semantic arrays cap at `200` items and all semantic results cap at `64 KiB`.
- Added the authorized `agent_lsp_semantic` native command, frontend bridge, desktop-contract assertion, and selective `lsp_definition`, `lsp_references`, `lsp_hover`, `lsp_document_symbols`, and `lsp_workspace_symbols` agent tools.
- Generalized post-edit diagnostic refresh across the registered language families. Missing servers stay non-fatal and visible.
- Added deterministic provider-routing, parameter-validation, result-bounding, and Unix socket fake-server tests.
- Added an ignored host-qualification smoke and ran it explicitly: Atlas spawned `/usr/bin/clangd`, initialized the server, opened a C++ file, received non-empty document symbols, and shut the process down cleanly in `1.62s`.

Focused verification: `git diff --check` 0, `pnpm exec tsc --noEmit` 0, Vitest `204` passed across `38` files, focused LSP Rust tests `12` passed plus `1` intentional host smoke ignored by default, explicit installed-`clangd` smoke passed, and Clippy 0.

Full clean-shell qualification: `scripts/release-qualify.sh` exit `0`; TypeScript 0, Vitest `204` passed across `38` files, production build `3195` modules, Cargo check 0, Clippy 0, Rust `139` passed plus `3` intentional diagnostic or host-smoke ignores, fixture harness `3` passed, golden eval passed, desktop contract smoke passed, and dependency review passed. Existing Rollup circular-chunk warnings remain visible and unchanged.
