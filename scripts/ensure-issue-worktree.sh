#!/bin/sh

set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
git_common_dir="$(git -C "$project_dir" rev-parse --git-common-dir 2>/dev/null || pwd)"

case "$git_common_dir" in
  /*)
    common_dir="$git_common_dir"
    ;;
  *)
    common_dir="$project_dir/$git_common_dir"
    ;;
esac

repo_root="$(cd "$common_dir/.." && pwd)"

issue_identifier="${1:-}"
if [ -z "$issue_identifier" ] && [ -n "${PAPERCLIP_WAKE_PAYLOAD_JSON:-}" ] && command -v jq >/dev/null 2>&1; then
  issue_identifier="$(printf '%s' "$PAPERCLIP_WAKE_PAYLOAD_JSON" | jq -r '.issue.identifier // empty' 2>/dev/null || true)"
fi

if [ -z "$issue_identifier" ]; then
  printf '%s\n' "usage: scripts/ensure-issue-worktree.sh <issue-id>" >&2
  exit 64
fi

issue_slug="$(printf '%s' "$issue_identifier" | tr '[:upper:]' '[:lower:]')"
worktree_path="$repo_root/.claude/worktrees/$issue_slug"

if [ -d "$worktree_path" ]; then
  printf '%s\n' "$worktree_path"
  exit 0
fi

git -C "$repo_root" worktree add --detach "$worktree_path" main >/dev/null
printf '%s\n' "$worktree_path"
