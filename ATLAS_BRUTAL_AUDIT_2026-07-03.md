# Atlas code-reality audit

Date: 2026-07-03  
Scope: tracked application source, runtime paths, packaging artifacts, test/evaluation code, and two bounded real-provider harness runs. Documentation claims and Cargo check results were not accepted as proof. UI conclusions are source-based because the live UI pass was explicitly stopped.

## Post-remediation re-audit

The original 4.1/10 baseline below is preserved as the discovery record. After
checking the claimed Claude fixes and implementing the remaining high-impact
repairs, the current source-based rating is **8.1/10**. This is a large
correctness improvement, not a 10/10 declaration.

Now verified in code and tests:

- per-run project context is frozen and native agent file IO remains confined
  to the bound project, including callers that pass the legacy full-access flag;
- persistent shell state is real and output memory is bounded on completion,
  timeout, and host-exit paths;
- independent MCP servers are concurrent rather than globally serialized;
- receipts distinguish activity from checks, preserve the last meaningful
  receipt, label historical checks, and invalidate checks after later edits;
- picker, paste, and drop attachments share bounded ingestion, render sent
  image/PDF parts, and reject unsupported, secret-prone, oversized, duplicate,
  and aggregate-over-limit inputs;
- session persistence is count- and byte-bounded and inactive streams flush;
- Code Reality suppresses ambiguous duplicate-name fanout and synthetic
  self-links instead of presenting them as graph evidence;
- Git worktree operations are reachable through progressively disclosed agent
  tools, with approval on mutations and native branch/path restrictions;
- no-workspace chats skip project-only persistent context sources without a
  prompt classifier or active-editor heuristic.
- read-only subagents inherit cancellation and can run two or three independent
  investigations concurrently through one approval-gated batch operation;
- the official Playwright MCP preset is pinned, isolated, headless, project-cwd
  bound, tool-discoverable, and proven by a real Edge navigation plus
  accessibility-snapshot fixture;
- managed worktrees now support isolated coding workers, inspect, stage,
  unstage, commit, merge, and remove. Atlas runtime artifacts are added to the
  repository-local exclude file rather than appearing as user changes;
- known text-only models reject image/PDF submission before provider spend;
  custom/local models remain allowed because their runtime capability is not
  knowable from static Atlas metadata.

Current qualification receipts:

- frontend: `423 passed`, `4` paid benchmark suites intentionally skipped;
- Rust library: `201 passed`, `0 failed`, `4` host-dependent tests ignored;
- production build: passed, `3228` modules transformed;
- TypeScript, Rust formatting, and `git diff --check`: passed;
- live UI inspection: not performed, by user request.

Remaining score ceiling:

- browser verification is a real opt-in Playwright MCP path, but still depends
  on an external npm package and an installed browser rather than a bundled
  driver;
- isolated worktree coding workers deliberately have no shell; verification is
  returned to the parent rather than executed inside an OS sandbox;
- parallel subagents are bounded ephemeral workers, not durable steerable child
  threads with resumable histories;
- Code Reality remains a conservative tag-reference heuristic, not a semantic
  call graph;
- MCP remains primarily stdio-oriented and lacks mature discovery/auth flows;
- approved shell commands are host-powerful because Atlas has an approval
  boundary, not an OS/container sandbox;
- whole-file review, provider variability, large frontend bundles, and several
  broad coordinators remain material product and maintainability weaknesses;
- UI behavior and attachment visuals remain source/test-verified only.

## Executive verdict

Atlas is not a child's project at the systems-programming level. Its PTY, filesystem authorization, native grep, Git plumbing, atomic writes, symlink defenses, output caps, and Tauri boundary contain serious engineering. The problem is that the product built around those parts is incoherent and frequently overclaims what its abstractions guarantee.

The shortest honest description is:

> Atlas is a capable Tauri terminal/editor shell with a real but inefficient AI tool loop, surrounded by an oversized, partially wired “harness” layer whose sessions, security story, evidence gates, skills, worktrees, and advanced capabilities are not production-trustworthy.

Overall rating: **4.1/10**.

| Area | Score | Reality |
| --- | ---: | --- |
| Native terminal/PTY | 7.5 | The strongest part; real platform work and bounded renderer pooling. |
| Filesystem/Git primitives | 7.0 | Generally careful authorization and parsing; useful core. |
| Editor/explorer/preview | 5.5 | Broad and usable-looking, but more mini-IDE than focused terminal. |
| AI coding loop | 4.5 | Real streaming/tools/edits, but expensive, provider-fragile, and globally stateful. |
| Reliability/concurrency | 3.0 | Session/workspace races, resource leaks, blocking native waits, weak cancellation. |
| Security | 2.5 | File tools are guarded; shell execution bypasses the central security claim. |
| Evaluation honesty | 2.0 | Several “benchmarks” cannot fail when capability results fail. |
| UI/UX architecture | 4.0 | Too many competing surfaces, monoliths, hidden mounted views, crude failure UX. |
| Product differentiation | 3.5 | Repo graph/receipts are distinctive nouns, not proven outcome advantages. |
| Maintainability | 3.5 | 72k source lines, many large coordinators, duplicated state and decorative layers. |

