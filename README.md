<div align="center">
  <img src="public/atlas-mark.png" width="92" alt="Atlas logo" />
  <h1>Atlas</h1>
  <p><strong>A local-first AI coding workspace that can understand, change, run, and verify your repository.</strong></p>
  <p>
    <a href="https://github.com/MDSD0/Atlas-ai/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/MDSD0/Atlas-ai?style=flat-square&color=b6ff00" /></a>
    <a href="https://github.com/MDSD0/Atlas-ai/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/MDSD0/Atlas-ai/ci.yml?branch=main&style=flat-square&label=CI" /></a>
    <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-b6ff00?style=flat-square" /></a>
  </p>
</div>

Atlas combines an agent workspace, native terminal, editor, source control, repository map, web search, and live preview in one fast Tauri desktop app. Your projects stay on your machine. You bring the model provider, and Atlas keeps tools bounded by the workspace with visible approvals and diffs.

## Download

Get the newest build from [GitHub Releases](https://github.com/MDSD0/Atlas-ai/releases/latest).

| Platform | Packages |
| --- | --- |
| Windows 10/11 x64 | NSIS setup `.exe` or Windows Installer `.msi` |
| Ubuntu, Debian, and compatible x64 Linux | `.deb` or portable `.AppImage` |
| Fedora, RHEL, and compatible x64 Linux | `.rpm` |
| macOS 13 or newer | Apple Silicon and Intel `.dmg` |

Windows is not yet publisher-signed, and macOS uses an ad-hoc signature without Apple notarization. SmartScreen or Gatekeeper may therefore show a warning. Atlas update manifests and payloads are separately cryptographically signed.

## What Atlas does

- Runs a bounded coding-agent loop with file, shell, search, web, preview, and repository tools.
- Shows proposed edits as reviewable diffs with per-hunk acceptance before writing.
- Delegates focused work to observable subagents, including isolated Git worktrees when useful.
- Preserves session traces, plans, checkpoints, and explicit long-term project memory.
- Maps repository structure and relationships in an interactive, zoomable graph shared with the agent.
- Includes a native PTY terminal, CodeMirror editor, file explorer, Git workflows, and web preview.
- Stores cloud-provider keys in the operating-system credential store and sends no telemetry by default.
- Supports OpenRouter by default, plus OpenAI, Anthropic, Google, xAI, Cerebras, Groq, Ollama, LM Studio, MLX, and OpenAI-compatible endpoints.

## Quick start

1. Install and open Atlas.
2. Open a project folder.
3. Open Settings, then Models.
4. Paste your OpenRouter API key. OpenRouter is the default route and `openai/gpt-5.4-mini` is the initial model.
5. Describe a concrete task in the agent composer and review approvals as Atlas works.

Atlas reads `ATLAS.md`, `AGENTS.md`, and compatible repository guidance from a workspace when present. The app does not require an Atlas account or hosted project mirror.

## Safety model

Read-only repository tools can run directly. File mutations, destructive operations, and shell execution use explicit approval boundaries. Secret-like paths are denied at both read and write boundaries. Agent activity remains inspectable through tool cards, diffs, subagent runs, and durable trace receipts.

This is still preview software. Review agent changes before accepting them and keep important work in version control.

## Build from source

Prerequisites:

- Node.js 22.13 or newer
- pnpm 10
- Rust stable
- The [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/MDSD0/Atlas-ai.git
cd Atlas-ai
pnpm install --frozen-lockfile
pnpm tauri dev
```

Production and verification commands:

```bash
pnpm test
pnpm build
pnpm tauri build
```

Native checks run from `src-tauri`:

```bash
cargo clippy --locked
cargo test --locked
```

## Architecture

Atlas uses React 19, TypeScript, xterm.js, CodeMirror, and the Vercel AI SDK in the webview. A Rust and Tauri 2 backend owns filesystem access, PTYs, processes, Git, networking, secure storage, repository indexing, and desktop integration. The webview receives only explicitly registered capabilities through Tauri IPC.

See [ATLAS.md](ATLAS.md) for the contributor architecture guide and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a substantial change.

## Project

- [Releases](https://github.com/MDSD0/Atlas-ai/releases)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

Atlas is licensed under the [Apache License 2.0](LICENSE).
