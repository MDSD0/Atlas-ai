# Changelog

All notable Atlas changes are recorded here. Atlas follows semantic versioning while the public API and desktop experience remain in preview.

## 0.8.0 - 2026-07-19

### Highlights

- Rebuilt the local agent loop around bounded tool execution, explicit approvals, recoverable traces, and structured failure handling.
- Added observable subagents with scheduling, activity UI, focused context, and isolated worktree support.
- Added durable project memory, checkpoints, plans, session recovery, and user-managed memory controls.
- Added web search, page inspection, browser preview, background-shell, and repository intelligence tools.
- Reworked the repository map into an interactive hierarchy and relationship graph shared with the agent.
- Rebuilt the Atlas visual system around matte acrylic black surfaces and the neon lime Atlas accent.
- Corrected native Windows controls, settings-window controls, session history layout, split-panel behavior, diff approvals, and adaptive agent composer sizing.
- Made OpenRouter the default provider while preserving support for direct cloud, local, and OpenAI-compatible providers.

### Distribution

- Added one verified release pipeline for Windows x64, Linux x64, macOS Apple Silicon, and macOS Intel.
- Added NSIS, MSI, AppImage, deb, rpm, and dmg packages.
- Added cryptographically signed updater manifests and payload signatures.
- Added release validation that blocks publication until frontend tests, production build, updater metadata, and signatures pass.

### Known limitations

- Windows is not publisher-signed, and macOS uses an ad-hoc signature without Apple notarization, so the operating system may show an unknown-publisher warning.
- Atlas remains preview software. Review agent-proposed changes and keep important work under version control.