Release recommendation: **NO-GO for positioning as a production-grade autonomous coding harness.** It is viable as an alpha terminal/editor with experimental AI.

## What I measured

The tracked TypeScript/TSX/Rust application and tests total approximately **72,331 lines across 457 files**. Production code is about 65,985 lines; tests about 6,346 lines.

- The AI frontend alone is 27,587 lines across 204 files, about 38% of all application source.
- `App.tsx` is 1,699 lines.
- Source control is split across a 1,034-line component and 972-line hook.
- Git history is 979 lines; model settings 944; tab state 808; the main agent loop 786.
- Built frontend assets total 6.31 MB. The current NSIS installer artifact is 5.83 MB and the release executable is 15.8 MB. The small download claim is credible; “ultra-lightweight” runtime memory has not been established.
- The dependency tree contains roughly 903 pnpm package directories and 469 MB of installed dependencies.

### Real-provider benchmark observations

I used the existing production agent loop with its Tauri invoke shim and a configured Gemini key. These runs test the model/tool loop, not the real desktop/native boundary.

| Run | Result | Cost/behavior |
| --- | --- | --- |
| Two-file one-line bug fix | Passed | 7.8 s, 5 steps, 5 tool calls, **20,630 input tokens**, 426 output tokens. |
| One-file calculator, production gateway | Weak judge passed | 19.4 s, 6 steps, 5 tool calls, **33,430 input tokens**, 2,249 output tokens. It unnecessarily called `serve_preview`, `bash_run`, and `suggest_command` twice. |
| Same calculator, all advertised tools | Failed before first token | Gemini rejected Atlas's generated schemas: boolean `true` literals were emitted as string enum values for several tools. |

The calculator judge only checks that the file contains `<button>`, `<script>`, and an operator character. It does not execute button behavior or verify arithmetic. A broken calculator can pass.

The numbers are damning for efficiency. A one-line bug in two tiny files consumed 20.6k input tokens; a one-file static page consumed 33.4k. The full system prompt is about 8,333 characters, the “lite” prompt 3,815, and every run uses the full harness lane with every optional context source enabled (`lanePolicy.ts`). The gateway reduces schema tax, but does not make the loop lean.

## Claim-by-claim truth table

| Claimed/product surface | Code reality | Verdict |
| --- | --- | --- |
| Multi-tab terminal and four-way splits | Real PTYs, OSC cwd/prompt integration, renderer pool capped at five WebGL slots. | **Real** |
| Windows/macOS/Linux | Platform code exists. Default CI compiles all three, but real interactive desktop qualification is not a required passing gate. | **Partially proven** |
| WSL workspace | Real path bridge and distro handling. | **Real, narrow** |
| Private terminal | Hides active buffer from AI context; it is not a process or network privacy sandbox. | **Misleading name** |
| File explorer/search/editor | Real native search plus CodeMirror and mutations. | **Real** |
| Git UI | Status, file-level stage/unstage/discard, commit, fetch, FF-only pull, push, log and commit diffs exist. | **Real, incomplete** |
| Per-hunk AI diff acceptance | `AiDiffPane` has one Accept and one Reject action for the entire proposed file. Merge controls are disabled. | **False** |
| Worktrees | Rust commands and TypeScript wrappers exist, but no frontend or agent tool calls them. | **Dead backend feature** |
| Project-bound sessions | Metadata stores a root, but tool execution reads global live workspace state. | **Unsafe/false under concurrency** |
| Parallel AI sessions | Inactive `Chat` objects can continue, but status, approval mode, workspace context, and persistence bridge are global/active-only. | **Broken abstraction** |
| BYOK cloud providers | Real SDK integrations via Rust HTTP proxy. | **Real** |
| Local model support | LM Studio/MLX/Ollama OpenAI-compatible paths exist. Tool compliance remains model-dependent and no provider contract gate protects the user. | **Experimental** |
| Voice input | Records audio but constructs a raw OpenAI client without the Rust proxy used everywhere else. This is exposed to desktop-webview CORS/network failure and errors only go to console. | **Likely broken** |
| Inline autocomplete | Real, provider-backed, abortable request. | **Real** |
| Read/edit/search agent tools | Real, with strong read-before-edit and native boundary checks. | **Real** |
| Persistent agent shell | Each call spawns a fresh shell. Only cwd is carried forward by a sentinel. Exports, aliases, functions, activated environments, shell options, and process state do not persist. | **False claim** |
| Full-access safety | File tools remain bounded; shell commands can read/write outside the workspace and read secrets. | **False and dangerous** |
| Repo “Reality” map | Real tree-sitter tag index and heuristic weighted PageRank. It is not a semantic dependency/call graph. | **Useful heuristic, overnamed** |
| LSP | Lazy clients for eight language families exist and can return diagnostics/semantic operations if external servers are installed. | **Real but environment-dependent** |
| Memory | Local typed records work when explicitly written. Automatic useful-memory extraction is not the default path; SimpleMem needs an optional sidecar. | **Partial** |
| Skills | Enabled prompts are injected. Allowed tools are decorative, installed hook selections are never wired, fixtures are unused, and the runner is constructed with an empty hook list. | **Half implemented** |
| MCP | Real RMCP stdio call path. No HTTP/OAuth/env/cwd support, no tool discovery UX, 5 s frontend timeout, and policy UX is misleading. | **Minimal** |
| Subagents | One synchronous read-only `generateText` call returns a summary. No parallel orchestration, steering, resume, persistent child, or worktree isolation. | **Toy compared with the name** |
| Claude Code delegation | Spawns `claude` in a terminal and injects prompts. This outsources capability to another product rather than improving Atlas's own agent. | **Wrapper** |
| Plan mode | Read-only drafting plus queued whole-file edits and review dock exist. | **Real, basic** |
| Verification plan | Returns hard-coded command suggestions; it does not run or verify them. | **Decorative** |
| Proof receipts | Real event/tool journaling with bounded/redacted payloads. It records activity, not correctness. | **Real telemetry, overvalued evidence** |
| Work packets | Model-triggered, approval-gated summaries derived from receipts/todos. Not automatic crash-safe continuation. | **Niche/partial** |
| Metrics/context inspector | Local records and context snapshots exist. | **Real introspection** |
| Preview | Sandboxed iframe with localhost AI restriction and manual arbitrary URL bar. | **Real, basic** |
| Browser verification | No browser-control tool, element comments, screenshot loop, or product-level browser E2E. | **Missing** |
| Updater | Tauri updater path exists. Release publication/signing is external and not proven by local code. | **Implemented contract** |

