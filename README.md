# Atlas

Atlas is an open-source, AI-native terminal and coding workspace built with Tauri 2, Rust, React, xterm.js, CodeMirror, and the Vercel AI SDK.

It is terminal-first, local-first, and BYOK. Atlas gives the agent a real workspace, bounded tools, visible proof receipts, and a lightweight desktop surface instead of turning your project into a hosted backend.

Atlas is maintained in the [MDSD0/Atlas-ai](https://github.com/MDSD0/Atlas-ai) repository. Terax is credited for the original lightweight desktop-terminal substrate and ongoing contribution to the project direction.

## Features

- Native PTY terminal with multi-tab and split-pane workflow
- Integrated editor, file explorer, source control, previews, and settings
- BYOK cloud providers plus local/offline provider support
- Agent tools for reading, searching, editing, running commands, and collecting proof
- Approval gates for file writes, shell commands, and long-running background processes
- Repository reality inspector with context, proof, memory, MCP, and reliability views
- OS keychain storage for API keys
- No telemetry by default
- macOS, Linux, and Windows release workflow

## Status

Atlas is in active preview. The local harness and release qualification gates are automated, but a public launch release still requires signed updater metadata and final platform signoff. The project keeps those checks explicit through:

```bash
bash scripts/verify-atlas.sh --all
bash scripts/verify-atlas.sh --launch
```

The launch audit is advisory by default and has a strict mode for release signoff:

```bash
node scripts/launchability-audit.mjs --strict
```

## Build From Source

Prerequisites:

- Node 22.13 or newer
- pnpm 10
- Rust stable
- Platform prerequisites for Tauri 2: <https://v2.tauri.app/start/prerequisites/>

Install and run:

```bash
pnpm install
pnpm tauri dev
```

Production build:

```bash
pnpm build
pnpm tauri build
```

## Verification

Fast loop:

```bash
bash scripts/verify-atlas.sh --fast
```

Native checks:

```bash
bash scripts/verify-atlas.sh --native
```

Full local qualification:

```bash
CARGO_BUILD_JOBS=1 bash scripts/release-qualify.sh
```

External benchmark samples are opt-in. Atlas never starts Docker, installs Harbor, or runs SWE-bench implicitly.

## Repository Layout

```text
src/                       React app and feature modules
src-tauri/                 Rust backend, Tauri commands, PTY, fs, git, shell
scripts/                   verification, release, benchmark, and audit gates
docs/                      screenshots and upstream reference manifest
tests/fixtures/            deterministic harness fixtures
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md). Small bug fixes and docs improvements are welcome. Larger harness, AI, security, release, or platform changes should be discussed first so they fit the Atlas direction.

## Security

Please do not open public issues for security bugs. See [SECURITY.md](SECURITY.md).

## License

Atlas is licensed under the [Apache-2.0 License](LICENSE).
