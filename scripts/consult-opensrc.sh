#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$repo_root/docs/opensrc-references.tsv"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/consult-opensrc.sh --list
  bash scripts/consult-opensrc.sh --all
  bash scripts/consult-opensrc.sh <topic> [topic...]

Examples:
  bash scripts/consult-opensrc.sh workspace session
  bash scripts/consult-opensrc.sh repo-reality lsp
  bash scripts/consult-opensrc.sh memory

The script resolves matching upstream source trees through opensrc.
It uses GITHUB_TOKEN or GH_TOKEN when present, otherwise it reads the
active GitHub CLI keyring token at runtime when gh is installed.
Inspect only the files relevant to the current slice, then record exact
paths and copy/adapt/reject decisions in source_pack.md before editing.
EOF
}

if [[ ! -f "$manifest" ]]; then
  printf 'Missing manifest: %s\n' "$manifest" >&2
  exit 1
fi

if [[ "${1:-}" == "--list" ]]; then
  column -t -s $'\t' "$manifest"
  exit 0
fi

if [[ $# -eq 0 ]]; then
  usage
  exit 2
fi

if command -v pnpm >/dev/null 2>&1; then
  opensrc_cmd=(pnpm dlx opensrc)
elif [[ -d "$HOME/.nvm/versions/node" ]]; then
  pnpm_path=""
  for candidate in "$HOME"/.nvm/versions/node/*/bin/pnpm; do
    if [[ -x "$candidate" ]]; then
      pnpm_path="$candidate"
    fi
  done
  if [[ -z "$pnpm_path" ]]; then
    printf 'opensrc is unavailable. Install it or make pnpm available on PATH.\n' >&2
    exit 1
  fi
  node_bin="$(dirname "$pnpm_path")"
  opensrc_cmd=(env "PATH=$node_bin:$PATH" "$pnpm_path" dlx opensrc)
elif command -v opensrc >/dev/null 2>&1; then
  opensrc_cmd=(opensrc)
else
  printf 'opensrc is unavailable. Install it or make pnpm available on PATH.\n' >&2
  exit 1
fi

tiers=()
topic_sets=()
repos=()
purposes=()
while IFS=$'\t' read -r tier topics repo purpose; do
  if [[ "$tier" == "tier" || -z "$tier" ]]; then
    continue
  fi

  haystack="$topics $repo $purpose"
  include=false
  for query in "$@"; do
    if [[ "$query" == "--all" || "$haystack" == *"$query"* ]]; then
      include=true
      break
    fi
  done

  if [[ "$include" != true ]]; then
    continue
  fi

  tiers+=("$tier")
  topic_sets+=("$topics")
  repos+=("$repo")
  purposes+=("$purpose")
done < "$manifest"

if [[ "${#repos[@]}" -eq 0 ]]; then
  printf 'No opensrc references matched: %s\n' "$*" >&2
  exit 1
fi

find_gh() {
  if command -v gh >/dev/null 2>&1; then
    command -v gh
    return
  fi

  for candidate in /opt/homebrew/bin/gh /usr/local/bin/gh; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  return 1
}

github_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
github_auth_source=""
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  github_auth_source="GITHUB_TOKEN"
elif [[ -n "${GH_TOKEN:-}" ]]; then
  github_auth_source="GH_TOKEN"
else
  gh_path="$(find_gh || true)"
  if [[ -n "$gh_path" ]] && github_token="$("$gh_path" auth token 2>/dev/null)"; then
    github_auth_source="gh keyring"
  else
    github_token=""
  fi
fi

run_opensrc() {
  if [[ -n "$github_token" ]]; then
    GITHUB_TOKEN="$github_token" "${opensrc_cmd[@]}" "$@"
  else
    "${opensrc_cmd[@]}" "$@"
  fi
}

if [[ -n "$github_auth_source" ]]; then
  printf 'opensrc GitHub authentication: %s\n' "$github_auth_source" >&2
else
  printf 'opensrc GitHub authentication: unauthenticated; GitHub API limits apply.\n' >&2
fi

paths=()
unresolved=0
batch_size="${OPENSRC_BATCH_SIZE:-5}"
for ((offset = 0; offset < ${#repos[@]}; offset += batch_size)); do
  batch=("${repos[@]:offset:batch_size}")
  if paths_output="$(run_opensrc path "${batch[@]}")"; then
    while IFS= read -r path; do
      paths+=("$path")
    done <<< "$paths_output"
    continue
  fi

  printf 'opensrc refresh unavailable for batch; using existing local cache where possible.\n' >&2
  for repo in "${batch[@]}"; do
    slug="${repo#github:}"
    cached_path=""
    for candidate in "$HOME/.opensrc/repos/github.com/$slug"/*; do
      if [[ -d "$candidate" ]]; then
        cached_path="$candidate"
        break
      fi
    done
    if [[ -z "$cached_path" ]]; then
      cached_path="FETCH_FAILED"
      unresolved=1
    fi
    paths+=("$cached_path")
  done
done

for ((index = 0; index < ${#repos[@]}; index += 1)); do
  printf '\n[%s] %s\n' "${tiers[$index]}" "${repos[$index]}"
  printf 'topics: %s\n' "${topic_sets[$index]}"
  printf 'use: %s\n' "${purposes[$index]}"
  printf 'path: %s\n' "${paths[$index]:-FETCH_FAILED}"
done

if [[ "${unresolved:-0}" -eq 1 ]]; then
  exit 1
fi