## Critical and high-severity findings

### F-01: “Full access” bypasses every workspace and secret boundary through the shell

Severity: **Critical**

`permissions.ts` tells the user that dangerous-command and out-of-workspace guards still apply in Full access. File tools do enforce canonical project roots and sensitive-path rules. `bash_run`, however, calls `checkShellCommand` and then invokes a native shell whose only authorization is the starting cwd. The command may use absolute paths, `..`, PowerShell APIs, Python, Node, Git aliases, redirects, or network clients to access anything the user can access.

Concrete examples accepted by the current guard include reading `.env`, SSH keys, browser data, or files outside the project; copying them into the project; and sending them over the network. The blocker recognizes a handful of catastrophic strings (`rm -rf /`, block-device formatting, pipe-to-shell) and generic environment dumps. It is not a sandbox.

Impact: prompt injection or model error in Full access can silently cross project and secret boundaries. This directly contradicts the UI copy and central security story.

Fix: either remove Full access, or put all shell processes in a real OS sandbox with explicit filesystem/network policy. Permission checks must cover Bash/PowerShell and child processes, not just typed file tools.

### F-02: A run is not bound to its session workspace

Severity: **Critical**

`createContextAwareTransport` snapshots project A for the prompt and trace at run start. But every file/shell tool calls `toolContext.getProjectContext()`, which is wired to the app's current global workspace, active folder, active file, terminal and execution cwd. `switchSession` changes that global workspace without stopping the old chat.

Reproduction by code path:

1. Start a multi-step agent in session A/project A.
2. Switch to session B/project B while A is streaming or awaiting its next tool call.
3. A's next relative `read_file`, `edit`, `write_file`, or shell command resolves against B's live context.

The model still sees A's `<atlas_context>`, so it can believe it is editing A while native calls target B. This is cross-project corruption waiting to happen.

Fix: freeze an immutable run context with canonical project root and execution cwd. Bind it to the chat/run ID. Switching UI sessions must never mutate another run's tool context.

### F-03: Global run state corrupts multi-session behavior

Severity: **High**

`agentMeta`, token usage, approval mode, error, current step, mini-window state, and approval responder are global Zustand fields. Chats are per-session. Inactive chats can continue after switching, and their callbacks patch the same global state.

Consequences:

- Background session A can overwrite session B's status, token count, error and current-step label.
- Switching resets global approval mode to Ask while A is running; A reads approval mode at tool-call time, so policy changes mid-run.
- Only the active session mounts `AgentRunBridge`; inactive streaming messages stop being persisted until revisited.
- A pending approval in an inactive chat has no durable per-session responder surface.
- The global “busy” flag can enable input while another chat is still acting.

Fix: store run metadata, responder, approval mode, persistence lifecycle and resources by session/run ID. The active UI should select a record, not own execution truth.

### F-04: Google capability unlocks can make the request schema invalid

Severity: **High**

The all-tools benchmark failed with HTTP 400 before the first token because Gemini rejected boolean literals represented as string enum values. The offending schemas are in memory tools using `z.literal(true)`. Production hides these schemas behind the capability gateway, so ordinary tasks work until the model unlocks the memory family; the next step can then fail.

There is no provider-by-tool-schema compatibility suite. Provider support is therefore a list of SDK constructors, not an end-to-end capability guarantee.

Fix: normalize schemas per provider or replace incompatible literals. Add a no-cost schema serialization contract test for every provider and a real one-step tool-call canary for every advertised provider family.

