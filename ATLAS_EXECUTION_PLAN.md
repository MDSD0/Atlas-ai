# Atlas Evidence-Backed Execution Plan

Status: canonical implementation roadmap

Plan version: `2026-05-31.1`

This file is the implementation overview for Atlas after the pre-plan learning pass. It replaces the executable meaning of `plans/ATLAS_PLAN.md`, which describes an archived Python/FastAPI and Svelte direction. Preserve that legacy file as historical evidence. Do not execute it against the active React/Tauri repository.

This plan is intentionally revisable. The agent field is moving quickly. Before each non-trivial slice, refresh the relevant primary documentation and upstream source, record the evidence packet, and patch this file when the evidence changes the decision.

## 1. Product Thesis

Atlas is an AI-native terminal and coding workspace built on an existing Tauri 2, Rust, React 19, xterm.js, CodeMirror, and Vercel AI SDK substrate.

Atlas should not become another IDE clone with an assistant bolted on. Its differentiator is a tight local harness:

1. Bind the agent to an explicit workspace and session.
2. Keep a bounded, fresh model of repository reality.
3. Let the agent read, search, edit, run, and verify through narrow tools.
4. Return diagnostics, tests, proof artifacts, and visible receipts.
5. Use memory as a controlled retrieval input, never as a substitute for repository truth.

The active product is a desktop terminal with an agent harness. It is not a hosted Python backend, not an unbounded autonomous runner, and not a blank-page rewrite.

## 2. Hard Rule: No Blank-Page Subsystems

No non-trivial Atlas subsystem may be implemented from scratch.

Every implementation slice starts with a source-parity packet:

```text
Slice:
Atlas files inspected:
Primary documentation inspected:
opensrc repositories inspected:
Exact upstream files inspected:
Disposition for each upstream:
Atlas-owned integration code:
Rejected upstream behavior and reason:
Parity tests:
Freshness: refreshed | cached fallback
Source commits or package versions:
```

Allowed dispositions:

| Disposition | Meaning | Required evidence |
| --- | --- | --- |
| `COPY` | Behavior can be copied with attribution and compatible licensing. | File-level attribution and parity test. |
| `ADAPT` | Upstream behavior is useful but must fit Atlas boundaries. | Difference note and parity test. |
| `WRAP` | Existing dependency or process already owns the behavior. | Adapter contract, failure behavior, and fallback test. |
| `BENCHMARK` | Candidate is evaluated before adoption. | Dataset, metric, result, and keep/reject decision. |
| `STUDY` | Upstream informs architecture but is not directly shipped. | Recorded decision and reason. |
| `REJECT` | Upstream behavior is intentionally excluded. | Explicit rationale and a test where exclusion protects an invariant. |

Rules:

1. `COPY` and `ADAPT` without a parity test are incomplete.
2. `WRAP` without a failure-path test is incomplete.
3. `BENCHMARK` without measured output is incomplete.
4. `STUDY` without a recorded decision is incomplete.
5. `REJECT` without a rationale is incomplete.
6. Atlas owns integration glue, policy, UX, and proof composition. It should not reimplement parsers, protocols, editors, terminals, language servers, or memory engines.
7. Run `bash scripts/consult-opensrc.sh <topic> [topic...]` before editing a non-trivial subsystem.
8. Update `source_pack.md` before implementation begins.

This is how Atlas implements every reference: each reference receives an explicit disposition and a measurable adaptation decision. It does not mean importing every feature from every repository.

## 3. Evidence Refresh Protocol

Run this protocol at the beginning of every slice and again before merging a slice that depends on fast-moving external behavior.

### 3.1 Required refresh

1. Select topics with `bash scripts/consult-opensrc.sh --list`.
2. Resolve the focused source set with `bash scripts/consult-opensrc.sh <topic> [topic...]`.
3. Refresh freshness-sensitive GitHub sources through `scripts/consult-opensrc.sh`. The hook uses `GITHUB_TOKEN` or `GH_TOKEN` when present and otherwise bridges the active `gh` keyring token at runtime.
4. Record whether each source is refreshed or an opensrc cached fallback.
5. Record the upstream commit with `git -C <resolved-path> rev-parse HEAD` when the source is a Git checkout.
6. Read the official protocol or framework documentation for any external contract changed by the slice.
7. Patch the reference ledger in this file if a newer upstream shape changes the decision.
8. Add the slice packet to `source_pack.md`.

### 3.2 Freshness-sensitive sources

Always refresh these before implementation because their public APIs or design guidance can change:

- Tauri 2 commands, capabilities, and desktop testing documentation.
- Model Context Protocol specification and the selected TypeScript SDK release.
- Vercel AI SDK behavior used by the agent loop.
- Claude Code hooks, memory, skills, and MCP documentation when matching external coding-agent workflows.
- OpenCode LSP and permission implementation.
- Aider repo-map implementation.
- MemoryLab candidates.

### 3.3 Evidence quality

Use primary sources for technical decisions:

- Official documentation.
- Official protocol specifications.
- Source repositories resolved through opensrc.
- Repository tests and fixtures.
- Reproducible local benchmarks.

Treat README performance claims as upstream-reported until Atlas reproduces them.

## 4. Active Repository Reality

The current Atlas codebase already contains useful substrate. The first implementation work is hardening and integration, not replacement.

### 4.1 Reuse inventory

| Area | Active Atlas source | Current value | Plan |
| --- | --- | --- | --- |
| Workspace registry | `src-tauri/src/modules/workspace.rs` | Canonical root authorization and spawn checks already exist. | Extend and centralize. |
| Agent shell | `src-tauri/src/modules/shell/` | One-shot, persistent, and background shells are cwd-gated. Background logs use a bounded ring buffer. | Preserve. Add proof events. |
| Atomic file write | `src-tauri/src/modules/fs/file.rs` | Temp-file write and rename path already exists. | Preserve. Add native authorization. |
| Watcher | `src-tauri/src/modules/fs/watch.rs` | `notify`, debounce, generated-dir skips, and `fs:changed` emission already exist. | Reuse for CodeReality invalidation. |
| Native grep | `src-tauri/src/modules/fs/grep.rs` | Uses Rust `grep-regex`, `grep-searcher`, and `ignore`. | Benchmark before adding a ripgrep process. |
| Native file walk | `src-tauri/src/modules/fs/search.rs` | Ignore-aware capped walk already exists. | Reuse and share ignore policy. |
| Frontend tool context | `src/modules/ai/tools/context.ts` | Project binding and relative-path resolution exist. | Harden canonical boundary checks. |
| Agent tools | `src/modules/ai/tools/` | Read, write, edit, search, grep, and shell surfaces exist. | Add trust, receipts, and post-edit feedback. |
| Agent loop | `src/modules/ai/lib/agent.ts` | Streaming loop, step cap, tool callbacks, compaction, and metadata hooks already exist. | Instrument, do not replace. |
| Session binding | `src/modules/ai/store/chatStore.ts` | Central `ToolContext` and per-session read cache exist. | Add proof and memory identifiers. |
| Explorer watcher | `src/modules/explorer/lib/watch.ts` | UI refresh path for file changes exists. | Reuse event path. |
| CI | `.github/workflows/ci.yml` | Frontend and Rust Linux checks plus Rust macOS/Windows checks exist. | Expand to integration and desktop gates. |

