# Atlas Release Qualification

This document describes the public release gate for Atlas.

## Automated Gate

Run:

```bash
CARGO_BUILD_JOBS=1 bash scripts/release-qualify.sh
```

This runs frontend typecheck, frontend tests, production build, Rust check, Rust clippy, Rust tests, deterministic golden eval, desktop smoke, dependency review, optional graph preflight, SWE-bench preflight, Terminal-Bench preflight, signed-release preflight, and advisory launchability audit.

## Launchability Audit

Run:

```bash
bash scripts/verify-atlas.sh --launch
node scripts/launchability-audit.mjs --strict
```

Advisory mode is allowed in CI so the repo can show external blockers without failing normal builds. Strict mode is for release signoff.

Strict signoff requires:

- Docker daemon available
- `SWE_BENCH_ROOT` pointing at an official SWE-bench checkout
- Harbor CLI installed
- Signed updater metadata published at the configured GitHub release endpoint
- GitHub auth and API access healthy
- Platform desktop checks recorded

## External Benchmarks

The benchmark adapters are side-effect-free by default.

SWE-bench wraps the official gold smoke:

```bash
node scripts/external-benchmark-preflight.mjs --run-sample
```

Terminal-Bench 2.0 wraps Harbor's bounded oracle path:

```bash
node scripts/terminal-benchmark-preflight.mjs --run-sample
```

Atlas never installs benchmark tools, starts Docker, or runs expensive external samples implicitly.

## Desktop Qualification

Automated smoke checks verify that the desktop contract is registered and that the harness surfaces exist.

Interactive release checks should cover:

1. Launch packaged Atlas.
2. Open a workspace.
3. Open a terminal and confirm cwd.
4. Bind the agent project.
5. Read, edit, and review a file.
6. Confirm stale-edit protection.
7. Run a narrow command.
8. Confirm proof receipt and flight recorder timeline.
9. Confirm watcher update.
10. Confirm missing optional providers degrade honestly.

macOS WKWebView does not provide the same WebDriver path as Linux/Windows desktop automation, so macOS packaged checks may require manual evidence.

## Signed Release Contract

The GitHub release workflow must:

- Build macOS Apple Silicon, macOS Intel, Linux, and Windows artifacts
- Use `tauri-apps/tauri-action@v1`
- Upload updater JSON
- Upload updater signatures
- Fail unless the draft release contains `latest.json` and `.sig` assets

Until those assets exist on a new release, auto-update remains a manual user action.