### F-05: The benchmark suite can report green when the agent fails

Severity: **High**

`progressiveBench.test.ts` and `capabilityBench.test.ts` calculate and print pass/fail but contain no expectation that tasks pass. Vitest reports the test passed even if all tasks fail. The SWE-bench trial sets the harness task's `check` to `true`, accepts empty patches, and only throws if the predictions file itself was not written. Localization and non-empty patch counts are logging, not gates.

The default qualification path skips paid harness benchmarks. The desktop UI phase can be “blocked” while non-strict qualification ends as `RECORDED_WITH_BLOCKERS`, not a failing release gate.

This is the opposite of receipt-driven proof: it produces proof-shaped output that cannot falsify the claim.

Fix: define pass thresholds before running; assert them; make provider errors, empty patches, zero-tool runs, and missing UI automation fail. Separate diagnostic scripts from tests so “green” has one meaning.

### F-06: The “persistent shell” is not persistent

Severity: **High**

`ShellSession.run` launches `run_blocking_inner`, which spawns a fresh `/bin/sh`, PowerShell, or WSL shell on every command. A sentinel parses cwd and saves only that string.

The following common workflows do not persist: `export FOO=bar`, virtualenv/conda activation, shell functions, aliases, `set -e`, PATH edits, credentials loaded into environment, and shell-local tool setup. The feature is documented and coded as a persistent shell but behaves like repeated one-shot commands with cwd memory.

Fix: maintain an actual long-lived process with framed command protocol, or rename it honestly to “cwd-preserving command runner.”

### F-07: Background jobs leak and process-tree cleanup is incomplete

Severity: **High**

`ShellState.bg` has no cap and no removal path. `shell_bg_kill` kills but retains the entry; exited jobs remain forever. Each job can retain a 4 MB ring buffer plus command/cwd and child handle. Long sessions can grow memory monotonically.

The one-shot/background shell uses `SharedChild.kill()` on the immediate shell, not the per-session Windows Job Object/process-group strategy used by the PTY. Timeouts and kills can orphan descendants such as dev servers.

Fix: remove completed/killed entries, cap jobs, expose cleanup, and use job objects/process groups for the entire descendant tree.

### F-08: Native async commands block executor threads

Severity: **High**

`shell_run_command` and `shell_session_run` are async Tauri commands but call synchronous `std::sync::mpsc::Receiver::recv()` after spawning a thread. Under concurrent agent commands, these block async runtime workers for up to 300 seconds each.

Fix: use `spawn_blocking`, Tokio process APIs/channels, or make the command explicitly synchronous on Tauri's blocking pool.

### F-09: Voice input bypasses the only working provider network path

Severity: **High feature defect**

The main agent and autocomplete inject `cloudProxyFetch`, because raw webview requests fail provider CORS. `useWhisperRecording.ts` creates an OpenAI client without that fetch override. Failure is written only to `console.error`; there is no user-facing error or retry.

Fix: use the Rust proxy or a dedicated bounded transcription command; surface permission, format, network and provider errors.

### F-10: Skills expose configuration that does nothing

Severity: **High product-integrity defect**

Atlas skill packages store `allowedTools`, `hooks`, and `fixture` fields. Runtime behavior only concatenates enabled prompts into a system context block.

- `allowedTools` is displayed as metadata but never restricts active tools.
- Installed hook selections are never registered. `lifecycleHookRunner` is constructed with `[]`.
- `fixture` is never used outside validation/storage.
- All enabled skill prompts load together, up to a shared 20 KB cap, rather than progressive invocation.

Fix: either implement a real skill runtime with invocation, scoped tool exposure and registered hooks, or delete the decorative fields and call the feature “prompt presets.”

### F-11: MCP timeouts do not cancel side effects

Severity: **High**

The frontend boundary races a 5-second timer against the native invocation. Losing the race decrements the concurrency counter but does not cancel the native MCP tool. The native layer can continue for its longer timeout and the external tool may still mutate state after Atlas reports failure.

MCP is also stdio-only; settings cannot supply environment variables, cwd, HTTP transport, OAuth, tool discovery, or per-tool UI policies. The Settings copy says calls are individually approved, while the agent tool always requests outer approval regardless of configured `allow` versus `ask`.

Fix: propagate cancellation, align one timeout, discover tools, and make policy semantics real.

### F-12: Conversation and harness data are persisted as plaintext without retention controls

Severity: **High privacy/reliability**

Full UI messages, tool inputs/outputs, code excerpts, terminal output, proof receipts, metrics, memories, MCP commands, skills, todos, and work packets are stored in multiple JSON files via the Tauri store plugin. API keys use the keychain, but sensitive development context does not.

There is no session count/size cap, expiry, project-level privacy toggle, clear-all-data surface demonstrated in the core flow, or at-rest encryption. Redaction is pattern-based and cannot identify arbitrary proprietary secrets.

Fix: disclose storage, add retention/size caps and project privacy controls, provide export/delete-all, and consider OS-protected encryption for chat/tool history.

## Major product and architecture flaws

### The harness is taxonomy-heavy and behavior-light