### 4.2 Known defects to resolve first

| ID | Severity | Defect | Active source | Required correction |
| --- | --- | --- | --- | --- |
| `B0` | Baseline | Clippy fails on an existing macOS conditional `unused_mut`. | `src-tauri/src/lib.rs` | Restore clean `cargo clippy --all-targets --locked -- -D warnings`. |
| `B1` | Baseline | Local Vitest startup is blocked by a Rollup native binary Team ID signature mismatch. | Local dependency install | Repair and document a reproducible pnpm install state. |
| `S0` | Critical | Raw Rust filesystem commands resolve OS paths without consulting the workspace registry. | `src-tauri/src/modules/fs/` | Add a native canonical authorization helper and apply it intentionally to filesystem IPC. |
| `S1` | High | Frontend workspace authorization failure is swallowed before the root is bound. | `src/modules/workspace/workspaceStore.ts` | Make binding fail closed and surface the error. |
| `S2` | High | Frontend `isWithinPath()` lowercases paths universally, which is wrong on case-sensitive filesystems. | `src/modules/ai/tools/context.ts` | Use platform-aware canonical comparison. |
| `S3` | High | Read-before-edit checks only test cache presence. They do not compare the current file against the prior read. | `src/modules/ai/tools/edit.ts` | Cache and compare a content fingerprint before edit application. |
| `S4` | High | Concurrent same-file edits are not serialized. | `src/modules/ai/tools/edit.ts` | Adapt Pi's realpath-keyed file mutation queue. |
| `S5` | Medium | Startup authorization includes the launch directory and home directory. Reusing that registry blindly may grant a wider agent filesystem surface than intended. | `src-tauri/src/modules/workspace.rs` | Separate explicit app OS access from agent project policy and test the distinction. |
| `T0` | Baseline | No cross-layer fixture harness currently proves native IPC, agent tool, watcher, proof, and desktop flows together. | Repository-wide | Build the test harness before feature expansion. |

## 5. Architectural Invariants

These are merge blockers.

### 5.1 Trust

1. Rust owns OS access.
2. Every native filesystem IPC path is canonicalized and checked against an authorized root before access.
3. Agent file tools require an explicitly bound project.
4. App UI authorization and agent project policy are distinct concepts even if they share helpers.
5. Secret-path checks run on read and write after canonicalization.
6. Symlink escapes are rejected.
7. Stale edits are rejected.
8. Same-file mutations are serialized.
9. Dangerous shell actions remain approval-gated.

### 5.2 Repository truth

1. Current filesystem and language-server evidence outrank memory.
2. File inventory, symbol graph, and projections carry freshness metadata.
3. Watcher events invalidate affected reality records.
4. Generated directories and ignored files stay excluded by a shared policy.
5. Repo-map context is bounded by a token budget.
6. Language servers are optional accelerators. Atlas degrades gracefully when a server is absent.

### 5.3 Memory

1. Memory is part of the harness from the beginning.
2. Memory is not a second source of code truth.
3. Memory records have provenance, timestamps, confidence, and invalidation state.
4. Memory providers compete in MemoryLab before adoption.
5. Project-local durable memory is inspectable and deletable.
6. The default local ledger works with no external provider, runtime, or network. Boot never depends on memory-provider health.

### 5.4 Proof

1. A tool result is not a proof verdict.
2. Every agent run emits addressable artifacts.
3. A completed coding run records changed files, commands, diagnostics, tests, and final verdict.
4. Proof receipts are visible in the UI.
5. Failed checks remain visible and cannot be silently summarized away.

### 5.5 Performance

1. Unused features consume near-zero runtime resources.
2. Parsing, LSP, graph, and memory work are lazy.
3. Watcher-driven invalidation is incremental.
4. Output, event, and log storage are bounded.
5. New dependencies require size, startup, and steady-state measurements.

## 6. Reference Ledger

Every upstream in `docs/opensrc-references.tsv` remains available for focused inspection. This ledger assigns the planned V1 disposition.

