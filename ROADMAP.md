# Atlas Roadmap

Atlas is a local-first, AI-native terminal and coding harness. It should stay fast, understandable, and honest about what the agent knows and what it has proven.

For day-to-day work, use [GitHub Issues](https://github.com/MDSD0/Atlas-ai/issues).

## Shipped

- Tauri 2 + Rust desktop shell
- Native PTY terminal with tabs, splits, shell integration, and xterm.js rendering
- CodeMirror editor, file explorer, source control, markdown/image/web previews
- BYOK AI providers and local/offline provider paths
- Agent tools for read, search, edit, shell, background process, memory, MCP, and verification flows
- Approval gates for writes, commands, and long-running processes
- Workspace authorization, secret-path checks, stale-edit rejection, same-file mutation serialization
- Repository reality projection with tree-sitter ranking and optional LSP diagnostics
- Proof receipts and durable redacted flight recorder timeline
- Local memory records and optional filesystem memory surface
- Release, dependency, benchmark, desktop, and launchability verification gates

## Near Term

- Publish a fresh signed release with updater metadata
- Finish explicit SWE-bench and Terminal-Bench sample signoff on a Docker-ready host
- Complete Linux and Windows interactive release checks
- Improve packaged desktop automation where platform support allows it
- Tighten docs and issue triage for public contributors
- Keep reducing startup and bundle cost

## Product Direction

- Terminal-first, not IDE-clone-first
- Local workspace truth over memory or model claims
- Visible receipts over "trust me" summaries
- BYOK and local-first defaults
- Optional providers that degrade independently
- No hidden Docker runs, sidecar installs, or external benchmark execution

## Out Of Scope For Now

- Hosted backend rewrite
- Full IDE platform migration
- Notebook/document workspace
- Arbitrary extension marketplace
- Telemetry, accounts, or analytics
- Silent command execution outside the approval model

## Contribution Areas

- Platform fixes for macOS, Linux, Windows, and WSL
- Security hardening around IPC, filesystem, shell, and AI tools
- Performance profiling and dependency reduction
- Tests for terminal, workspace, proof, release, and benchmark gates
- Documentation, screenshots, and release notes
