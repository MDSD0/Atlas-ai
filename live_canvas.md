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

## Feature slice status: shared project/session binding flow

Done. One shared flow, three entry points.

- `src/modules/workspace/projectFlow.ts` (new): `openProjectFromDialog`, `openProjectFromPath`, `startUnboundSession`, `switchToProject`, `listKnownProjects`. All bind workspace then create/switch a project-bound session; switching restores the bound workspace via the existing `switchSession` path.
- Composer project chip (`ProjectChip.tsx`, new) in the AiInputBar toolbar: existing projects, "Add project (open folder)", "Don't work in a project" (unbound).
- Explorer header: added an "Open project" folder-open icon. No-folder and broken-workspace states route through the shared flow; broken state now offers Locate folder / Open unbound copy / Remove.
- Welcome screen: open-folder and open-recent now go through `projectFlow` (already created a session before; now DRY).
- Unbound fail-closed: extracted `checkMutationAllowed` in `context.ts`; `write_file`, `create_directory`, `edit`, `multi_edit` use it. Slice 1.6 tightens unbound sessions further: chat remains available, but model-driven filesystem access requires an explicitly selected project.

Did NOT repurpose the vague progress/grid icons (they are agent-panel dock toggles, not project/folder).

Green (clean shell): tsc 0, vitest 112 passed (12 files; +2 unbound-guard tests), verify-atlas --fast OK.

User-verify (GUI, ~3 min): composer chip open-folder; sidebar "Open project" icon; welcome "Open Folder"; ask agent "Create TODO.md" while Unbound (must refuse); open Project A, switch to a Project B session, confirm explorer + branch chip follow.

## Feature slice status: approval modes + auto-run safe shell

Done. Policy classifier, not a pipeline: the model calls any tool freely; the classifier only decides whether the call needs an approval PROMPT. Deny decisions (dangerous-command circuit breaker, secret deny-list, native out-of-workspace) live in execute/Rust and are NEVER skipped by any mode.

- `src/modules/ai/lib/permissions.ts` (new, pure): `ApprovalMode` (default / acceptEdits / full), `isAutoRunShell` (single safe read-only/open command, no shell operators), `editNeedsApproval`, `shellNeedsApproval`.
- chatStore: active-session `approvalMode` (default), `setApprovalMode`; resets to default on `newSession` and `switchSession`. Exposed to tools via `ToolContext.getApprovalMode`.
- Tools: `write_file`, `create_directory`, `edit`, `multi_edit` use `needsApproval: () => editNeedsApproval(mode)`; `bash_run`, `bash_background` use `needsApproval: ({command}) => shellNeedsApproval(command, mode)`. AI SDK v6 supports the function form (verified in provider-utils types).
- UI: `AccessChip.tsx` in the composer (Ask / Accept edits / Full access; Full access is amber + risky-flagged).
- Safe shell auto-run is deliberately narrow: no-argument `pwd` / `date` / `whoami`, current-directory `ls` flags, safe `git status` flags, and one simple relative `open` target such as `index.html`. Everything else still works through approval.

Default = Ask (chosen). Access mode resets on new or switched sessions. The model picking `suggest_command` over running is a model issue, unchanged by design.

Green (clean shell): tsc 0, vitest 119 passed (13 files; +7 permission tests), verify-atlas --fast OK.

User-verify (GUI): composer "Access" chip switches Ask/Accept edits/Full access; in Full access a command runs without a prompt; `rm -rf /` is still blocked in Full access (circuit breaker); a new session resets to Ask.

## Slice 1.2 status: fail-closed workspace binding (S1)

Done.