| Reference | Disposition | Atlas use |
| --- | --- | --- |
| `crynta/terax-ai` | `STUDY` | Substrate lineage comparison. Preserve compatible local architecture rather than re-importing the fork. |
| `vercel-labs/opensrc` | `WRAP` | Mandatory upstream and dependency source resolver through `scripts/consult-opensrc.sh`. |
| `Aider-AI/aider` | `ADAPT` | Port repo-map concepts: tag cache, graph ranking, mentioned-identifier boost, token-budget projection, and tree snippets. |
| `Aider-AI/grep-ast` | `STUDY` | Inspect extraction strategy while using direct tree-sitter integration suited to Rust. |
| `anomalyco/opencode` | `ADAPT` | Borrow lazy LSP client lifecycle, post-edit diagnostic feedback, and explicit allow/ask/deny permission shape. |
| `oraios/serena` | `STUDY` | Compare semantic query UX and provider boundaries. Do not make it the V1 core. |
| `DeusData/codebase-memory-mcp` | `ADAPT` | Borrow graph schema ideas, watcher invalidation, selective queries, and hybrid LSP thinking. |
| `QuantaAlpha/RepoMaster` | `STUDY` | Research evidence for graph-guided repository understanding. Do not ship paper claims as product guarantees. |
| `princeton-nlp/SWE-agent` | `STUDY` | Compare tool feedback and agent-computer interface design. |
| `SWE-agent/mini-swe-agent` | `STUDY` | Preserve a small-loop bias and resist unnecessary orchestration. |
| `All-Hands-AI/OpenHands` | `STUDY` | Borrow event-trace and runtime-boundary concepts. Defer sandbox adoption until a measured need exists. |
| `openai/codex` | `STUDY` | Compare approvals, project guidance, and agent execution receipts. |
| `earendil-works/pi` | `ADAPT` | Borrow minimal-core lifecycle, extension shape, and realpath-keyed file mutation serialization. |
| `aiming-lab/SimpleMem` | `WRAP` | Optional advanced memory provider behind `AtlasMemoryProvider`. Health-checked, not required at boot. Borrow memory units, retrieval signals, and consolidation. |
| `mem0ai/mem0` | `BENCHMARK` | Evaluate as a production-style memory provider candidate in MemoryLab. Not default, not rejected. |
| `getzep/graphiti` | `STUDY` | Study temporal graph memory. Exclude from V1 core. |
| `getzep/zep` | `STUDY` | Study hosted temporal-memory tradeoffs. Exclude from V1 core. |
| `anthropics/skills` | `ADAPT` | Borrow packaging conventions for inspectable local skills. |
| `anthropics/anthropic-quickstarts` | `STUDY` | Compare compact agent-loop examples and conversation history handling. |
| `vercel-labs/skills` | `STUDY` | Compare skill package ergonomics. |
| `vercel-labs/open-agents` | `STUDY` | Compare agent examples without importing orchestration by default. |
| `modelcontextprotocol/typescript-sdk` | `WRAP` | Use a pinned stable MCP SDK release and run conformance checks. Do not build the protocol. |
| `modelcontextprotocol/python-sdk` | `STUDY` | Cross-check protocol behavior only. Atlas desktop remains TypeScript/Rust. |
| `modelcontextprotocol/servers` | `STUDY` | Inspect connector examples and bounded tool schemas. |
| `github/github-mcp-server` | `STUDY` | First-party connector study for a later optional integration. |
| `microsoft/playwright-mcp` | `STUDY` | Browser connector study for a later optional integration. |
| `coleam00/archon` | `REJECT` | Defer workflow-layer orchestration until the local harness proves a measured need. |
| `odylith/odylith` | `STUDY` | Compare execution-trail and governance concepts for later enterprise work. |
| `eclipse-theia/theia` | `REJECT` | Do not adopt an IDE platform while the current lightweight substrate is viable. |
| `tree-sitter/tree-sitter` | `WRAP` | Use incremental parsing and explicit edits. Do not build a parser. |
| `tree-sitter/tree-sitter-javascript` | `WRAP` | Ship JavaScript grammar support. |
| `tree-sitter/tree-sitter-typescript` | `WRAP` | Ship TypeScript and TSX grammar support. |
| `tree-sitter/tree-sitter-python` | `WRAP` | Ship Python grammar support. |
| `tree-sitter/tree-sitter-rust` | `WRAP` | Ship Rust grammar support. |
| `sourcegraph/scip` | `STUDY` | Defer cross-repository index protocol support until V1 graph limits are measured. |
| `microsoft/language-server-protocol` | `WRAP` | Implement an LSP client boundary against the official protocol. |
| `openlawlibrary/pygls` | `STUDY` | Legacy-plan comparison only. |
| `typescript-language-server/typescript-language-server` | `WRAP` | Optional TypeScript language-server adapter. |
| `microsoft/pyright` | `WRAP` | Optional Python language-server adapter. |
| `rust-lang/rust-analyzer` | `WRAP` | Optional Rust language-server adapter. |
| `helix-editor/helix` | `STUDY` | Deferred LSP/editor architecture comparison. |
| `zed-industries/zed` | `STUDY` | Deferred LSP/editor architecture comparison. |
| `lapce/lapce` | `STUDY` | Deferred LSP/editor architecture comparison. |
| `microsoft/vscode` | `STUDY` | Deferred LSP/editor architecture comparison. |
| `tauri-apps/create-tauri-app` | `STUDY` | Scaffold comparison only. |
| `tauri-apps/tauri` | `WRAP` | Preserve Tauri 2 command IPC and capability model. Add Atlas policy checks inside custom Rust commands. |
| `codemirror/dev` | `WRAP` | Preserve editor substrate. |
| `xtermjs/xterm.js` | `WRAP` | Preserve terminal renderer substrate. |
| `sveltejs/svelte` | `REJECT` | Legacy-plan UI only. Active Atlas uses React. |
| `langchain-ai/langmem` | `STUDY` | Compare memory framework concepts. Do not make it Atlas core. |

## 7. Test Architecture

Testing is not a final phase. Each vertical slice extends the harness before it extends the product.

### 7.1 Test layers

| Layer | Scope | Location or planned location | Merge rule |
| --- | --- | --- | --- |
| `L0` | Formatting, type checks, lints, dependency lock, Markdown plan checks | Existing scripts plus planned `scripts/verify-atlas.sh` | Required on every PR. |
| `L1` | Pure Rust and TypeScript unit tests | Existing colocated `#[cfg(test)]` and `*.test.ts` files | Required for every changed invariant. |
| `L2` | Native integration tests across filesystem, watcher, shell, graph, and LSP adapters | Planned `src-tauri/tests/` | Required for native boundary work. |
| `L3` | Frontend tool integration using mocked Tauri invokes and deterministic agent steps | Planned `src/modules/ai/**/*.integration.test.ts` | Required for agent-tool work. |
| `L4` | Packaged desktop smoke tests against real Tauri IPC | Planned `tests/desktop/` | Required before each milestone release. |
| `L5` | Scripted agent evaluations against fixture repositories | Planned `tests/evals/` | Required for harness capability claims. |
| `L6` | System-wide manual and CI matrix on macOS, Linux, and Windows | CI plus release checklist | Required for V1 release. |

### 7.2 Fixture repositories

Create small deterministic fixture repositories under `tests/fixtures/`:

| Fixture | Purpose |
| --- | --- |
| `simple-ts` | TypeScript imports, definitions, references, diagnostics, edits, and tests. |
| `mixed-stack` | TypeScript, Python, and Rust cross-language inventory and ranking. |
| `symlink-escape` | Workspace symlink escape, secret path, rename, delete, and canonicalization attacks. |
| `stale-edit` | Read, external modification, stale edit rejection, reread, and retry. |
| `ignore-heavy` | `.gitignore`, generated trees, large files, binary files, and watcher invalidation. |
| `lsp-missing` | Graceful behavior when an expected language server is absent. |
| `memory-stale` | Memory entry that conflicts with current repository truth. |
| `proof-failure` | Intentional test and diagnostic failures that must remain visible in receipts. |

Fixtures should be tiny enough to reason about and deterministic enough for snapshot tests.

### 7.3 Standard verification command

Plan and add `scripts/verify-atlas.sh` during Phase 0. It must provide focused and full modes:

```bash
bash scripts/verify-atlas.sh --fast
bash scripts/verify-atlas.sh --native
bash scripts/verify-atlas.sh --desktop
bash scripts/verify-atlas.sh --eval
bash scripts/verify-atlas.sh --all
```

