# Atlas V1 Release Qualification

Date: `2026-06-02`

## Automated Gate

Run:

```bash
bash scripts/release-qualify.sh
```

The gate covers frontend typecheck, frontend tests, production build, Rust check,
Rust clippy, Rust tests, the deterministic golden eval, desktop-contract smoke,
and accelerated-queue dependency review.

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

## Dependency Review

The accelerated queue adds one direct Rust runtime dependency: `url = "2"` for
lazy LSP file-URI conversion. It is already transitive in the desktop graph and
adds no boot service. Local memory, skills, MCP policy, metrics, eval, and smoke
layers add no runtime dependencies or background services.

## Recorded Result

Passed on macOS (`darwin`) on `2026-06-02`:

| Layer | Result |
| --- | --- |
| TypeScript | passed |
| Frontend Vitest | `180` passed |
| Production build | passed, `3188` modules transformed |
| Cargo check | passed |
| Cargo clippy | passed with `-D warnings` |
| Rust library tests | `135` passed, `2` intentional diagnostics ignored |
| Rust fixture harness | `3` passed |
| Golden eval | passed, narrow exit `1 -> 0`, one-line correction |
| Desktop contract smoke | passed on `darwin` |
| Dependency review | passed, `81` frontend and `32` Rust direct runtime dependencies |

Measured narrow qualification cost on this host:

| Check | Time |
| --- | --- |
| Golden eval | `2.20s` |
| Desktop contract smoke | `1.37s` |

Residual release work:

- Execute the interactive desktop checklist on macOS, Linux, and Windows.
- Review the existing Rollup circular-chunk warnings before declaring packaged desktop release signoff.
