# Atlas Stack - What We Stitch

Atlas wraps proven open-source building blocks instead of reinventing core protocols, editors, terminals, parsers, or desktop runtime behavior. Every layer below has an explicit disposition.

- Full manifest: `docs/opensrc-references.tsv` (50 entries).
- Release gate: `RELEASE_QUALIFICATION.md`.
- Product direction: `ROADMAP.md`.

Disposition meanings: `WRAP` use as-is via adapter, `ADAPT` port shape into Atlas, `STUDY` compare and inform, `REJECT` explicitly excluded, `BENCHMARK` measure before adopting.

## Substrate

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Desktop runtime | `tauri-apps/tauri` | WRAP | Custom Rust commands, capability policy |
| Editor | `codemirror/dev` | WRAP | Extensions, themes |
| Terminal renderer | `xtermjs/xterm.js` | WRAP | OSC handlers, PTY bridge |
| Substrate lineage | `crynta/terax-ai` | STUDY | Terax is credited for the original lightweight desktop-terminal substrate and project contribution |
| Scaffold pattern | `tauri-apps/create-tauri-app` | STUDY | Reference only |

## Repo understanding

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Repo map + projection | `Aider-AI/aider` | ADAPT | Token budget, mention boost, freshness binding, ignore policy |
| Tree-sitter extraction style | `Aider-AI/grep-ast` | STUDY | Direct tree-sitter integration in Rust |
| Incremental parser | `tree-sitter/tree-sitter` | WRAP | — |
| Grammars | `tree-sitter/tree-sitter-typescript`, `-javascript`, `-python`, `-rust` | WRAP | — |
| Graph + watcher invalidation | `DeusData/codebase-memory-mcp` | ADAPT | Local graph storage, query API, selective queries |
| Graph-guided research | `QuantaAlpha/RepoMaster` | STUDY | Evidence only, no paper claims as features |
| Semantic query UX | `oraios/serena` | STUDY | UX comparison, not core |
| Cross-repo indexing | `sourcegraph/scip` | STUDY | Deferred until measured need |

## Semantic (LSP)

Optional. Must degrade gracefully — Atlas works without any language server installed (`lsp-missing` fixture gate).

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Protocol | `microsoft/language-server-protocol` | WRAP | LSP client boundary |
| Lazy lifecycle + post-edit feedback | `anomalyco/opencode` (`lsp/lsp.ts`, `lsp/client.ts`) | ADAPT | Spawn, dedup, freshness, timeout |
| TypeScript LSP | `typescript-language-server` | WRAP | — |
| Python LSP | `microsoft/pyright` | WRAP | — |
| Rust LSP | `rust-lang/rust-analyzer` | WRAP | — |
| Python LSP client reference | `openlawlibrary/pygls` | STUDY | Legacy-plan reference |
| Editor architecture comparison | `helix-editor/helix`, `zed-industries/zed`, `lapce/lapce`, `microsoft/vscode` | STUDY | Deferred |

## Memory

Architecture: `AtlasMemoryProvider` interface. Atlas owns the memory contract (records, provenance, stale labels, work packets, UI, repo-truth override). Providers are the intelligence layer behind it.

```
AtlasMemoryProvider
├─ LocalRecordsProvider   default, always works, no dependency
├─ SimpleMemProvider      optional advanced: compression, consolidation, adaptive retrieval
└─ Mem0Provider           benchmark only, not default
```

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Default ledger | (Atlas-owned) | — | `LocalRecordsProvider`: remember, keyword/tag retrieve, mark stale, delete, restart-persist, provenance UI. Tiny TS, no Python/API/network. |
| Advanced engine | `aiming-lab/SimpleMem` | WRAP (optional) | Health-checked provider behind the interface. Used for compression, consolidation, query-aware retrieval when available. Atlas validates + stale-labels before use. Not required at boot. |
| Provider candidate | `mem0ai/mem0` | BENCHMARK | Measured in MemoryLab, not default, not rejected. |
| Temporal graph memory | `getzep/graphiti`, `getzep/zep` | STUDY | Not V1 |
| Memory framework | `langchain-ai/langmem` | STUDY | Not V1 |

Repo truth (definitions, references, diagnostics, test status, freshness, proof verdicts) lives in CodeReality + Proof, never in any memory provider.

## Agent loop / tools / permissions

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| ACI design | `princeton-nlp/SWE-agent` | STUDY | Tool feedback comparison |
| Small-loop bias | `SWE-agent/mini-swe-agent` | STUDY | Resist over-orchestration |
| Runtime + event trace | `All-Hands-AI/OpenHands` | STUDY | Event journal shape |
| Approvals + project guidance | `openai/codex` | STUDY | Approval UX comparison |
| Minimal core + extension shape | `earendil-works/pi` (`extensions/types.ts`, `tools/file-mutation-queue.ts`) | ADAPT | Realpath-keyed file mutation queue |
| Permission allow/ask/deny | `anomalyco/opencode` (`permission/index.ts`) | ADAPT | Permission policy shape |
| Edit + LSP feedback flow | `anomalyco/opencode` (`tool/edit.ts`) | ADAPT | Edit tool integration |
| Compact loop examples | `anthropics/anthropic-quickstarts` | STUDY | Reference |

## MCP / connectors

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Protocol (TypeScript) | `modelcontextprotocol/typescript-sdk` | WRAP (pinned stable release) | Client boundary, conformance subset |
| Protocol (Python, cross-check) | `modelcontextprotocol/python-sdk` | STUDY | — |
| Connector examples | `modelcontextprotocol/servers` | STUDY | — |
| GitHub connector | `github/github-mcp-server` | STUDY | Threat model required before adoption |
| Browser connector | `microsoft/playwright-mcp` | STUDY | Threat model required before adoption |

## Skills / extensions

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Skill packaging | `anthropics/skills` | ADAPT | Local skill package contract |
| Skill ergonomics | `vercel-labs/skills` | STUDY | — |
| Agent examples | `vercel-labs/open-agents` | STUDY | — |

## Source-parity tooling

| Layer | Upstream | Disposition | What Atlas owns |
|---|---|---|---|
| Upstream resolver | `vercel-labs/opensrc` | WRAP | `scripts/consult-opensrc.sh` + `.claude/settings.json` PreToolUse hook |

## Rejected

| Upstream | Reason |
|---|---|
| `coleam00/archon` | Workflow orchestration unnecessary for local harness |
| `sveltejs/svelte` | Legacy-plan UI only; active Atlas uses React |
| `eclipse-theia/theia` | IDE platform; current Tauri substrate viable |

## Governance / study only

| Upstream | Disposition |
|---|---|
| `odylith/odylith` | STUDY (enterprise execution-trail reference) |
