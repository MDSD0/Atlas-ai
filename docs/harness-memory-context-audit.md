# Atlas Harness Memory And Context Audit

Date: 2026-06-05
Branch: m0-verification-floor
Scope: defects observed in Atlas's agent loop, context packing, memory model, planning UX, preview/run behavior, and upstream source-parity lessons.

## One-Sentence Diagnosis

Atlas has strong research pieces, but the product path still behaves like a broad research cockpit: too much context, too many tools, too many foreground receipts, and not enough harness-owned control over memory, tool eligibility, run state, and UI state.

## Corrected Position On Routing

Do not build a hardcoded deterministic pipeline that replaces judgment. That will fail on nuanced user turns.

Do build a two-stage, LLM-mediated runtime:

1. A tiny first-pass intent scout receives only the user turn, workspace binding, active file/folder, active UI state, and a small list of lane options.
2. The runtime uses that scout result to choose a bounded lane: allowed tools, context budget, memory policy, verification policy, preview policy, and UI chrome.
3. The main agent still reasons freely inside that lane. The lane is a budget contract, not a script.

The point is not "regex router." The point is "thin-context first, then controlled expansion."

## Things We Must Not Forget

These are the defects that triggered this memo.

1. Simple static web tasks became slow because Atlas exposed the whole agent cockpit instead of a small file-edit/preview lane.
2. The stop button did not feel authoritative because cancellation is not a single transaction across model stream, tool execution, background jobs, memory observer, proof recorder, and UI state.
3. OpenRouter eventually got the calculator preview open, but the foreground UX still showed stale todos and harness internals.
4. Ollama/qwen generated unrelated JSON and exited. That is a provider compatibility/lane problem, not just a prompt problem.
5. Plan mode appears able to influence normal run behavior because the store is global and the prompt forbids bash while active.
6. The prompt already tells Atlas to use `serve_preview` and OS open commands for static HTML, but the model still chose the wrong route. Advisory prompt text is not enough.
7. Todos are useful for complex work and harmful as foreground clutter for tiny tasks.
8. Proof receipts are good for trust, but too visible for simple creation/open flows.
9. Source-pack research says "progressive disclosure," but product behavior still defaults to broad disclosure.
10. Memory is currently several prompt sources glued together, not a single harness-owned memory governor.

## Source-Parity Lessons

### Claude Code / Claude-Style Harness

Useful lessons:

- CLAUDE.md/root instructions should be lean, broadly applicable, and always loaded.
- Specialized knowledge belongs in skills and subagents, not root context.
- Hooks should automate deterministic checks and self-improvement; they should not be prompt reminders.
- LSP and subagents are high-value after the basics work.
- Subagents should split exploration from editing and return findings, not bring their whole context back.
- Memory should be an index plus topic files plus grep-only transcripts, not a giant always-loaded dump.

Atlas mistake:

- Atlas adapted many surfaces, but exposed them too early in the default path.

### Hermes

Useful lessons:

- The agent loop owns provider mode, prompt assembly, interruptible calls, tool dispatch, compression, fallback, iteration budgets, and memory flushing.
- Cached system prompt state and API-call-time overlays are deliberately separated.
- Memory snapshot is frozen for the session to preserve cache behavior.
- Live memory writes persist to disk, but do not mutate the active prompt mid-session.
- Session search is separate from memory: memory is tiny and always available; session search is unlimited and on-demand.
- Agent-level tools like todo, memory, session_search, and delegate_task are intercepted by the runtime because they mutate agent state.

Atlas mistake:

- Atlas lets too many stateful surfaces sit at the same level as ordinary tools.

### SimpleMem / EvolveMem

Useful lessons:

- The real value is semantic structured compression, online synthesis, recursive consolidation, and adaptive query-aware retrieval.
- Memory efficiency comes from high-density memory units and query-time retrieval planning, not from shoving more remembered text into every prompt.
- EvolveMem's important insight is that retrieval configuration must evolve from failure logs, not stay frozen.
- SimpleMem should be the default advanced memory engine when healthy, with LocalRecords as a fail-safe offline ledger.

Atlas mistake:

- Atlas currently treats SimpleMem as an optional sidecar context source more than as the memory controller.

### Aider

Useful lessons:

- Repo maps win by being token-budgeted, ranked, cached, and refreshed intentionally.
- Context window pressure and cost are first-class metrics.
- Weak/local models need model-specific handling for context, reasoning tags, and provider quirks.

Atlas mistake:

- Atlas has repo-map-like machinery, but the main loop does not yet make repo-map selection a strict budget decision.

### System Prompt Repos

Useful lessons:

- Mature prompts are layered: identity, tool contract, environment, task mode, memory snapshot, skills index, output contract.
- Specialized prompts are short and role-specific: explore, memory synthesis, dream consolidation, code review, quick commit, plan mode.
- Good prompts do not replace runtime boundaries. The explore prompt is read-only because the toolset is read-only.

Atlas mistake:

- Atlas's base prompt contains many correct instructions, but several are not enforced by runtime/tool eligibility.

## Raw Critical Defects

### Runtime And Tool Surface

1. Default `buildTools(ctx)` exposes the full toolbelt.
2. Benchmark ablation lanes exist but are not the default product architecture.
3. Tool choice is too model-led for obvious flows like static HTML preview.
4. `serve_preview` is a good fused tool, but the harness should auto-select the preview lane before the model sees generic shell tools.
5. `bash_background` remains available in flows where only `serve_preview` should be eligible.
6. `bash_run` includes OS opener guidance, but the model can miss it.
7. Shell/server lifecycle is too visible to the model.
8. Tool schemas are too large for weak local models.
9. MCP, LSP, memory, proof, work packets, subagents, and todo should not all be in the default simple-edit lane.
10. Atlas has observability, but not enough controller feedback from observability.

### Context Engineering

11. `projectMemory` concatenates heterogeneous sources into one prompt block.
12. The prompt label `PROJECT - ATLAS.md` is misleading when the block also contains memory, skills, work packets, and SimpleMem.
13. Stable prompt, project instructions, memory, work packet, and skills have different lifetimes but are packed together.
14. Volatile memory/context harms provider-side prompt caching.
15. Prompt compaction elides tool output but does not synthesize task state.
16. Context packing happens before knowing how much context the task actually needs.
17. Atlas does not yet have a hard "context budget per lane" contract.
18. Current context ledgers measure cost but do not strongly prevent overpacking.
19. Repository truth outranks memory in text, but memory can still distract the model.
20. The system prompt has grown into a dense policy document rather than a small stable contract.

### Memory

21. SimpleMem should be the default advanced engine when healthy, not a marginal optional novelty.
22. SimpleMem should not be default prompt injection.
23. LocalRecords should remain offline fail-safe and provenance ledger.
24. `.atlas/memory` should be visible project memory, not the only memory surface.
25. Memory needs a frozen session snapshot.
26. Live memory writes should not mutate the active prompt mid-session.
27. Session transcripts should be search-only by default.
28. Memory index lines should be small pointers, not content.
29. Topic files should be loaded only when relevant.
30. Memory writes need contradiction handling, duplicate collapse, and stale marking.
31. Memory needs a "do not store derivable facts" law.
32. Code facts should generally be re-derived from repo reality, not stored.
33. Memory extraction should produce structured units with provenance and confidence.
34. Memory retrieval should cite source records/files.
35. The main agent should treat retrieved memory as hints, not truth.
36. SimpleMem failure logs should feed EvolveMem-style retrieval tuning.
37. Memory efficiency needs benchmark gates, not vibes.

### Planning And Todos

38. Plan mode is global UI state rather than run/session scoped.
39. Accidental plan mode can forbid shell execution.
40. Plan mode should be a mode with tool eligibility changes, not just extra prompt text.
41. Todos should be hidden in simple lanes.
42. Todo state should expire or close when proof/run state finishes.
43. Todo writes should never be used as a substitute for doing the next action.
44. Stale todos are a UX correctness bug.

### Provider Behavior

45. Local and API models need separate capability profiles.
46. Weak/local model routes need smaller tool schemas and stricter output parsing.
47. API model routes should not inherit local-model workaround bloat.
48. Provider fallback should be a turn-level transaction with spend and retry limits.
49. OpenRouter fallback should preserve conversation/tool state cleanly.
50. JSON/tool-call repair should happen in provider adapters, not the main prompt.
51. Model registry should encode tool-call reliability, context reliability, output quirks, and known unsupported parameters.
52. Benchmarks must report provider failure separately from harness failure.

### Repo Understanding

53. Repo map should be selected under token budget, not merely offered as a tool.
54. LSP should activate by language/task, not default full exposure.
55. Search should be parallelized where safe.
56. Exploration and editing should be split for large ambiguous code tasks.
57. Read-only subagents should write/findings only when the parent asks.
58. For simple new-file apps, repo map is wasteful and should be skipped.
59. For existing repo fixes, repo map and LSP should often happen before file reads.

### UX

60. The UI currently foregrounds harness mechanics during simple tasks.
61. The calculator task should show "editing", "preview", "ready", not a todo/proof cockpit.
62. Proof receipts should collapse by default unless a check fails or user expands.
63. Plan strip should only appear for the current session/run.
64. Preview should not be obscured by the agent window.
65. The user should see whether a server was reused, spawned, or skipped because a static file was opened directly.
66. Stop should immediately change visible state and terminate the run transaction.
67. Verification state should be understandable: smoke, completed, verified, failed.
68. "Unverified" should not feel like failure for tasks where no meaningful automated check exists.

### Product And Benchmarks