`--all` must run at least:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
cd src-tauri && cargo check --all-targets --locked
cd src-tauri && cargo clippy --all-targets --locked -- -D warnings
cd src-tauri && cargo test --locked
```

As new layers land, add their commands to `--all`.

### 7.4 System-wide scripted scenarios

| ID | Scenario | Required outcome |
| --- | --- | --- |
| `SYS-00` | Launch Atlas with no project bound. Ask the agent to edit a file. | Mutation is refused with a visible reason. |
| `SYS-01` | Open an authorized fixture workspace. Read, edit, and save a normal file. | Edit succeeds atomically and produces a receipt. |
| `SYS-02` | Attempt raw filesystem IPC outside an authorized root. | Rust rejects it even if the frontend call is forged. |
| `SYS-03` | Attempt `../`, symlink, case-variant, and secret-path escapes. | Every escape is rejected at the correct boundary. |
| `SYS-04` | Read a file, modify it externally, then apply the old agent edit. | Stale edit is rejected. A reread and retry succeeds. |
| `SYS-05` | Start two same-file edits concurrently. | Mutations serialize by canonical realpath. No write is lost. |
| `SYS-06` | Run a background command with enough output to exceed the cap. | Logs remain bounded and the UI stays responsive. |
| `SYS-07` | Edit a TypeScript file into a diagnostic error. | LSP feedback appears in the tool result and proof receipt. |
| `SYS-08` | Remove the diagnostic error and run the fixture tests. | Updated diagnostics clear and the test receipt records success. |
| `SYS-09` | Change a watched source file outside Atlas. | Inventory, symbol graph, and projections invalidate incrementally. |
| `SYS-10` | Open `ignore-heavy`. | Ignored and generated trees stay absent from graph, search, and projections. |
| `SYS-11` | Disable language-server availability. | Search, tree-sitter graph, editing, and proof still work with an explicit degraded status. |
| `SYS-12` | Seed stale memory that contradicts the source tree. | Repo truth wins. The stale memory is marked or down-ranked. |
| `SYS-13` | Attach an MCP server that times out or returns oversized output. | Timeout and output bounds hold. Core Atlas remains usable. |
| `SYS-14` | Restart Atlas after a completed run. | Session, receipts, and allowed memory restore without reviving stale runtime state. |
| `SYS-15` | Run the release smoke flow on macOS, Linux, and Windows. | Terminal, workspace binding, read, edit, shell, and proof pass on all platforms. |

### 7.5 Scripted user prompts

Every phase includes at least one prompt-level test. Use deterministic prompts against fixtures:

```text
Open the bound project, find the function that formats the greeting, change the punctuation, run the narrow test, and show proof.
```

```text
Read src/value.ts. Wait for the external modification. Apply your proposed edit without rereading.
```

```text
Find the definition and references of calculateTotal, make the smallest correction, show diagnostics, and run the relevant test.
```

```text
Use prior memory only if it still matches the repository. Explain which current files prove the answer.
```

## 8. Delivery Strategy

Implement vertical releases. Do not build all storage, then all indexing, then all UI. Each release must work end-to-end with a visible receipt.

| Milestone | User-visible outcome |
| --- | --- |
| `M0` Verification floor | Reproducible local and CI baseline with fixture harness. |
| `M1` Trusted editing | A bound agent can safely read, edit, run, and show a minimal proof receipt. |
| `M2` Fresh repo reality | Agent and user can inspect bounded, watcher-refreshed repository context. |
| `M3` Semantic feedback | Optional LSP enriches edits with diagnostics, definitions, and references. |
| `M4` Controlled memory | Project memory participates in the harness and loses to current repo truth when stale. |
| `M5` Scoped extensions | Skills and MCP can extend the harness without bypassing policy or proof. |
| `M6` Release candidate | Metrics, evals, cross-platform tests, and a repeatable demonstration pass. |

## 9. Phase 0: Verification Floor and Evidence Freeze

Goal: establish a reproducible baseline before feature work.

### Slice 0.1: Freeze evidence

References:

- `vercel-labs/opensrc`: `WRAP`
- Official Tauri 2 documentation: `STUDY`
- Official MCP specification: `STUDY`

Tasks:

1. Run `bash scripts/consult-opensrc.sh --all`.
2. Record cached versus refreshed resolution for every tier 0 and tier 1 source.
3. Record exact commit hashes for the source set used by the first milestone.
4. Add a dated evidence packet to `source_pack.md`.
5. Add an issue-style list for any source that could not be refreshed due to rate limiting.

Gate:

- A reviewer can reproduce the source set without guessing.

### Slice 0.2: Restore baseline checks

Tasks:

1. Fix `B0` without changing runtime behavior.
2. Repair the pnpm dependency install state responsible for `B1`.
3. Run the existing checks on a clean dependency install.
4. Confirm `.github/workflows/ci.yml` passes or document external CI blockers with logs.
5. Add `scripts/verify-atlas.sh`.

Tests:

- `pnpm exec tsc --noEmit`
- `pnpm test`
- `pnpm build`
- `cargo check --all-targets --locked`
- `cargo clippy --all-targets --locked -- -D warnings`
- `cargo test --locked`

Gate:

- `bash scripts/verify-atlas.sh --fast` passes locally.
- Rust tests remain at or above the current baseline count.

### Slice 0.3: Add fixture harness

Tasks:

1. Add the fixture repositories listed in Section 7.2.
2. Add fixture reset helpers that copy a pristine fixture into a temporary directory.
3. Add a deterministic port allocator for background preview tests.
4. Add test helpers for temporary authorized roots.
5. Add test helpers for collecting Tauri command errors and emitted events.

Tests:

- Fixture reset is idempotent.
- Temporary roots are deleted after tests.
- Two parallel fixture tests do not share mutable state.

Gate:

- All later phases can express acceptance tests using fixture repos.

### Slice 0.4: Expand CI matrix intentionally

Tasks:

1. Keep Linux frontend and Rust checks.
2. Keep Rust `cargo check` on macOS and Windows.
3. Add the cheapest high-value integration smoke possible on each platform.
4. Add desktop smoke coverage where the Tauri test driver supports the platform.
5. Keep any unsupported platform manual release gate explicit.

Gate:

- CI and the release checklist clearly separate automated from manual platform coverage.

## 10. Phase 1: Trusted Workspace and Edit Boundary

Goal: make the existing local agent safe enough for end-to-end use.

References:

- Tauri 2 command and capability documentation: `STUDY`
- `tauri-apps/tauri`: `WRAP`
- `anomalyco/opencode:packages/opencode/src/permission/index.ts`: `ADAPT`
- `earendil-works/pi:packages/coding-agent/src/core/tools/file-mutation-queue.ts`: `ADAPT`

### Slice 1.1: Native filesystem authorization

Active Atlas files:

- `src-tauri/src/modules/workspace.rs`
- `src-tauri/src/modules/fs/file.rs`
- `src-tauri/src/modules/fs/tree.rs`
- `src-tauri/src/modules/fs/mutate.rs`
- `src-tauri/src/modules/fs/search.rs`
- `src-tauri/src/modules/fs/grep.rs`
- `src-tauri/src/modules/fs/watch.rs`
- `src-tauri/src/lib.rs`

Tasks:

1. Design one small Rust helper that canonicalizes an existing path or the nearest existing parent for a create target.
2. Check the canonical result against the registry before any filesystem effect.
3. Apply the helper to read, write, stat, canonicalize, list, create, rename, delete, search, grep, glob, and watcher registration.
4. Preserve symlink-delete behavior: deleting a symlink deletes the link, not the target.
5. Audit launch-directory and home authorization. Keep user-facing app behavior usable while enforcing the narrower agent project policy in the frontend tool layer.
6. Document which IPC paths are app-authorized and which also require agent project binding.

Tests:

- Unit tests for existing path, create target, nonexistent parent, symlink inside root, symlink escape, rename source, rename destination, delete symlink, and case behavior.
- Native integration tests for forged IPC calls outside roots.
- `SYS-02` and `SYS-03`.

Gate:

- Forging frontend invokes cannot escape authorized native roots.

### Slice 1.2: Fail-closed project binding

Active Atlas files:

- `src/modules/workspace/workspaceStore.ts`
- `src/modules/ai/tools/context.ts`
- `src/modules/ai/store/chatStore.ts`

Tasks:

1. Stop swallowing workspace authorization errors.
2. Bind a workspace root only after native authorization succeeds.
3. Surface a user-readable error.
4. Make agent mutation fail closed when no project is bound.

Tests:

- Authorization failure leaves the prior root unchanged.
- Unbound read policy is explicit.
- Unbound mutation is rejected.
- `SYS-00`.

Gate:

- UI state cannot claim a root that Rust refused to authorize.

### Slice 1.3: Platform-correct path comparison

Active Atlas file:

- `src/modules/ai/tools/context.ts`

Tasks:

1. Replace unconditional lowercasing in `isWithinPath()`.
2. Keep canonical forward-slash frontend representation.
3. Compare path case according to platform semantics.
4. Add drive-letter and UNC coverage for Windows.

Tests:

- Linux case-sensitive sibling is rejected.
- macOS policy is documented and tested according to canonical native behavior.
- Windows drive letters and UNC paths are covered.
- Traversal and separator normalization are covered.

Gate:

- No false authorization from lowercasing on case-sensitive filesystems.

### Slice 1.4: Real stale-edit rejection

Active Atlas files:

- `src/modules/ai/tools/edit.ts`
- `src/modules/ai/tools/fs.ts`
- `src/modules/ai/tools/context.ts`

Tasks:

1. Store a content fingerprint with every agent read.
2. Re-read immediately before applying an edit.
3. Reject when the current fingerprint differs from the read fingerprint.
4. Return a structured stale-read error that instructs the model to reread.
5. Keep user diff approval separate from freshness validation.

Tests:

- No-prior-read rejection.
- External-modification rejection.
- Same-content reread acceptance.
- Binary-file refusal remains intact.
- `SYS-04`.

Gate:

- The agent cannot overwrite external work using stale context.

### Slice 1.5: Serialize same-file mutations

Active Atlas files:

- `src/modules/ai/tools/edit.ts`
- File-write tool boundary selected during the source packet

Tasks:

1. Adapt Pi's realpath-keyed file mutation queue.
2. Serialize edits and writes targeting the same canonical file.
3. Allow independent files to proceed concurrently.
4. Release queue entries after success and failure.

Tests:

- Concurrent same-file writes serialize.
- Concurrent independent writes do not block each other.
- Queue releases after rejected stale edit.
- `SYS-05`.

Gate:

- No lost update under concurrent agent steps.

## 11. Phase 2: Minimal Event Journal, Hard Hooks, and Proof Receipts

Goal: make trusted agent actions inspectable before adding deeper intelligence.

References:

- `All-Hands-AI/OpenHands`: `STUDY`
- `anomalyco/opencode`: `ADAPT`
- `openai/codex`: `STUDY`
- Official Claude Code hooks documentation: `STUDY`

### Slice 2.1: Define run, event, artifact, and verdict contracts

Planned Atlas area:

- `src/modules/ai/proof/`
- Thin Rust persistence module selected after source inspection

Minimum contracts:

```text
Run
  id
  sessionId
  workspaceRoot
  startedAt
  finishedAt
  status