Atlas has context ledger, code reality, proof journal, receipts, run traces, metrics, memory kernel, memory surface, SimpleMem observer/lab, work packets, capability gateway, lane policy, lifecycle hooks, verification plans, snippets, skills, todos, subagents and managed agents. Most wrap the same simple loop: model plus file/search/shell tools.

The clearest example is `lanePolicy.ts`: the type allows only `"full"`; the selector ignores all input and always enables every context source. Tests verify this constant return. This abstraction creates vocabulary and files, not adaptive behavior.

### “Code Reality” is a heuristic tag graph, not code reality

The index is a legitimate tree-sitter tag extraction for JS/TS/TSX/Python/Rust/Go/Java. The graph connects every reference tag with every definition having the same lowercase name. It does not resolve modules, imports, overloads, scopes, type identity, dynamic dispatch, build configuration or conditional compilation.

Identically named symbols in unrelated modules can create false edges. Unsupported languages are listed but not semantically mapped. The projection reads snippets around a few symbols and labels the rank strategy `aider_weighted_pagerank`. That can help navigation, but it cannot justify dependency, impact or call-graph claims without LSP/source confirmation.

### Worktrees are code inventory, not a feature

The native Git layer can create/list/remove/merge `.atlas/worktrees`, and TypeScript has wrappers. No UI or AI tool calls those wrappers. Sessions run in the active checkout and are not isolated. Shipping unreachable backend commands increases maintenance and attack surface without user value.

### Subagents are synchronous summaries

`run_subagent` blocks the parent tool call while one `generateText` run executes. It cannot run several agents concurrently, inspect them live, send follow-ups, resume, cancel, assign a cheaper model, isolate writes, or use worktrees. All four subagent types share the same read-only tool list and differ mainly by prompt.

### Verification is mostly narration

`verification_plan` maps file extensions to hard-coded commands. Proof receipts record tool events and model-produced outcomes. Work packets compile those receipts. None establishes that the right behavior was tested. The harness frequently confuses “a command ran” with “the claim is true.”

### The application has two conflicting centers

It calls itself a terminal emulator, but boots into an AI home/chat. It also contains a terminal tab system, editor, explorer, Git client, history graph, preview browser, source control composer, Reality inspector, session sidebar, mini AI window, docked AI panel, status AI controls, notification manager and separate settings window.

There is no single primary workflow. The product alternates between terminal, mini IDE and AI desktop without making any one of them excellent.

## UI/UX findings from source

1. **Redundant AI surfaces:** full home chat, floating mini window, docked right panel, status pill, status chat button, session panel, pending approval dock and diff tabs all represent overlapping state.
2. **Chat sessions are not workspace sessions:** switching projects destroys terminal/editor/preview tabs and resets to home; returning restores only chat/root, not the working layout or processes.
3. **Same-root sessions share global tabs/context:** independent conversations are not independent workspaces.
4. **Crude error handling:** important workspace and unsaved-state failures use `window.alert`.
5. **No per-hunk review:** AI diff is whole-file Accept/Reject; Git staging is file-level.
6. **No inline diff comments or steering loop:** review cannot attach a comment to a line/hunk and ask the agent to revise it.
7. **No command palette:** header search is contextual find, not a discoverable application command surface.
8. **Overloaded status/header chrome:** tabs, sidebar toggle, split, agent notification, contextual search, settings, window controls, workspace env, breadcrumb, privacy, status and chat controls compete in 40 px/32 px bars.
9. **Small-window fiction:** config allows 420x280 while the app supports a sidebar, workspace, agent panel, header, footer, dialogs and diff views. Many controls use 10-11 px text.
10. **Accessibility is inconsistent:** native/icon buttons often rely on `title`; focus and labels are applied unevenly. Custom tree, tabs, graph and resizable surfaces need dedicated keyboard/screen-reader audits.
11. **Hidden mounted cost:** all terminal/editor/preview/diff/history stacks remain mounted and are toggled with visibility. This preserves state but scales memory with tabs. Preview alone waits 30 seconds before teardown.
12. **No upper bound on tabs/editors/chat sessions:** state, CodeMirror documents and persisted messages can grow indefinitely.
13. **Blank lazy boundaries:** several major lazy components use `Suspense fallback={null}`, producing unexplained empty regions under slow load.
14. **Visual complexity without hierarchy:** “Reality,” “Sessions,” source control and files share a bottom rail while AI also has a separate home and side panel.
15. **Settings are sprawling:** a 944-line Models section exposes providers, URLs, model IDs, context limits, keys and catalogs without a validated capability matrix.
16. **Failure states are console-only in key paths:** voice, external opener, some persistence/restoration and provider paths log errors instead of presenting recovery.
17. **Editor is broad but shallow:** many language modes/themes and AI autocomplete, but no project diagnostics panel, symbol outline, refactor UI, debugger or task runner.
18. **Preview is a viewer, not an agent loop:** no element selection/comments, console/network capture, screenshots, accessibility tree or automated interaction.
19. **Terminal “Private” can be misread:** it only omits active scrollback from AI context. Shell tools, other files, process environment and model requests remain unaffected.
20. **The brand promise is unclear:** “What do you want to build?” looks like a generic AI builder while the strongest product is the native terminal.

