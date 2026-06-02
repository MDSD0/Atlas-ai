# Atlas V1 Release Qualification

Date: `2026-06-02`

## Automated Gate

Run:

```bash
bash scripts/release-qualify.sh
```

The gate covers frontend typecheck, frontend tests, production build, Rust check,
Rust clippy, Rust tests, the deterministic golden eval, desktop-contract smoke,
dependency review, optional graph-provider preflight, SWE-bench preflight,
Terminal-Bench preflight, and the signed-release contract.

## Golden Demo

Fixture: `tests/fixtures/golden-v1`

Prompt:

```text
Open the project. Find the total-calculation bug using repository evidence.
Show the relevant definition and references. Make the smallest safe correction.
Show diagnostics. Run the narrow test. Present proof.
```

The scripted gate copies the intentionally buggy fixture to a temp directory,
proves the narrow test fails, applies the expected one-line correction, and
proves the same test passes. The committed fixture is never mutated.

## Desktop Qualification

Automated on every CI host:

- Tauri build contract is present.
- Native project binding, repository reality, LSP, and shell commands are registered.
- Memory, MCP, metrics, reality, and semantic tool lanes are registered.
- The compact proof receipt is mounted.

Interactive checklist for macOS, Linux, and Windows:

1. Launch Atlas.
2. Open a workspace and confirm terminal shell.
3. Bind the agent project.
4. Read and edit one file.
5. Confirm stale-edit protection.
6. Run a narrow command and confirm truthful proof receipt.
7. Confirm watcher-observed update.
8. Confirm graceful missing-LSP state.
9. Inspect local metrics and compact context inspector.
10. Confirm MCP remains disabled until explicitly configured.

Tauri documents WebDriver desktop automation for Linux and Windows. macOS
WKWebView has no WebDriver tool, so macOS interactive qualification remains a
manual release step. CI compiles native Rust on Ubuntu, macOS, and Windows.

Click-driven packaged macOS evidence recorded on `2026-06-02`:

1. Built and launched `src-tauri/target/debug/bundle/macos/Atlas.app`.
2. Bound a real fixture workspace through the native picker.
3. Opened a native terminal and confirmed its working directory.
4. Inspected Reality metrics, provider status, and the honest no-repository state.
5. Opened Settings and confirmed updates remain a manual action.
6. Bound the real Atlas workspace and confirmed explorer and source control load.
7. Inspected the Tauri log and confirmed no updater endpoint failure at boot.

The click-driven pass exposed and fixed explorer recovery and workspace-environment
probe defects. Linux and Windows interactive signoff remain release steps.

## Dependency Review

The corrective harness adds reviewed direct Rust runtime dependencies for lazy
LSP file-URI conversion and the official RMCP client transport. Optional memory,
graph comparison, benchmark, and MCP lanes remain inert at boot. None installs
tools, starts containers, or starts a sidecar implicitly.

## External Preflight

The merge gate performs side-effect-free capability checks:

- SWE-bench: wraps the official gold smoke for `sympy__sympy-20590`. Running it
  requires explicit `--run-sample`, a running Docker daemon, and
  `SWE_BENCH_ROOT` pointing to an official checkout.
- Terminal-Bench 2.0: wraps Harbor's official oracle path, bounded to one task
  with `-l 1`. Running it requires explicit `--run-sample`, the official Harbor
  CLI, and a running Docker daemon.

On this host Docker Desktop is stopped and Harbor is not installed, so the
external samples were not executed. The preflights pass honestly without side
effects.

## Signed Updater Contract

Atlas v0.7.3 currently has a DMG and app tarball but no `.sig` asset or
`latest.json`. The configured updater endpoint therefore returns `404`.

The corrected release workflow explicitly requests updater JSON and fails unless
the published release contains both signed updater assets and `latest.json`.
Startup checks remain manual until a corrected signed release is published.

## Recorded Result

Passed on macOS (`darwin`) on `2026-06-02`:

| Layer | Result |
| --- | --- |
| TypeScript | passed |
| Frontend Vitest | `205` passed across `38` files |
| Production build | passed, `3195` modules transformed with prior Rollup cycle warnings removed |
| Cargo check | passed |
| Cargo clippy | passed with `-D warnings` |
| Rust library tests | `144` passed, `3` intentional diagnostics or host-smoke tests ignored |
| Rust fixture harness | `3` passed |
| Golden eval | passed, narrow exit `1 -> 0`, one-line correction |
| Desktop contract smoke | passed on `darwin` |
| Dependency review | passed, `81` frontend and `33` Rust direct runtime dependencies |
| Graph provider preflight | passed, external comparator remains optional |
| SWE-bench preflight | passed, sample unavailable until Docker Desktop starts and `SWE_BENCH_ROOT` is set |
| Terminal-Bench preflight | passed, sample unavailable until Harbor is installed and Docker Desktop starts |
| Signed updater contract | passed |

Residual release work:

- Publish a new signed draft release and confirm `.sig` assets plus `latest.json`.
- Start Docker Desktop and run the explicit SWE-bench and Terminal-Bench samples.
- Execute the interactive desktop checklist on Linux and Windows.
