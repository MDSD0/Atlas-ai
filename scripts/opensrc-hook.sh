#!/usr/bin/env bash
# PreToolUse hook: reminds Claude to consult opensrc upstreams before editing
# non-trivial Atlas subsystems. Maps file path -> topics -> manifest entries.
# Non-blocking: prints to stderr (Claude sees it as context), always exits 0.

set -euo pipefail

manifest="${CLAUDE_PROJECT_DIR:-$(pwd)}/docs/opensrc-references.tsv"
[[ -f "$manifest" ]] || exit 0

input="$(cat)"
file_path="$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[[ -n "$file_path" ]] || exit 0

case "$file_path" in
  */src-tauri/src/modules/*|*/src/modules/*) ;;
  *) exit 0 ;;
esac

case "$file_path" in
  *.test.*|*.spec.*|*.md|*.css|*.json|*.snap) exit 0 ;;
esac

topics=""
case "$file_path" in
  *workspace*|*fs/*)                 topics="workspace fs" ;;
  *shell*|*pty*)                     topics="shell terminal" ;;
  *terminal*)                        topics="terminal" ;;
  *lsp*)                             topics="lsp" ;;
  *memor*|*chatStore*|*sessions*)    topics="memory session" ;;
  *editor*|*codemirror*)             topics="editor" ;;
  *explorer*|*search*|*grep*|*watch*|*tree*) topics="repo-reality" ;;
  *tools/*edit*|*tools/*write*|*tools/*fs*)  topics="tools permissions edit" ;;
  *tools/*|*lib/agent*)              topics="agent-loop tools" ;;
  *mcp*)                             topics="mcp" ;;
  *skill*|*snippets*)                topics="skills" ;;
  *)                                 topics="agent-loop" ;;
esac

{
  printf '\n[source-parity] before editing %s, consult:\n' "$file_path"
  for topic in $topics; do
    awk -F'\t' -v t="$topic" '
      NR == 1 { next }
      $2 ~ t || $3 ~ t || $4 ~ t {
        printf "  - %s [%s] %s\n", $3, $1, $4
      }
    ' "$manifest"
  done
  printf '  resolve: bash scripts/consult-opensrc.sh %s\n' "$topics"
  printf '  record decision in source_pack.md (copy/adapt/wrap/study/reject) before merging.\n\n'
} >&2

exit 0