## Performance and efficiency flaws

1. Every task uses the full lane and attempts to load ATLAS.md, memory index, local memory, SimpleMem, work packet and skills in parallel, even trivial tasks.
2. The real one-line bug benchmark used 20.6k input tokens; the one-file calculator used 33.4k.
3. Prefix caching reduces billed/recomputed tokens for some providers but does not remove network payload, schema complexity, local packing or cognitive noise.
4. The capability gateway has 15 always-visible core tools, including multiple overlapping mutation and preview paths.
5. `repo_context` can scan up to 20,000 files and 100,000 symbols on first use, then reruns after a four-second age bound or any watched change invalidation.
6. Graph ranking runs 24 PageRank iterations even when a simpler search would answer the task.
7. Hidden tabs preserve CodeMirror and PTY state indefinitely; only five terminals get WebGL renderers, but models, buffers and React trees remain.
8. Background process logs retain up to 4 MB per never-removed job.
9. HTTP request bodies are converted into JavaScript number arrays, multiplying transient memory versus a binary buffer.
10. Aborting `proxyFetch` stops frontend consumption but has no explicit native cancellation token; the native request stops only if channel delivery fails later.
11. Non-streaming `ai_http_request` reads an unbounded response body into memory.
12. Plaintext session persistence serializes complete message arrays; it is debounced, but has no compaction/retention at rest.
13. The release frontend includes duplicate 248 KB logos, a 139 KB font EULA PDF, and a 61 KB “read-this.html” font artifact.
14. The codebase pays maintenance cost for unreachable worktrees and decorative skill/hook fields.

## Reliability and edge-case inventory

These are not all equal severity, but a gold-standard harness audit must account for them.

### Sessions and state

- Switch project while an old run is between tool calls: wrong-root tool execution.
- Switch while awaiting approval: responder/diff surface moves to the new active chat.
- Switch while streaming: inactive tail is not persisted until remounted.
- Delete an active/running session: chat stops, but persistent shell state is not closed.
- Two runs update global token totals: usage attribution is wrong.
- Change access mode in another session: running tool policy changes.
- Change active folder/file while a run continues: relative path base changes.
- Change active-terminal execution mode or cwd: later commands drift.
- Same project in multiple sessions: shared tabs and live context defeat isolation.
- Different project session switch with dirty editor: whole switch is blocked by an alert rather than a recoverable save/stash flow.
- Workspace restore disposes all PTYs and tabs; chat session history implies more continuity than exists.
- Chat/message stores have no migration schema/version or corruption recovery beyond fallback.

### Shell/processes

- `export`, activation and aliases do not persist despite shell-session naming.
- Timeout kills the shell but can leave descendants.
- Background kill does not remove the handle.
- Exited jobs accumulate forever.
- Unlimited job creation can exhaust memory/handles/threads.
- Output from stdout and stderr shares one ring buffer without stable cross-stream ordering.
- The “sensitive env dump” regex is bypassable through language runtimes, shell expansions or targeted file reads.
- Dangerous command regexes are trivially bypassable with variables, quoting, encoded scripts, aliases, PowerShell cmdlets, Python/Node or indirect paths.
- Full access has network access with no domain policy.
- Foreground commands block native async workers while waiting.

### Files/editor

- `write_file` can overwrite an existing large file without read-before-edit; the prompt asks the model not to, but enforcement is absent.
- Full-file AI acceptance cannot keep one hunk and reject another.
- Diff preview reads the original through the non-agent native API and current global workspace, creating another session-switch race.
- Plain UTF-8 assumptions reject valid non-UTF-8 source files rather than preserving encoding.
- Large files cannot be edited by AI through normal read-before-edit.
- File explorer/editor state is not per chat session.
- No conflict resolution if an external editor changes a file after plan review except fingerprint failure at application time.

### Providers/network

- Memory schemas break Gemini when promoted.
- There is no advertised-provider × core-tool contract test.
- Local OpenAI-compatible servers vary widely in tool-call format; repair handles only double-encoded JSON.
- Voice uses the wrong fetch path.
- Redirect host safety is weaker for private-network-enabled clients: redirect destinations are not pre-resolved/pinned the same way as the initial host.
- Streaming responses have no explicit byte ceiling.
- Non-stream responses have no byte ceiling.
- Abort is not end-to-end cancellation.
- Model cache keys include raw API keys in process memory strings and never evict.
- Changing endpoint/key combinations can grow the model cache indefinitely.

### MCP/skills/memory

- A timed-out MCP mutation may complete after failure is shown.
- Five seconds is too short for many real MCP tools.
- No HTTP/streamable HTTP/OAuth MCP.
- No environment/cwd configuration for stdio servers.
- No tool discovery or schema preview in settings.
- `allow` and `ask` policies do not produce meaningfully different outer approval behavior.
- Skill allowed-tool lists are not enforced.
- Skill hooks are never registered.
- Skill fixtures are unused.
- All enabled skills are injected together and truncated as one blob.
- Local memory requires explicit tool use and can become stale; post-edit invalidation only helps records with matching source artifacts.
- Memory/work packets/proof are separate stores with no transactional consistency.
- Work packet “complete” status is model-provided metadata, not an independently checked state.