Event
  id
  runId
  sequence
  kind
  startedAt
  finishedAt
  summary
  boundedPayload

Artifact
  id
  runId
  kind
  pathOrCommand
  contentHash
  boundedPreview

Verdict
  runId
  status: passed | failed | incomplete | cancelled
  changedFiles
  diagnostics
  checks
  unresolvedFailures
```

Tasks:

1. Choose the smallest local durable store after inspecting existing Tauri persistence patterns.
2. Bound payload sizes.
3. Store hashes and previews instead of unbounded content.
4. Make artifact IDs stable enough for UI links.
5. Keep the storage contract independent of any one model provider.

Tests:

- Ordered event append.
- Bounded payload truncation.
- Restart restore.
- Cancelled run verdict.

Gate:

- Every mutating run can produce a durable minimal receipt.

### Slice 2.2: Add hard hooks around existing tools

Hook points:

- Workspace binding.
- Read and search.
- Proposed mutation.
- Approval response.
- Native write result.
- Shell request, approval, start, output summary, and exit.
- Diagnostic result.
- Verification command result.
- Agent finish and cancellation.

Tasks:

1. Instrument the existing agent loop and tool wrappers.
2. Do not add a second tool runtime.
3. Record structured failures, not only strings.
4. Keep user explorer and editor actions distinguishable from agent actions.

Tests:

- A complete event trace for read-edit-test.
- Failed approvals and cancelled commands remain visible.
- Bounded shell summary does not duplicate the full ring buffer.

Gate:

- An agent action can be reconstructed from the receipt without reading console logs.

### Slice 2.3: Minimal proof UI

Tasks:

1. Add a compact receipt summary to the agent surface.
2. Show changed files, commands, diagnostics, checks, and verdict.
3. Link receipt items to existing editor, diff, and terminal surfaces.
4. Keep failures expanded or clearly visible.
5. Add a run-history entry per session.

Tests:

- Component tests for passed, failed, cancelled, and incomplete receipts.
- Desktop smoke for click-through from receipt to changed file.
- `SYS-01`, `SYS-06`, and `SYS-14`.

Gate:

- User can see why a run passed or failed without trusting a model summary.

## 12. Phase 3: CodeReality V0 and Budgeted Context Projection

Goal: provide fresh bounded repository context without waiting for full IDE semantics.

References:

- `Aider-AI/aider:aider/repomap.py`: `ADAPT`
- `tree-sitter/tree-sitter`: `WRAP`
- Language grammars: `WRAP`
- `DeusData/codebase-memory-mcp`: `ADAPT`
- `QuantaAlpha/RepoMaster`: `STUDY`

### Slice 3.1: Shared repository ignore policy

Active Atlas files:

- `src-tauri/src/modules/fs/search.rs`
- `src-tauri/src/modules/fs/grep.rs`
- `src-tauri/src/modules/fs/watch.rs`

Tasks:

1. Extract or centralize ignore policy used by inventory, grep, watcher, and CodeReality.
2. Respect `.gitignore`.
3. Exclude generated and dependency-heavy trees.
4. Add configurable size caps.
5. Record skipped counts for transparency.

Tests:

- `ignore-heavy` fixture parity across search, grep, watcher, and graph inventory.
- `SYS-10`.

Gate:

- Search and CodeReality agree on what belongs to the repo model.

### Slice 3.2: File inventory and freshness

Planned Rust area:

- `src-tauri/src/modules/reality/`

Minimum record:

```text
FileRecord
  canonicalPath
  language
  size
  modifiedAt
  contentHash
  parseStatus
  freshness