- `setWorkspaceRoot()` now treats rejected native `workspaceAuthorize()` calls as failed trust transitions. It does not mutate the bound project or recents until native authorization succeeds.
- The frontend keeps the selected logical workspace path after authorization. This is intentional for WSL: Rust canonicalization may return a host UNC or drive path while the shell and workspace UI still need the logical WSL path.
- Welcome, explorer, and sessions folder-opening surfaces display a readable authorization error.
- Cross-project session restore authorizes the destination before disposing panes, so a denied switch preserves the current workspace. The fallback restore path catches errors instead of leaving an unhandled rejection.
- Added store-level coverage proving delayed authorization cannot mutate state early and rejected authorization preserves the previous binding plus recents.

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 93 passed (9 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Environment note: macOS `trustd` / `syspolicyd` temporarily delayed fresh Node startup during the serialized run. Node 22.16 recovered without a project change.

Next: Slice 1.3 platform-aware path containment (S1).

## Accelerated V1 Slice A status: selective reality tools and truthful receipts

Implemented.

- Kept the M2-V CodeReality snapshot as the only repository inventory. Narrow tools now expose status, bounded maps, exact symbols, references, and impact candidates without adding an index.
- Added an optional semantic-provider boundary for TypeScript, Python, and Rust. It reports executable availability honestly and does not start a language server yet.
- Added a verification planner that suggests commands but cannot count suggestions as proof.
- Tightened receipts: only successful foreground shell checks count as verified. Nonzero exits and timeouts fail; runs without a successful check remain `incomplete`.
- Preserved read-only subagent isolation while giving subagents the new selective tools.

Next: Accelerated V1 Slice B lazy LSP process lifecycle, initialize handshake, file synchronization, and TypeScript diagnostics.

## Accelerated V1 Slice B status: lazy TypeScript diagnostics lifecycle

Implemented.

- Added a lazy native JSON-RPC client around an installed `typescript-language-server --stdio`.
- App boot and repository tools stay independent of LSP health. A server starts only when the agent calls `lsp_diagnostics` for a TypeScript-family file.
- The client performs initialize, initialized, didOpen/didChange, bounded publish-diagnostics waiting, and shutdown/exit.
- Status is inspectable: available, connected, unavailable, broken, fresh, cached, or pending states stay explicit.
- Python and Rust providers remain visible but their diagnostic adapters are deferred rather than implied.

Next: Accelerated V1 Slice C post-edit diagnostic refresh and proof-receipt attachment.

## Accelerated V1 Slice C status: post-edit semantic receipts

Implemented.

- Successful TypeScript-family writes now request optional diagnostics after the mutation.
- Unsupported files return `not_applicable`; missing or broken semantic providers remain visible and non-fatal.
- Direct mutation outputs carry the semantic envelope, and delayed Plan Mode writes refresh the same cache after acceptance.
- The existing proof recorder attaches bounded semantic summaries to verdicts and the compact receipt strip.
- No second agent loop, boot service, or required LSP dependency was added.

Next: Accelerated V1 Slice D LocalRecords memory provider.

## Slice 1.3 status: platform-correct path containment (S1)

Done.

- Removed unconditional lowercase comparison from the frontend project boundary.
- Canonical native paths now compare case-exactly. This follows filesystem-resolved reality and stays correct for Linux, case-sensitive APFS, Windows per-directory sensitivity, and WSL Linux paths.
- Raw Windows drive and UNC input still normalize separators while walking upward to a canonical existing ancestor for new-file checks.
- Unix backslashes remain legal filename characters and are never reinterpreted as separators during canonical comparison.
- Added eight regressions covering case variants, Unix backslash siblings, raw-prefix siblings, macOS canonical behavior, Windows drive paths, UNC paths, missing Windows descendants, and traversal.

Green (clean shell final `verify-atlas.sh --all`): tsc 0, vitest 101 passed (9 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Next: Slice 1.4 real stale-edit fingerprint rejection (S1).

## Slice 1.4 status: real stale-edit fingerprint rejection (S1)

Done.

- Added a shared UTF-8 fingerprint utility so native byte sizes and frontend cache sizes use one representation, including non-ASCII content.
- Direct `edit` and `multi_edit` reread immediately before replacement and refuse with `code: "stale_read"` when the file changed after the prior agent read.
- Plan Mode carries the reviewed source fingerprint and revalidates before delayed apply, so queued approvals cannot overwrite external work silently.
- Added five regressions for external edits, non-ASCII content, binary refusal, queued stale rejection, and queued fresh acceptance.

Green (clean shell `verify-atlas.sh --all`): tsc 0, vitest 106 passed (11 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

## Slice 1.5 status: serialize same-file mutations (S1)

Done.

- Added a canonical-path-keyed promise queue for direct edits, direct full-file writes, and delayed Plan Mode writes.
- Alias paths serialize against the same native-canonical key; new files use the already-resolved target path until they exist.
- Different files remain parallel and rejected operations release the next waiter.
- Added four queue regressions for same-key ordering, canonical aliases, cross-file parallelism, and rejection release.
- Hardened the approval-mode shell shortcut after source refresh: only fully bounded safe command shapes auto-run. Secret reads, wrappers, mutation flags, and compounded commands prompt.

Green (clean shell final combined `verify-atlas.sh --all`): tsc 0, vitest 121 passed (13 files), build 0, cargo check/clippy 0, cargo test 106 lib + 3 harness = 109.

Next: Slice 1.6 native secret-path deny-list.

## Slice 1.6 status: native agent project and secret-path boundary (S5)

Done.

- Added a separate native `agent_fs_*` lane for model filesystem IO. Explicitly selected projects are tracked independently from app-authorized roots, so agent tools do not inherit bootstrapped home or launch-directory access.
- Enforced native sensitive-path refusal after canonicalization for reads, writes, creates, directory listings, grep, and glob. Manual editor/explorer `fs_*` IO remains usable for user-driven `.env` work.
- Switched built-in model tools, Plan Mode delayed writes, and ATLAS project-memory reads to the `agentNative` facade.
- Unbound chat sessions now refuse model-driven filesystem reads and searches as well as mutations.
- Added native and frontend regressions for app-vs-agent root separation, `.env`, protected parents, symlink-to-secret paths, recursive filtering, and unbound reads.

Green (clean shell final `verify-atlas.sh --all`): tsc 0, vitest 123 passed (13 files), build 0 across 3148 modules, cargo check/clippy 0, cargo test 115 lib + 3 harness = 118.

Known limitation: this is a model-IO trust lane, not a sandbox for compromised trusted webview JavaScript. Tauri custom commands cannot distinguish the JavaScript call site inside one webview.

Next: Phase 2 Slice 2.1 minimal event journal and proof receipt foundation.

## Slice 2.1 status: durable proof-journal contracts

Done.

- Added provider-independent run, event, artifact, and verdict contracts under `src/modules/ai/proof/`.
- Wrapped the existing Tauri Store plugin behind a tiny persistence interface and explicit `save()` calls. No database, Rust subsystem, dependency, watcher, or boot service was added.
- Added serialized repository mutations, ordered event sequences, SHA-256 content hashes, stable artifact IDs, restart restore, final verdict persistence, bounded UTF-8 previews, bounded retention, and dropped-item counters.
- Kept instrumentation out of this slice. Tool and lifecycle hooks enter in Slice 2.2.
- Added six focused regressions for ordered concurrent append, multibyte truncation, restart restore, cancelled verdict, stable artifact updates, and run/event/artifact caps.

Green (clean shell final `verify-atlas.sh --all`): tsc 0, vitest 129 passed (14 files), build 0 across 3148 modules, cargo check/clippy 0, cargo test 115 lib + 3 harness = 118.

Next: Phase 2 Slice 2.2 hard hooks around the existing tool runtime.

## Slice 2.2 status: hard hooks around the existing tool runtime

Done (committed 590967a). No second tool runtime: the recorder observes the existing streamText loop.

- proof/recorder.ts: RunRecorder maps run start / per-tool result / finish onto the journal. Events keyed lane.tool.ok|failed; {error} results become .failed events + unresolvedFailures (structured, not strings); successful mutations add changed_file artifacts; shell commands populate checks; verdict cancelled>failed>passed; idempotent finish.
- agent.ts: onToolResult observation callback from onStepFinish (toolResults matched to toolCalls by id).
- transport.ts: owns run lifecycle (start at turn boundary; finish on finishReason resolve, abort=cancelled, throw=errored); all recorder calls guarded so journal failure never blocks the agent.
- proof/recorder.test.ts: 4 tests (full trace+passed+artifact+checks; failed visible; cancelled+idempotent; bounded shell summary).

## Slice 2.3 status: minimal proof UI

Done. The durable receipts are now visible.

- proof/recorder.ts: synchronous ReceiptSummary + onUpdate (start/tool/finish), from state already tracked; no journal reload for render.
- store/proofStore.ts: zustand latestBySession; transport recorder pushes via onUpdate.
- components/ReceiptStrip.tsx: compact strip under TodoStrip in AiMiniWindow - verdict (colour+icon), action count, changed files (click-through via optional onOpenFile), checks, failures kept expanded. Pure shouldShowReceipt gate extracted + unit-tested (repo has no jsdom; thin component, pure-tested logic).
- components/receiptStrip.test.ts: 3 tests (hide empty running, show once active, always show finished verdict).

Green (clean shell verify-atlas.sh --all): tsc 0, vitest 136 passed (16 files), build 0, cargo check/clippy 0, cargo test 115 + 3 harness.

Phase 2 complete (event journal + hard hooks + proof UI). Next: Phase 3 Slice 3.1 shared repository ignore policy (CodeReality V0).

## Accelerated V1 Slices D-F status: controlled memory batch

Done.

- LocalRecords remains the default: app-data JSON through the existing Tauri Store plugin, explicit saves, bounded records, no boot work, no Python, no embeddings, and no network.
- Memory is advisory context only. Current repository evidence outranks recalled records.
- Linked source artifacts stale their records after successful Atlas writes, including delayed Plan writes.
- SimpleMem stays optional behind a loopback-only health probe. Atlas never installs or starts it implicitly.
- MemoryLab starts with a deterministic local fixture and reports advanced providers as candidates until they produce measured results.

Next: Accelerated V1 Slice G scoped skill packages and bounded lifecycle hooks.

## Accelerated V1 Slice G status: scoped skills and lifecycle hooks

Done.

- Local skill packages are prompt-only, persisted, inspectable, and approval-gated for mutation.
- A skill can narrow its suggested Atlas tools but cannot register tools or expand permissions.
- In-process lifecycle hooks are bounded, timeout-isolated, failure-isolated, and recorded through the existing proof journal.

Next: Accelerated V1 Slice H optional MCP boundary.

## Accelerated V1 Slice H status: optional MCP policy boundary

Done.

- MCP is an optional, inert local configuration lane. Servers default disabled, tools default denied, calls are bounded, and credentials are refused from persisted config.
- GitHub and Playwright remain connector studies only. Nothing auto-installs, starts, or expands prompt context.
- The first process transport adapter is deliberately deferred until a connector is explicitly adopted against a stable SDK release.

Next: Accelerated V1 Slice I local metrics and compact context inspector.

## Accelerated V1 Slice I status: local metrics and context inspector

Done.

- Local metrics record bounded run and tool measurements with low-cardinality secret-free attributes. Detailed actions stay in proof receipts.
- The compact inspector reads reality, LSP, memory, skills, MCP, and latest proof state only when invoked. Optional failures remain visible as degraded sections.
- Metrics stay local and explicit: no exporter, collector, network dependency, or background service.

Next: Accelerated V1 Slice J release qualification.

## Accelerated V1 Slice J status: release qualification

Done.

- `verify-atlas.sh --all` now includes deterministic golden eval, desktop contract smoke, and approved dependency review after the existing frontend, build, and Rust gates.
- The golden fixture proves the narrow bug-fix path with real command exits `1 -> 0` in a temp copy.
- CI runs eval, desktop contract smoke, and dependency review. Existing native CI continues to compile Ubuntu, macOS, and Windows.
- This macOS host passes every automated gate. Interactive desktop qualification remains a manual release checklist on all three platforms; Tauri documents no WKWebView WebDriver path for macOS.

Accelerated V1 queue `A-J`: complete.

## UI/UX polish 1: receipt noise + CodeReality panel

Locked thesis: Atlas is a repo-grounded coding harness (CodeReality + tiny verification receipt + SimpleMem-behind-provider). UI work = make the existing brain visible, not build a cockpit.

- ReceiptStrip: a receipt is now evidence of actions. `shouldShowReceipt` hides any run with zero events/changes/checks/diagnostics/failures regardless of status, killing the "Incomplete - 0 actions" noise on pure-chat turns. Tests updated.
- CodeRealityPanel (new sidebar view "Reality"): renders the native projection - files indexed, symbols (defs/refs), ignored dirs, and context saving (projected vs naive tokens) - plus freshness, watch status, degraded parses, truncation. Re-index button. Pure formatRealityStats/freshnessLabel helpers unit-tested.
- realityStore: on-demand fetch keyed to workspaceRoot, stale-response guard.
- Wired into SidebarRail (Files | Reality | Source Control | Sessions) + App.tsx view switch + persisted view guard.

Data was already produced by the native agent_reality_context; this exposes it. No new backend.

Green (clean shell verify-atlas.sh --all): tsc 0, vitest 186 passed (34 files), build 0, cargo check/clippy 0, cargo test 135 + 3 harness.

Next UI: diff-review accept/reject polish, honest status chips (LSP TS-only, Memory local). Then the fixture go/no-go measurement (key-file recall, wrong-file edits, token saving).

## UI/UX polish 2: honest capability chips in CodeReality

- statusStore: probes real LSP providers (agent_lsp_status) + SimpleMem health on demand, keyed to workspace.
- statusChips.ts (pure, tested): lspChips reports each language server on/off/broken from its native probe (never claims "on" for discovered-but-not-running); memoryChips always shows local memory active, shows SimpleMem only when enabled (on if health passed, off/warn if unreachable, hidden if disabled/opt-in-not-started).
- CodeRealityPanel footer renders the chips. Directly + honestly answers "is LSP working?" and "is SimpleMem working?" - chosen home over the composer to avoid chip clutter.

Also fixed panel label honesty: "Files indexed" -> "Files scanned" (file_count includes unparsed binary/large/unsupported); hint now reports parse_failures.

Green (clean shell verify-atlas.sh --all): tsc 0, vitest 193 passed (35 files), build 0, cargo check/clippy 0, cargo test 135 + 3 harness.

Verified panel renders in-app (user screenshot): 5 files / 98 symbols / 95% context saving on a small folder - numbers confirmed accurate against the Rust projection source.

## UI/UX polish 3: honest diagnostics chips (indexing vs LSP)

User confusion ("typescript: off, rust: on - does it not index TS?") exposed two honesty bugs:
- The chips conflated INDEXING (tree-sitter: ts/tsx/js/py/rust, all working - 26,823 symbols on the Atlas repo) with LSP DIAGNOSTICS (separate optional accelerator).
- "rust: on" overclaimed: rust-analyzer/pyright are detected on PATH but have diagnostics_enabled=false, so Atlas does not actually deliver their diagnostics. Only typescript is wired. Status was set purely on binary-found, ignoring diagnostics_enabled.

Fix:
- lsp.rs: LspProviderInfo now carries diagnostics_enabled (sourced from the provider table).
- statusChips: a provider reads "on" only when live AND diagnostics_enabled; installed-but-deferred reads "detected" (muted), missing "off", broken "broken". Prefix changed to "diag <lang>:" so it cannot be mistaken for indexing.
- CodeRealityPanel footer now states "indexes ts · tsx · js · py · rust · diagnostics are separate" to make the distinction explicit.

So on the Atlas repo the honest reading is: indexing covers TS+Rust (working); diagnostics are TS-only (typescript-language-server not installed here -> off), rust-analyzer detected-but-deferred.

Green (clean shell verify-atlas.sh --all): tsc 0, vitest 194 passed (35 files), build 0, cargo check/clippy 0, cargo test 135 + 3 harness (incl. 8 lsp tests).

## Post-V1 corrective Slice C1 status: real optional SimpleMem Cross adapter

Done at the frontend layer; full release qualification follows before checkpoint.

- Replaced the misaddressed `/health`-only candidate stub with a real loopback-only adapter over upstream `/cross/*`.
- Added opt-in persisted sidecar configuration with separate `enabled` and `injectContext` switches. LocalRecords remains the offline default.
- Agent turns lazily start SimpleMem sessions only when enabled, record bounded prompt/tool events best-effort, optionally inject bounded advisory context, and finalize through stop/end.
- Added approval-gated SimpleMem configuration, search, and write-and-retrieve MemoryLab probe tools plus read-only aggregate stats.
- The MemoryLab probe is intentionally honest: it measures one isolated marker lifecycle and retrieval sample, then reports stale-fact invalidation and consolidation false-merge gates as unsupported until the provider exposes and passes those contracts.
- Launch probe found two release blockers outside this slice: Tauri JS API `2.10.1` vs Rust crate `2.11.2`, and the configured updater endpoint currently returns an unsuccessful response.

Green (clean shell `release-qualify.sh`): `git diff --check` 0, tsc 0, Vitest `204` passed (38 files), build 0 across `3195` modules, cargo check/clippy 0, cargo test `135 + 3` with `2` intentional diagnostic ignores, golden eval passed, desktop contract smoke passed, dependency review passed.

Next: corrective Slice C2 multi-language semantic LSP client.

## Post-V1 corrective Slice C2 status: multi-language semantic LSP client

Done at focused-check layer; full release qualification follows before checkpoint.

- Reused the existing lazy native JSON-RPC process client for definitions, references, hover, document symbols, workspace symbols, and diagnostics.
- Registered optional providers for TypeScript/JavaScript, Python, Rust, C/C++, Java, HTML, CSS, and JSON. Atlas detects executables but never installs or starts a server at boot.
- Generalized post-edit diagnostics across registered language families; a missing provider remains visible and non-fatal.
- Semantic arrays cap at `200` items and all semantic result payloads cap at `64 KiB`.
- Added selective agent tools: `lsp_definition`, `lsp_references`, `lsp_hover`, `lsp_document_symbols`, and `lsp_workspace_symbols`.
- Deterministic fake-server tests prove initialize, didOpen-before-definition, bounded results, diagnostics, and shutdown.
- Explicit host qualification passed against installed `/usr/bin/clangd`: real initialization, C++ document open, non-empty document-symbol result, and clean shutdown in `1.62s`.

Focused green: `git diff --check` 0, tsc 0, Vitest `204` passed (38 files), focused Rust LSP `12` passed plus `1` intentional host smoke ignored by default, explicit installed-`clangd` smoke passed, clippy 0.

Green (clean shell `release-qualify.sh`): tsc 0, Vitest `204` passed (38 files), build 0 across `3195` modules, cargo check/clippy 0, cargo test `139 + 3` with `3` intentional diagnostic or host-smoke ignores, golden eval passed, desktop contract smoke passed, dependency review passed.

Next: corrective Slice C3 Aider-style repo-map ranking parity and selective graph quality measurement.

## Post-V1 corrective Slice C3 status: Aider-style repo-map ranking

Done at focused-check layer; full release qualification follows before checkpoint.

- Added a deterministic dependency-free weighted file graph ranker over the existing Tree-sitter snapshot, adapted from Aider's repository map implementation.
- Direct task matches still protect obvious files. Graph rank adds a bounded relevance signal from definition/reference edges under the existing token budget.
- Repository context now reports the ranking strategy, weighted graph edge count, and fixed iteration count for inspection.
- Added an optional Codebase-Memory MCP preflight. It never auto-installs or indexes; on this host it honestly reports `unavailable_not_installed` and prints the reviewed selective comparison commands.
- Focused green: diff check 0, tsc 0, reality Rust tests `12` passed, Clippy 0, graph preflight passed.
- Clean-shell release qualification green: Vitest `204`, build `3195` modules, Rust `142 + 3` intentional ignores, harness `3`, eval, desktop contract, dependency review, and graph preflight.

Next: corrective Slice C4 pinned MCP stdio transport adapter behind the disabled-by-default policy boundary.

## Post-V1 corrective Slice C4 status: official RMCP stdio transport

Done at focused-check layer; full release qualification follows before checkpoint.

- Wrapped official `rmcp 1.7.0` with only its client and child-process transport features.
- MCP servers still default disabled and tools still default denied. Nothing starts at boot.
- Approved MCP calls now cross one native Tauri command into a lazy cached RMCP stdio client. Reconfigure, disable, and remove close the cached child.
- Native validation repeats the critical bounds and secret refusal before spawning. Output is byte-bounded before IPC.
- Added a real stdio fixture that refuses tool calls before initialization, counts calls to prove reuse, and closes cleanly.
- Focused green: diff check 0, tsc 0, Vitest `205`, native MCP tests `2`, Clippy 0, desktop contract, and dependency review.
- Clean-shell release qualification green: build `3196` modules, Rust `144 + 3` intentional ignores, harness `3`, eval, desktop contract, dependency review, and graph preflight.

Next: corrective Slice C5 external benchmark sample adapters and real desktop interaction qualification where supported.

## Post-V1 corrective Slice C5 status: launch qualification and external preflights

Done at merge-gate layer; external release signoff remains explicit.

- Added upstream-backed, side-effect-free preflights for SWE-bench's official gold smoke and Harbor's official Terminal-Bench 2.0 oracle path. Both samples require an explicit `--run-sample`.
- Pinned the direct Tauri frontend API, moved native lifecycle hooks to `pnpm`, kept updater checks manual at boot, and made the release workflow fail unless `.sig` assets and `latest.json` are published.
- Fixed packaged-host workspace truthfulness and same-root picker recovery after click-driven macOS inspection.
- Removed the internal terminal/workspace barrel cycles and dead lazy wrappers reported by Rollup. The production build is warning-free across `3195` modules.
- Live `v0.7.3` probe: only the app tarball and DMG exist; the configured updater JSON endpoint returns `404`.
- Clean-shell release qualification green: Vitest `205`, build `3195` modules, Rust `144 + 3` intentional ignores, harness `3`, golden eval, desktop contract, dependency review, graph preflight, SWE-bench preflight, Terminal-Bench preflight, and signed-release preflight.

Corrective slices `C1-C5`: complete at merge-gate layer.

Remaining release signoff: publish a new signed draft release and confirm updater assets, run both explicit Docker-backed external samples, and execute Linux plus Windows interactive checks.

## Post-V1 corrective Slice C6 status: visible harness reality inspector

Done at focused-check layer; broader qualification and packaged-host inspection follow.

- Native repository context now exposes a deterministic top-`100` relationship list from the existing Aider-style file ranker.
- Reality now has compact Map, Context, Proof, Memory, Extensions, and Reliability tabs instead of a stats-only panel.
- The map is a lightweight inline SVG capped at `24` nodes and `40` visible edges. Search requests a fresh task-specific projection; click selection reveals symbol relationships.
- Context shows the active task subgraph, budget, included files, and bounded preview.
- Proof shows durable runs, expandable events, and bounded payload previews.
- Memory shows local provider counts, provenance, artifacts, and stale reasons.
- Extensions shows local skills plus MCP transport, protocol, enablement, and policy state.
- Reliability shows proof-based verified ratio and bounded local measurements.
- Non-map store reads remain lazy. No optional service starts when Reality opens.
- Focused green: diff check 0, TypeScript 0, Vitest `13` passed across `4` touched suites, native reality tests `12`, and Clippy 0.

Full clean-shell qualification green: TypeScript 0, Vitest `210` passed across `40` files, build `3199` modules, Cargo check and Clippy 0, Rust `144 + 3` intentional ignores, harness `3`, eval, desktop contract, dependency review, graph preflight, SWE-bench preflight, Terminal-Bench preflight, and signed-release preflight.

Packaged macOS click evidence green: the real Atlas repository rendered `667` files, `28,142` symbols, `13,124` weighted links, a bounded `24`-node SVG overview, task context, empty-session proof, local-memory state, disabled MCP transport state, and populated reliability metrics. Startup stayed silent with no new updater failure.

Next: continue the final-memo audit for remaining locally solvable harness gaps, then finish external and cross-platform release signoff where prerequisites permit it.

## Post-V1 corrective Slice C7 status: resumable work-packet compiler

Done at frontend verification layer; clean release qualification follows before checkpoint.

- Added bounded app-local work packets with goal, interpretation, status, decisions, blockers, next action, proof refs, proof-derived changed files, shell checks, and failures.
- Added approval-gated generation and deletion plus read-only list, inspect, and resume tools. Read-only subagents receive the inspectable resume operations.
- Latest active packet context enters the next prompt as a bounded advisory capsule with an explicit fresh-repository-evidence rule.
- Optional `.atlas/memory/work-packets/<id>.md` materialization remains explicit through the normal approved `write_file` lane; Atlas does not silently mutate repositories.
- Reality Memory now lazily shows work packets beside local records.
- Focused green: diff check 0, TypeScript 0, packet Vitest `7`, full Vitest `217` across `43` files, and desktop contract smoke.
- Clean-shell release qualification green: production build `3205` modules warning-free, Cargo check and Clippy 0, Rust `144 + 3` intentional ignores, harness `3`, eval, desktop contract, dependency review, graph preflight, SWE-bench preflight, Terminal-Bench preflight, and signed-release preflight.

Next: implement the opt-in filesystem memory surface, then rebuild the debug package and click-check the combined memory inspector in the packaged host.

## Post-V1 corrective Slice C8 status: opt-in harness-native memory filesystem

Done at merge-gate layer; packaged-host inspection follows.

- Added a separate opt-in `.atlas/memory/` surface with a small editable `MEMORY.md`, `topics/`, capped grep-only `sessions/*.jsonl`, and exported `work-packets/*.md`.
- LocalRecords and the proof journal remain canonical. The visible filesystem surface is portable and advisory, not a second event runtime or hidden provider dependency.
- Enabling the surface, disabling automatic use, and exporting a packet are approval gated. Atlas never silently creates repository artifacts.
- Only bounded redacted `MEMORY.md` enters prompt context. Completed proof runs mirror into capped redacted JSONL after opt-in; raw transcripts remain outside the prompt.
- Read-only subagents receive status, index read, and lexical session search only. The lazy Reality Memory tab exposes filesystem status and the active index path.
- Added adversarial serializer coverage so a large proof verdict still produces a valid JSONL entry at or below `8 KiB`, plus fixed-path, preservation, redaction, idempotence, retention-cap, packet-export, approval, and read-only tool tests.
- Focused green: diff check 0, TypeScript 0, filesystem-memory Vitest `6` across `2` files, and desktop contract smoke.
- Clean-shell release qualification green: Vitest `223` across `45` files, warning-free build `3206` modules, Cargo check and Clippy 0, Rust `144 + 3` intentional ignores, harness `3`, eval, desktop contract, dependency review, graph preflight, SWE-bench preflight, Terminal-Bench preflight, and signed-release preflight.

Packaged macOS click evidence green: bound the real Atlas repository, opened Reality Memory, and observed `local_records`, `0` active records, `0` stale records, `Filesystem surface disabled`, `Work packets (0)`, and both empty states together. The disabled default is truthful and the inspection created no `.atlas/memory` artifacts.

Next: continue the final-memo audit for remaining locally solvable harness gaps.