### Evaluation/release

- Progressive/capability benchmark failures do not fail tests.
- SWE trial passes with empty patches.
- Calculator judge does not run calculator behavior.
- Tiny synthetic fixtures do not measure repository-scale editing.
- Headless invoke shim is not the Rust boundary.
- LSP is forced unavailable in the shim, so integrated semantic paths are not benchmarked.
- Real desktop automation is optional/blocked, not a release floor.
- External SWE/Terminal benchmark preflights validate adapters, not task performance.
- Historical log volume can create an impression of evidence without a single canonical, reproducible scorecard.
- Release artifacts in the tree include multiple versions, making local artifact inspection ambiguous.

## What is genuinely good

A brutal audit should not flatten real strengths.

1. Native path authorization follows symlinks for reads and validates existing ancestors for mutations.
2. Agent-specific filesystem commands bind to an authorized project root and apply native secret policy.
3. Atomic file writes use randomized staging and avoid deterministic symlink attacks.
4. File mutations are queued per path and protected by read fingerprints.
5. PTY lifecycle, ConPTY serialization and Windows Job Objects show hard-earned platform knowledge.
6. Terminal renderer pooling and dormant serialization are thoughtful responses to WebGL limits.
7. Native grep/search is bounded and avoids spawning `rg` for every query.
8. Git command invocation uses argument arrays and repo authorization rather than shell interpolation.
9. The AI HTTP proxy attempts DNS classification/pinning and blocks metadata endpoints.
10. Tool outputs, traces and stored proof payloads use bounds and redaction in many paths.
11. The agent loop has real compaction, step ceilings, tool-call repair, approval pauses and provider streaming.
12. LSP responses distinguish unavailable/broken/pending/fresh instead of pretending.
13. Optional systems generally degrade instead of blocking app startup.
14. The small installer is real.

These strengths are enough to justify salvaging the terminal/native core. They do not rescue the current harness claims.

## Feature-for-feature comparison

This comparison excludes enterprise policy, model quality, pricing, capital, hosted infrastructure and vendor scale. It compares current application behavior. Codex facts come from the current official Codex manual; Claude Code facts from current first-party Claude Code documentation.

| Capability | Atlas | Claude Code Desktop | Codex app | Verdict |
| --- | --- | --- | --- | --- |
| Local terminal | Full multi-tab emulator with splits | Integrated per-session terminal | Integrated per-thread terminal | Atlas is strongest as a terminal emulator. |
| File editor/explorer | Built-in tree + CodeMirror | Integrated file editor/panes | Artifact/file inspection; IDE sync is stronger than being a full IDE | Atlas has broader built-in IDE chrome. |
| Session isolation | Shared checkout/global live state | Parallel sessions get worktree isolation | Local/worktree/cloud modes; managed worktrees | Atlas loses decisively. |
| Parallel sessions | Unsafe global-state continuation | First-class parallel sessions and agent view | Parallel project threads/worktrees | Atlas is not trustworthy here. |
| Subagents | One synchronous read-only summary | Foreground/background subagents, parallel runs, steering, nested agents; agent teams/workflows | Parallel specialized agents with management and custom configs | Atlas's feature is prototype-level. |
| Worktrees | Unreachable native commands | Automatic per-session isolation | First-class thread mode and handoff | Atlas has plumbing, not product. |
| Diff review | Whole-file AI accept/reject; file-level Git stage | Visual diff/comment loop, PR monitoring | Inline comments, stage/revert chunks/files, commit/push/PR | Atlas is materially behind. |
| Git | Good local file-level client and history graph | Session/worktree and PR workflow | Strong local/worktree Git and PR flow | Atlas's graph is nice; workflow is incomplete. |
| Browser preview | Sandboxed iframe viewer | App previews and Claude verification | Preview, comments, browser control | Atlas lacks the feedback/verification loop. |
| Computer/browser use | None | Computer use | Computer use plus in-app browser control | Missing. |
| Sandbox | File API boundary only; shell escapes it | OS shell sandbox + permission rules | OS sandbox + approval policy | Atlas security is not comparable. |
| MCP | Stdio only, manual names, minimal policy | Mature MCP/connectors/plugins | Stdio + HTTP, shared config, OAuth/policy | Atlas is a minimal subset. |
| Skills/plugins/hooks | Prompt packages; hook metadata dead | Real skills, plugins, hooks, commands | Skills, plugins, MCP, hooks | Atlas's naming overstates implementation. |
| Memory | Explicit local records + optional sidecar | Project/user instruction and memory ecosystem | Inspectable opt-in generated memories | Atlas has interesting local pieces but no coherent UX. |
| Repo intelligence | Heuristic tree-sitter graph + optional LSP | Search/LSP/tool ecosystem | Search/IDE/MCP/tool ecosystem | Atlas is distinctive, not proven superior. |
| Proof/receipts | Rich local activity journal | Hooks/transcripts/tasks | Plans, summaries, sources, traces/tool UI | Atlas exposes more local telemetry, but not stronger correctness proof. |
| Automations/scheduling | None | Routines/hooks/dynamic workflows | Standalone and thread automations | Missing. |
| Remote/SSH/cloud handoff | WSL only | Local/cloud/SSH/Dispatch | Local/worktree/cloud | Missing by requested app feature comparison. |
| Web search | None | Web/search tools depending surface | First-party web search | Missing. |
| Image/non-code artifacts | Markdown/HTML preview only | Preview panes and computer use | PDF/docs/sheets/slides/image generation and preview | Missing. |
| Voice | Whisper path likely broken | Product voice capabilities vary by surface | Working voice dictation | Atlas claim is not dependable. |
| Extensibility portability | App-local JSON configuration | Project/user/plugin scopes | Shared CLI/IDE/app config and skills | Atlas locks configuration inside its own stores. |