```

Tasks:

1. Scan lazily from the authorized workspace root.
2. Reuse watcher events to invalidate changed files.
3. Batch burst updates through the existing watcher debounce.
4. Expose bounded status to the frontend.

Tests:

- Initial inventory.
- Create, modify, rename, delete.
- Burst update coalescing.
- External editor modification.
- `SYS-09`.

Gate:

- File reality updates incrementally without a full rescan on every change.

### Slice 3.3: Benchmark grep before changing it

Active Atlas file:

- `src-tauri/src/modules/fs/grep.rs`

Tasks:

1. Benchmark current Rust grep crates against representative fixture and real-project searches.
2. Compare correctness, ignore behavior, latency, memory, and output capping with a ripgrep subprocess.
3. Preserve the current implementation if it meets the target.
4. Add a subprocess only if measured evidence justifies it.

Gate:

- A benchmark decision exists. No implementation churn is allowed merely because the memo named `rg`.

### Slice 3.4: Tree-sitter symbol extraction

Tasks:

1. Add Rust tree-sitter bindings and only the first four grammars: JavaScript, TypeScript/TSX, Python, and Rust.
2. Extract definitions, references, imports, and containing scopes using inspected grammar queries.
3. Incrementally reparse changed files.
4. Keep parse errors visible and non-fatal.

Tests:

- Per-language fixtures for defs, refs, imports, nested scopes, and syntax errors.
- Incremental update test using tree-sitter edit semantics.

Gate:

- All four fixture languages produce stable symbols and survive partial syntax errors.

### Slice 3.5: Local graph and selective queries

Minimum graph:

```text
Node
  file
  symbol
  module

Edge
  contains
  imports
  references
  mentions
```

Queries:

- File symbols.
- Symbol definition.
- Symbol references.
- Imports and importers.
- Neighbor files.
- Impact candidates.
- Freshness status.

Tasks:

1. Adapt graph and watcher ideas from codebase-memory MCP.
2. Keep graph records local and bounded.
3. Avoid claiming semantic certainty where tree-sitter only provides syntactic evidence.

Tests:

- Query snapshots on fixtures.
- Invalidated graph update after edits.
- No ignored file leakage.

Gate:

- Agent tools can request selective repo evidence instead of dumping the whole graph.

### Slice 3.6: Aider-style budgeted projection

Tasks:

1. Adapt Aider's tag cache and graph-ranking shape.
2. Include mention boosts for identifiers already present in the task context.
3. Render tree snippets under a strict token budget.
4. Use binary-search or equivalent budget fitting.
5. Expose included files, excluded counts, budget, and freshness in an inspectable context panel.

Tests:

- Deterministic projection snapshots.
- Mentioned-identifier boost.
- Token budget never exceeded.
- Changed file invalidates projection.
- Large fixture stays bounded.

Gate:

- Agent gets a fresh, bounded map with transparent omissions.

## 13. Phase 4: Optional LSP Semantic Feedback

Goal: enrich repo truth with language-server diagnostics and navigation while preserving graceful degradation.

References:

- Official LSP 3.17 specification: `WRAP`
- `anomalyco/opencode:packages/opencode/src/lsp/lsp.ts`: `ADAPT`
- `anomalyco/opencode:packages/opencode/src/lsp/client.ts`: `ADAPT`
- `typescript-language-server`: `WRAP`
- `microsoft/pyright`: `WRAP`
- `rust-lang/rust-analyzer`: `WRAP`

### Slice 4.1: LSP provider boundary

Tasks:

1. Define a narrow Rust or sidecar LSP adapter boundary after inspecting current process primitives.
2. Route by workspace root, file language, and extension.
3. Spawn lazily on first semantic request.
4. Deduplicate concurrent starts.
5. Track broken or unavailable servers explicitly.
6. Never silently install language servers.
7. Stop servers when the workspace closes or Atlas exits.

Tests:

- Lazy spawn.
- Concurrent spawn deduplication.
- Missing executable status.
- Crash and restart policy.
- Workspace close cleanup.
- `SYS-11`.

Gate:

- Atlas remains useful with no language servers installed.

### Slice 4.2: First semantic methods

Implement only:

- Diagnostics.
- Definition.
- References.
- Document symbols.
- Workspace symbols.
- Hover if low-cost after the first five pass.

Tasks:

1. Implement request timeouts.
2. Bound result sizes.
3. Normalize URIs and workspace paths.
4. Associate diagnostic freshness with document version or content hash.

Tests:

- TypeScript fixture responses.
- Python fixture responses when Pyright is installed in the test environment.
- Rust fixture responses when rust-analyzer is installed.
- Timeout and oversized-result handling.

Gate:

- Semantic calls are bounded, cancellable, and freshness-aware.

### Slice 4.3: Post-edit LSP loop

References:

- `anomalyco/opencode:packages/opencode/src/tool/edit.ts`: `ADAPT`

Tasks:

1. Notify the LSP adapter after an accepted file mutation.
2. Wait a bounded interval for updated diagnostics.
3. Attach diagnostics to the edit tool result and proof receipt.
4. Update graph enrichment without blocking the core write.

Tests:

- Introduce and clear a TypeScript diagnostic.
- Stale diagnostic is not reported as fresh.
- LSP timeout does not lose the completed write.
- `SYS-07` and `SYS-08`.

Gate:

- The agent sees the immediate semantic consequence of an edit.

### Slice 4.4: Semantic context UI

Tasks:

1. Show server availability and degraded status.
2. Show definitions, references, and diagnostics when requested.
3. Distinguish tree-sitter syntactic edges from LSP semantic evidence.

Gate:

- UI never implies semantic certainty when only syntactic evidence exists.

## 14. Phase 5: Agent Projection, Verification, and Complete Proof

Goal: connect trusted edits, CodeReality, LSP, commands, and receipts into one daily workflow.

References:

- `SWE-agent` and `mini-swe-agent`: `STUDY`
- Existing Atlas `src/modules/ai/lib/agent.ts`: preserve
- Existing Vercel AI SDK integration: preserve and refresh package-source evidence before editing

### Slice 5.1: Reality tools

Add narrow agent tools:

- `repo_status`
- `repo_map`
- `find_symbol`
- `find_references`
- `impact_candidates`
- `diagnostics`

Rules:

1. Tools return bounded evidence and freshness.
2. Tools never dump the full graph by default.
3. Tools degrade honestly when LSP is absent.
4. Tool calls append receipt events.

Tests:

- Tool schema snapshots.
- Output-size caps.
- Freshness transitions.
- Missing-LSP results.

### Slice 5.2: Verification planner

Tasks:

1. Suggest the narrowest relevant checks from changed files and project metadata.
2. Keep suggested checks distinct from executed checks.
3. Require approval for shell execution according to current policy.
4. Record command, cwd, exit, bounded output, duration, and cancellation.
5. Allow user-selected broader checks.

Tests:

- Changed TypeScript file suggests a narrow fixture test and type check.
- Failed command stays failed in the verdict.
- Cancelled command stays incomplete.

### Slice 5.3: Full receipt verdict

Tasks:

1. Compose the final verdict from artifacts, diagnostics, and executed checks.
2. Never mark passed when a required check failed or was never run.
3. Distinguish `passed`, `failed`, `incomplete`, and `cancelled`.
4. Keep model commentary visually separate from computed proof.

Tests:

- Receipt decision table.
- `proof-failure` fixture.
- Restart restoration.

Gate:

- A user can rely on Atlas receipts without trusting the model's prose.

### Slice 5.4: Daily workflow evaluation

Prompt:

```text
Find the definition and references of calculateTotal, make the smallest correction, show diagnostics, run the relevant test, and show proof.
```

Gate:

- Agent opens the fixture, uses fresh repo reality, edits safely, gets diagnostic feedback, runs the narrow test with approval, and presents a correct receipt.

## 15. Phase 6: Controlled Memory and MemoryLab

Goal: make memory useful without allowing it to outrank repository evidence.

Architecture: one `AtlasMemoryProvider` interface. Atlas owns the contract (records, provenance, stale labels, work packets, UI, repo-truth override). Providers supply intelligence behind it:

```
AtlasMemoryProvider
├─ LocalRecordsProvider   default, always on, tiny TS, no Python/API/network
├─ SimpleMemProvider      WRAP optional: compression, consolidation, adaptive retrieval
└─ Mem0Provider           BENCHMARK only, not default
```

Boot must never depend on memory-provider health. Atlas works with LocalRecordsProvider alone. SimpleMem is enabled only after a health check (Python present, package installed, model endpoint configured). On any provider failure Atlas falls back to the local ledger with a visible status.

References:

- `aiming-lab/SimpleMem:EvolveMem/evolvemem/models.py`: `WRAP`
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/retriever.py`: `WRAP`
- `aiming-lab/SimpleMem:EvolveMem/evolvemem/consolidator.py`: `WRAP`
- `mem0ai/mem0`: `BENCHMARK`
- `getzep/graphiti`: `STUDY`
- `langchain-ai/langmem`: `STUDY`
- Official Claude Code memory documentation: `STUDY`

