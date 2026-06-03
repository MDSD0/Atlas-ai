# Contributing to Atlas

Thanks for wanting to help. Atlas is a focused AI-native terminal and coding harness, so the best contributions are small, tested, and aligned with that product shape.

Atlas is maintained in [MDSD0/Atlas-ai](https://github.com/MDSD0/Atlas-ai). Terax is credited for the original lightweight desktop-terminal substrate and continued project contribution.

## Ground Rules

- Use pnpm only. Do not use npm, npx, yarn, or generated npm lockfiles.
- Keep changes focused. One PR should solve one problem.
- Follow the existing architecture before adding a new abstraction.
- Avoid new dependencies unless there is a clear performance, security, or maintainability reason.
- Do not weaken workspace authorization, secret-path checks, approval gates, proof receipts, or updater signing.
- For non-trivial harness behavior, inspect relevant upstream source or official docs and describe what you copied, adapted, wrapped, or rejected in the PR.

## Setup

```bash
pnpm install
pnpm tauri dev
```

Prerequisites:

- Node 22.13 or newer
- pnpm 10
- Rust stable
- Tauri 2 platform prerequisites: <https://v2.tauri.app/start/prerequisites/>

## Verification

Run the smallest relevant gate while developing:

```bash
bash scripts/verify-atlas.sh --fast
bash scripts/verify-atlas.sh --native
bash scripts/verify-atlas.sh --desktop
```

Before a serious PR, run:

```bash
CARGO_BUILD_JOBS=1 bash scripts/release-qualify.sh
```

If your change touches release, external benchmark, updater, or packaged desktop behavior, also include:

```bash
bash scripts/verify-atlas.sh --launch
```

## Changes That Need Tests

Add or update tests when touching:

- PTY or shell launch behavior
- Workspace authorization or path canonicalization
- File reads, writes, renames, deletes, symlink handling, or secret-path checks
- Git command parsing or pathspec handling
- AI tools, approvals, proof receipts, memory, MCP, or context packing
- Release, updater, benchmark, or launch qualification logic

UI-only changes should include screenshots or clear manual testing notes.

## Good Contributions

- Reproducible bug fixes
- Security hardening with tests
- Platform-specific fixes for macOS, Linux, Windows, or WSL
- Focused docs improvements
- Small UX polish that follows the existing visual system
- Harness verification improvements that make claims more truthful

## Discuss First

Open an issue before starting large work such as:

- New AI providers or model-routing behavior
- Major UI flows
- Agent orchestration
- Memory provider changes
- MCP connector changes
- Release/signing/updater changes
- Broad refactors

## PR Checklist

- Explain what changed and why.
- Link the issue or discussion when relevant.
- Include exact verification commands and results.
- Include screenshots for UI changes.
- Keep unrelated formatting churn out of the diff.

## Branches And Commits

Use clear branch names such as:

```text
fix/workspace-path-guard
feat/reality-inspector-filter
docs/contributing-update
```

PR titles should follow Conventional Commits when possible:

```text
fix(ai): reject stale edit before write
docs: refresh release instructions
security(fs): harden symlink escape check
```
