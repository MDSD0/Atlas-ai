#!/usr/bin/env bash
# Atlas verification gate. Modes:
#   --fast     frontend typecheck + unit tests (quick loop)
#   --native   rust check + clippy + tests
#   --desktop  desktop contract smoke
#   --eval     deterministic golden eval
#   --deps     accelerated dependency review
#   --graph    optional graph-provider preflight
#   --bench    optional SWE-bench host preflight
#   --terminal-bench optional Terminal-Bench Harbor host preflight
#   --release  signed release contract preflight
#   --launch   advisory launchability audit
#   --all      everything required before merge
# See RELEASE_QUALIFICATION.md for the release gate.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mode="${1:---fast}"

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    printf 'node not found on PATH. Atlas needs Node >= 22.13 (pnpm requirement).\n' >&2
    exit 1
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$major" -lt 22 ]]; then
    printf 'Node %s is too old. Atlas needs Node >= 22.13.\n' "$(node --version)" >&2
    printf 'Fix: nvm use 22 (or install Node 22+) before running checks.\n' >&2
    exit 1
  fi
}

run() {
  printf '\n=== %s ===\n' "$*"
  "$@"
}

frontend() {
  require_node
  run pnpm exec tsc --noEmit
  run pnpm test
}

build() {
  require_node
  run pnpm build
}

native() {
  run cargo check --all-targets --locked --manifest-path src-tauri/Cargo.toml
  run cargo clippy --all-targets --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
  run cargo test --locked --manifest-path src-tauri/Cargo.toml
}

desktop() {
  run node scripts/desktop-smoke.mjs
}

evals() {
  run node scripts/run-v1-evals.mjs
}

deps() {
  run node scripts/review-dependencies.mjs
}

graph() {
  run node scripts/codebase-memory-preflight.mjs
}

bench() {
  run node scripts/external-benchmark-preflight.mjs
}

terminal_bench() {
  run node scripts/terminal-benchmark-preflight.mjs
}

release() {
  run node scripts/release-preflight.mjs
}

launch() {
  run node scripts/launchability-audit.mjs
}

case "$mode" in
  --fast)
    frontend
    ;;
  --native)
    native
    ;;
  --desktop)
    desktop
    ;;
  --eval)
    evals
    ;;
  --deps)
    deps
    ;;
  --graph)
    graph
    ;;
  --bench)
    bench
    ;;
  --terminal-bench)
    terminal_bench
    ;;
  --release)
    release
    ;;
  --launch)
    launch
    ;;
  --all)
    frontend
    build
    native
    evals
    desktop
    deps
    graph
    bench
    terminal_bench
    release
    launch
    ;;
  *)
    printf 'Usage: bash scripts/verify-atlas.sh [--fast|--native|--desktop|--eval|--deps|--graph|--bench|--terminal-bench|--release|--launch|--all]\n' >&2
    exit 2
    ;;
esac

printf '\nverify-atlas %s: OK\n' "$mode"