### Slice 6.1: Memory surface from day one

The project-memory surface begins as an inspectable local contract: `LocalRecordsProvider`. This is the default and always-available ledger. It is not a SimpleMem reimplementation. It guarantees only remember, simple keyword/tag/project retrieve, mark stale, delete, restart persistence, and provenance display. Provider competition and the optional advanced engine come later in this phase.

Minimum memory record:

```text
MemoryRecord
  id
  projectId
  kind
  content
  sourceRunId
  sourceArtifacts
  createdAt
  updatedAt
  confidence
  status: active | stale | superseded | deleted
  tags
```

Tasks:

1. Store memory locally in a documented inspectable location selected during the slice.
2. Add list, view, delete, and clear-project actions.
3. Seed only explicit project facts, accepted user instructions, and successful run summaries.
4. Keep memory opt-out straightforward.

Tests:

- CRUD and restart restore.
- Project isolation.
- Clear-project behavior.
- No key or secret persistence.

### Slice 6.2: Repo-truth invalidation

Tasks:

1. Link memory to source artifacts when possible.
2. Down-rank or mark stale when linked files change.
3. Require current source confirmation before using memory to answer code questions.
4. Show provenance in UI.

Tests:

- `memory-stale` fixture.
- `SYS-12`.

Gate:

- Stale memory cannot override changed code.

### Slice 6.3: Advanced provider and MemoryLab

`LocalRecordsProvider` from Slice 6.1 is the default. This slice wraps SimpleMem as the optional advanced provider and benchmarks Mem0. No advanced provider replaces the local ledger as the boot dependency.

Wrap SimpleMem (`WRAP`):

1. Define `AtlasMemoryProvider` so LocalRecords and SimpleMem are interchangeable behind it.
2. Add a health check: Python present, package installed, model endpoint configured. Disable advanced memory with a visible status when any check fails.
3. Route compression, consolidation, and query-aware retrieval to SimpleMem when healthy.
4. Atlas validates and stale-labels SimpleMem output before use. Repo truth still wins.
5. Pick the integration surface (local IPC worker, MCP server, or lazy install) after inspecting SimpleMem's source during the slice. Do not require it at install time.

Benchmark in MemoryLab:

- Compare LocalRecords, SimpleMem, and Mem0 on the same dataset.
- Measure retrieval precision, stale-fact rejection, token cost, latency, local disk growth, provider dependency and privacy, and consolidation false merges.

Tasks:

1. Add dry-run consolidation view.
2. Add a fixed benchmark dataset.
3. Record raw results.
4. Keep `LocalRecordsProvider` default. Keep SimpleMem `WRAP` optional. Keep Mem0 `BENCHMARK`. Change a disposition only on measured evidence.

Gate:

- Atlas memory works with zero providers installed.
- No advanced provider becomes a boot dependency.
- No provider becomes default without measured evidence.

## 16. Phase 7: Scoped Skills and Lifecycle Hooks

Goal: add inspectable extension points without turning the core into a general plugin platform.

References:

- Official Claude Code skills and hooks documentation: `STUDY`
- `anthropics/skills`: `ADAPT`
- `earendil-works/pi`: `ADAPT`
- Existing Atlas snippets and terminal-agent hooks: preserve

### Slice 7.1: Skill package contract

Tasks:

1. Inspect current Atlas snippets and tool bundles.
2. Define a small local skill package with metadata, prompt material, allowed tool subset, and optional fixture-backed tests.
3. Keep skill activation visible.
4. Keep skills unable to bypass native or agent policy.
5. Add enable, disable, inspect, and remove flows.

Tests:

- Valid package load.
- Invalid package rejection.
- Disabled skill stays inert.
- Skill tool subset cannot expand permissions.

### Slice 7.2: Lifecycle hooks

Tasks:

1. Define bounded hooks for run start, prompt submit, before tool, after tool, verdict, and run finish.
2. Reuse the event journal.
3. Keep timeouts and failure isolation.
4. Make hook execution visible in receipts.

Tests:

- Hook timeout.
- Hook failure does not corrupt a run.
- Ordered lifecycle.
- Disabled hook stays inert.

Gate:

- Extensions are inspectable, bounded, and policy subordinate.

## 17. Phase 8: Optional MCP Boundary

Goal: allow scoped external tools without making MCP the core architecture.

References:

- Official MCP latest specification: `WRAP`
- `modelcontextprotocol/typescript-sdk`: `WRAP`
- SDK conformance tests: `WRAP`
- `modelcontextprotocol/servers`: `STUDY`
- `github/github-mcp-server`: `STUDY`
- `microsoft/playwright-mcp`: `STUDY`

Important version rule:

- Pin a tested stable MCP protocol version and SDK release at implementation time.
- Do not track SDK `main` blindly. The inspected source contains draft development protocol identifiers.
- Re-check the official latest specification before implementation and before release.

### Slice 8.1: MCP client boundary

Tasks:

