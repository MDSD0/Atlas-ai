#!/usr/bin/env bash
# Atlas verification gate. Modes:
#   --fast     frontend typecheck + unit tests (quick loop)
#   --native   rust check + clippy + tests
#   --desktop  packaged desktop smoke (not implemented yet)
#   --eval     scripted agent evals (not implemented yet)
#   --all      everything required before merge
# See ATLAS_EXECUTION_PLAN.md section 7.3.
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

case "$mode" in
  --fast)
    frontend
    ;;
  --native)
    native
    ;;
  --desktop)
    printf 'desktop smoke layer not implemented yet (planned: tests/desktop).\n' >&2
    ;;
  --eval)
    printf 'agent eval layer not implemented yet (planned: tests/evals).\n' >&2
    ;;
  --all)
    frontend
    build
    native
    ;;
  *)
    printf 'Usage: bash scripts/verify-atlas.sh [--fast|--native|--desktop|--eval|--all]\n' >&2
    exit 2
    ;;
esac

printf '\nverify-atlas %s: OK\n' "$mode"