69. A calculator task failing polish is a P0 product signal.
70. Atlas should benchmark first-pass success, not eventual success after repeated prompting.
71. Metrics must include wall time, tool count, token count, cache hits, preview correctness, stop latency, stale UI state, and user prompts required.
72. The benchmark matrix must separate local models, cheap API models, and frontier API models.
73. The harness should optimize cost per accepted outcome, not raw token reduction.
74. UI/UX failures should be counted as benchmark failures.
75. Memory retrieval false positives should be benchmarked.
76. Stale memory contradiction tests should be benchmarked.
77. Context overpacking should be benchmarked.
78. Model-specific fallback behavior should be benchmarked.

## What To Build Next

### P0: Thin-Context Intent Scout

Create a tiny model call or cheap structured decision step that receives:

- user message
- current workspace/session binding
- active file/folder
- current UI state: plan active, preview active, background jobs
- recent run state summary
- available lane names only

It returns:

- lane
- confidence
- whether to ask a question
- minimum context needed
- tool families needed
- memory policy
- verification policy

This is not a hardcoded pipeline. It is LLM-driven routing with a tiny context and runtime-enforced budgets.

### P0: Lane Contracts

Start with these lanes:

1. `chat`: no mutation tools, no repo map, tiny memory.
2. `simple_create`: fs/edit only, no todo, no repo map, optional preview.
3. `static_web_app`: fs/edit plus OS-open/preview policy, no generic server spawn unless needed.
4. `repo_patch`: repo_context/repo_map, fs/edit/search, targeted verification.
5. `debug_test`: terminal output, search, edit, shell checks.
6. `research`: web/source reading, no mutation unless user asks.
7. `benchmark`: strict budget, isolated projects, trace capture.

Each lane controls:

- allowed tools
- allowed memory sources
- max steps
- max tool calls
- max prompt/context budget
- UI chrome
- verification requirement
- fallback behavior

### P0: Memory Kernel

Implement an Atlas memory kernel with this shape:

1. `PinnedContext`: tiny stable user/project facts. Always bounded.
2. `SimpleMemProvider`: default advanced retrieval/consolidation engine when healthy.
3. `LocalRecordsProvider`: offline typed fallback and provenance ledger.
4. `MemoryIndex`: visible `.atlas/memory/MEMORY.md` index, capped and human-reviewable.
5. `TopicFiles`: optional project-visible files loaded on demand.
6. `SessionSearch`: FTS/grep over transcripts, never fully injected.
7. `MemorySynthesizer`: small subagent/tool that returns max 7 cited facts for a query.
8. `DreamConsolidator`: background/forked consolidation with lock, drift checks, and index pruning.

Prompt surface:

- Always inject only PinnedContext plus a tiny memory index/snapshot.
- Retrieve SimpleMem/topic/session facts only after the lane or agent asks for them.
- Mark all recalled memory as advisory.
- Require citations/provenance.

### P0: Stop Transaction

Stop must cancel:

- model request
- streamed parser
- pending tool calls
- background process started for this run when appropriate
- proof recorder
- SimpleMem observer
- plan/todo transient state for this run
- UI spinner/progress state

Then it must emit one final run state: cancelled.

### P1: UI Quiet Mode

For simple lanes:

- Hide todo strip.
- Collapse proof receipt.
- Show one compact status line.
- Keep preview unobstructed.
- Treat static HTML open as success when OS opener returns.

### P1: Prompt Split

Split Atlas prompt assembly into:

1. Stable identity and safety/tool contract.
2. Project instructions.
3. Runtime environment binding.
4. Memory snapshot.
5. Lane prompt.
6. Provider compatibility overlay.
7. Ephemeral current-turn hints.

Only stable layers should be cache-stable. Volatile layers should be small and separately measured.

### P1: Provider Profiles

For each model/provider, record:

- tool-call reliability
- JSON reliability
- context limit
- good default max steps
- schema budget
- reasoning/thinking parameter support
- cache support
- known quirks
- fallback priority

The harness should choose schemas and prompts from the profile.

## What Not To Do

1. Do not add more prompt text to fix the calculator failure.
2. Do not make every local-model workaround part of the API-model path.
3. Do not expose SimpleMem by dumping more memory into the prompt.
4. Do not build a rigid task pipeline that prevents nuance.
5. Do not keep adding foreground UX strips before basic creation/run flows feel polished.
6. Do not benchmark only code correctness while ignoring UI stuck states.
7. Do not let proof, memory, todo, and work packets all become competing sources of task truth.

## Sources Consulted

- `source_pack.md`
- `STACK.md`
- `src/modules/ai/config.ts`
- `src/modules/ai/lib/agent.ts`
- `src/modules/ai/lib/transport.ts`
- `src/modules/ai/tools/tools.ts`
- `src/modules/ai/store/planStore.ts`
- Hermes docs: agent loop, prompt assembly, persistent memory
- SimpleMem and EvolveMem papers/repository README
- Claude large-codebase best-practices article
- LangChain "Your harness, your memory"
- Anthropic "Building effective agents"
- Cached upstream prompt/source repositories: Piebald Claude Code system prompts, x1xhlol system prompts, multica-ai Andrej Karpathy skills, Aider, OpenHands, opencode, Hermes