Current first-party references used for the comparison:

- Claude Code Desktop: https://code.claude.com/docs/en/desktop
- Claude Code permissions/sandboxing: https://code.claude.com/docs/en/permissions
- Claude Code parallel agents: https://code.claude.com/docs/en/agents
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Codex app features: https://developers.openai.com/codex/app/features
- Codex worktrees: https://developers.openai.com/codex/app/worktrees
- Codex skills: https://developers.openai.com/codex/skills
- Codex MCP: https://developers.openai.com/codex/mcp
- Codex subagents: https://developers.openai.com/codex/subagents
- Codex memories: https://developers.openai.com/codex/memories

### Bottom-line comparison

Atlas does not currently compete with Claude Code Desktop or the Codex app as an AI coding application. It competes more plausibly with a lightweight terminal/editor that has an embedded BYOK assistant.

Its defensible advantages are:

- open native terminal focus;
- small installer;
- BYOK/local-provider freedom;
- built-in explorer/editor/Git graph;
- local activity receipts and a fast native tag map.

Its decisive disadvantages are:

- no real shell sandbox;
- unsafe session/workspace concurrency;
- no real parallel agent orchestration;
- no productized worktree isolation;
- no browser/computer verification loop;
- no PR/CI workflow;
- weak MCP/skills/plugin story;
- misleading benchmarks and proof language;
- enormous complexity relative to demonstrated outcomes.

## Recommended product reset

### Phase 0: stop the dangerous claims

1. Rename Full access to “Unsandboxed” and add an explicit warning, or remove it.
2. Stop calling shell sessions persistent.
3. Remove per-hunk, production-grade, gold-standard, project-bound and benchmark-proof claims until enforced.
4. Label Reality as a heuristic repo map.
5. Label subagents as synchronous read-only research calls.

### Phase 1: fix correctness before features

1. Freeze immutable per-run workspace/tool context.
2. Move all agent metadata, approval responders, access mode, resources and persistence under session IDs.
3. Stop or safely background a run before workspace switching.
4. Add provider schema contract tests and fix Gemini memory schemas.
5. Route voice through the native proxy.
6. Make background/foreground processes kill descendant trees and remove completed handles.
7. Replace blocking native receives.
8. Add storage caps, deletion and privacy controls.

### Phase 2: choose a product

Recommended direction: **terminal-first local AI workbench**, not “everything Codex/Claude has.”

Keep:

- PTY, splits, WSL and private-buffer mode;
- explorer/editor/preview;
- native search/Git;
- one excellent AI side panel;
- read/edit/search/shell tools;
- optional LSP and a plainly named repo map;
- BYOK/local models.

Remove or park until justified:

- proof/receipt theater beyond a simple run log;
- work packets;
- SimpleMem lab/surface variants;
- empty lifecycle hook system;
- decorative skill policy fields;
- metrics inspector as a user-facing feature;
- unreachable worktree commands;
- duplicate chat surfaces.

### Phase 3: establish honest evidence

1. One canonical eval command that fails below thresholds.
2. Provider × core-tool schema canary.
3. Real native desktop smoke on all supported platforms.
4. Session-switch-during-tool-call race test.
5. Shell sandbox escape suite.
6. Process descendant cleanup test.
7. Executable UI behavior tests for preview, approvals and diffs.
8. Realistic repo tasks with behavioral tests, not string-presence judges.
9. Publish failures, denominators, token counts, model/provider, patches and raw logs.

## Final answer to “what does Atlas do?”

Today Atlas gives you a compact terminal/editor/Git desktop app with an embedded multi-provider coding chat that can inspect and edit a bound project, run commands, preview a local server, and optionally use a heuristic repo map or installed language servers.

It does **not** yet give you a trustworthy autonomous coding harness. Its shell can escape the advertised boundary, runs are not durably bound to sessions, advanced capabilities are partially wired, worktrees are unreachable, provider compatibility is not enforced, and its own evaluation system can turn failure into a green test.

The native core stands out more than the AI harness. The best path is to admit that, shrink the product around it, and rebuild autonomy on per-run isolation plus falsifiable evaluations.
