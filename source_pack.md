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
