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
