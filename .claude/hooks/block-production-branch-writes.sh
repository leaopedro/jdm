#!/bin/sh

set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
branch="$(git -C "$project_dir" branch --show-current 2>/dev/null || true)"
message="BLOCKED: refusing to modify files on production branch. Switch to main and create a feature branch."

is_allowed_bash() {
  command="$1"

  case "$command" in
    "git branch --show-current"* | \
    "git branch"* | \
    "git diff"* | \
    "git log"* | \
    "git remote -v"* | \
    "git rev-parse"* | \
    "git show"* | \
    "git status"* | \
    "pwd"* | \
    "ls"* | \
    "find "* | \
    "rg "* | \
    "grep "* | \
    "sed -n "* | \
    "cat "* | \
    "head "* | \
    "tail "* | \
    "wc "* | \
    "stat "* | \
    "tree "* | \
    "jq "* | \
    "echo "* | \
    "printf "* | \
    "env"* | \
    "printenv"* | \
    "which "* | \
    "date"* | \
    "git checkout main"* | \
    "git switch main"*)
      return 0
      ;;
  esac

  return 1
}

[ "$branch" = "production" ] || exit 0

payload="$(cat)"
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"

case "$tool_name" in
  Edit|Write|MultiEdit)
    echo "$message" >&2
    exit 2
    ;;
  Bash)
    command="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"

    if is_allowed_bash "$command"; then
      exit 0
    fi

    echo "$message" >&2
    exit 2
    ;;
esac