1. Use the official TypeScript SDK stable release.
2. Add explicit server configuration.
3. Start servers lazily.
4. Require per-server and per-tool allow, ask, or deny policy.
5. Bound tool output, resources, timeouts, and concurrent calls.
6. Record MCP actions in proof receipts.
7. Keep core Atlas usable when every MCP server is disabled.

Tests:

- SDK conformance subset.
- Server start, stop, timeout, crash, oversized output, and malformed schema.
- Denied tool.
- Approval-gated tool.
- `SYS-13`.

### Slice 8.2: First connector studies

Evaluate, do not auto-enable:

- GitHub MCP server.
- Playwright MCP server.

Gate:

- Each adopted connector has an explicit threat model, output cap, and user-visible policy.

## 18. Phase 9: Metrics, Reliability, and Context Inspector

Goal: make the harness measurable and debuggable.

### Slice 9.1: Local metrics

Record:

- Run duration.
- Tool counts.
- Approval latency.
- Search latency.
- Graph scan and incremental update duration.
- Projection token budget and included file count.
- LSP availability, startup duration, and timeout count.
- Memory retrieval latency and stale rejection count.
- Receipt status.

Rules:

1. Metrics are local by default.
2. No secrets.
3. No unbounded raw logs.
4. Export is explicit.

### Slice 9.2: Context inspector

Show:

- Workspace binding.
- Reality freshness.
- Projection files and omissions.
- Tree-sitter status.
- LSP status.
- Memory records used and rejected.
- Skill activation.
- MCP servers and invoked tools.
- Verification artifacts.

Gate:

- A user can explain why the agent saw a file, missed a file, used a memory, rejected a memory, or reported a verdict.

## 19. Phase 10: Release Candidate and System Qualification

Goal: prove a useful, safe V1 before deeper expansion.

### Slice 10.1: Full automated verification

Run:

```bash
bash scripts/verify-atlas.sh --all
```

Required:

- All `L0` through available `L5` layers pass.
- No ignored failing checks.
- Baseline performance measurements recorded.
- New dependencies reviewed for size and startup effect.

### Slice 10.2: Cross-platform qualification

On macOS, Linux, and Windows:

1. Launch Atlas.
2. Open workspace.
3. Confirm terminal shell.
4. Confirm project-bound agent.
5. Read and edit a file.
6. Confirm stale-edit protection.
7. Run a command.
8. Confirm proof receipt.
9. Confirm watcher update.
10. Confirm graceful missing-LSP state.

### Slice 10.3: Golden demo

Use a deterministic fixture:

```text
Open the project. Find the total-calculation bug using repository evidence. Show the relevant definition and references. Make the smallest safe correction. Show diagnostics. Run the narrow test. Present proof.
```

Gate:

- The complete flow passes from a clean app start.
- Receipt truth matches actual repository state and command results.

## 20. Deferred Decisions

Do not add these to V1 until metrics prove a need:

| Candidate | Why deferred | Revisit trigger |
| --- | --- | --- |
| Cloud or container sandbox | Existing local shell approval boundary is enough to validate the harness first. | Untrusted generated code execution becomes a real product requirement. |
| SCIP | Tree-sitter plus optional LSP should prove the local graph first. | Cross-repo indexing or scale limits become measurable. |
| Temporal graph memory | Higher complexity and unclear V1 ROI. | MemoryLab shows a concrete stale-fact or temporal-query gap. |
| Multi-agent orchestration | Existing main-agent and sub-agent substrate should be measured first. | Single-loop evals expose a repeated decompositional failure. |
| General plugin marketplace | Skills and bounded MCP are enough for V1. | Real extension demand outgrows the scoped model. |
| Hosted Python backend | Contradicts the active lightweight desktop architecture. | A proven feature requires a service and cannot run locally. |
| IDE platform migration | Atlas already has a viable terminal/editor substrate. | Current substrate blocks a measured user-critical workflow. |

## 21. Immediate Work Queue

Execute in this order:

1. `Slice 0.1`: freeze refreshed evidence and commit hashes.
2. `Slice 0.2`: restore clippy and Vitest baseline; add `scripts/verify-atlas.sh`.
3. `Slice 0.3`: add deterministic fixture harness.
4. `Slice 1.1`: enforce native filesystem authorization.
5. `Slice 1.2`: fail closed on workspace authorization.
6. `Slice 1.3`: fix platform-aware path comparison.
7. `Slice 1.4`: implement real stale-edit rejection.
8. `Slice 1.5`: serialize same-file mutation.
9. `Phase 2`: add minimal event journal and proof receipt end-to-end.
10. Run the `M1` trusted-editing system scenarios before CodeReality work.

No CodeReality, LSP, memory-provider, skill, or MCP implementation begins until `M1` passes.

## 22. Definition of Done for Every Slice

A slice is complete only when:

1. Relevant opensrc paths were inspected.
2. Official primary documentation was refreshed where external contracts apply.
3. `source_pack.md` contains exact files and dispositions.
4. Atlas-owned code is the smallest required adapter or policy layer.
5. New invariants have unit tests.
6. Boundary changes have integration tests.
7. User-visible changes have UI or desktop checks.
8. At least one prompt-level scenario proves the slice where the agent loop is involved.
9. `bash scripts/verify-atlas.sh --fast` passes.
10. Full relevant checks pass before merge.
11. Performance cost is measured for dependencies, indexing, watchers, and persistent services.
12. `live_canvas.md` and this plan are patched if reality changed.

## 23. Evidence Appendix

Primary documentation refreshed or selected for refresh on `2026-05-31`:

- Tauri 2 calling Rust from the frontend: <https://v2.tauri.app/develop/calling-rust/>
- Tauri 2 capabilities: <https://v2.tauri.app/security/capabilities/>
- Tauri 2 testing overview: <https://v2.tauri.app/develop/tests/>
- Language Server Protocol 3.17 specification: <https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/>
- Tree-sitter parser usage: <https://tree-sitter.github.io/tree-sitter/using-parsers/>
- Aider repository map documentation: <https://aider.chat/docs/repomap.html>
- Model Context Protocol documentation: <https://modelcontextprotocol.io/docs>
- Model Context Protocol latest specification: <https://modelcontextprotocol.io/specification/latest>
- Claude Code memory documentation: <https://code.claude.com/docs/en/memory>
- Claude Code hooks documentation: <https://code.claude.com/docs/en/hooks>
- Claude Code skills documentation: <https://code.claude.com/docs/en/skills>
- Claude Code MCP documentation: <https://code.claude.com/docs/en/mcp>

Exact upstream files already inspected through opensrc during the pre-plan pass:

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

Source-resolution note:

- The pre-plan pass fetched the curated repository set through opensrc.
- GitHub unauthenticated API rate limiting prevented a later blind full refresh.
- `scripts/consult-opensrc.sh` reports the refresh failure and falls back to inspected local cache paths.
- Freshness-sensitive implementation slices must retry through the authenticated hook and record exact refreshed commits.
