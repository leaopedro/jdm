#!/bin/sh

set -eu

mode="${1:-tool}"
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
repo_root="$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null || pwd)"
branch="$(git -C "$project_dir" branch --show-current 2>/dev/null || true)"

issue_identifier=""
if [ -n "${PAPERCLIP_WAKE_PAYLOAD_JSON:-}" ] && command -v jq >/dev/null 2>&1; then
  issue_identifier="$(printf '%s' "$PAPERCLIP_WAKE_PAYLOAD_JSON" | jq -r '.issue.identifier // empty' 2>/dev/null || true)"
fi

issue_slug="$(printf '%s' "$issue_identifier" | tr '[:upper:]' '[:lower:]')"
issue_worktree=""
if [ -n "$issue_slug" ]; then
  candidate="$repo_root/.claude/worktrees/$issue_slug"
  if [ -d "$candidate" ]; then
    issue_worktree="$candidate"
  fi
fi

is_repo_root_session() {
  [ "$(cd "$project_dir" && pwd)" = "$repo_root" ]
}

is_protected_branch() {
  [ "$branch" = "main" ] || [ "$branch" = "production" ]
}

readonly_bash_allowed() {
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
    "git worktree list"* | \
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
    "git switch main"* | \
    "git checkout feat/"* | \
    "git switch feat/"* | \
    "git checkout fix/"* | \
    "git switch fix/"* | \
    "git checkout chore/"* | \
    "git switch chore/"* | \
    "git checkout refactor/"* | \
    "git switch refactor/"*)
      return 0
      ;;
  esac

  return 1
}

protected_branch_message() {
  if [ "$branch" = "production" ]; then
    printf '%s\n' "BLOCKED: refusing to modify files or commit on production. Switch to main, then create a feature branch or worktree."
    return
  fi

  if [ -n "$issue_worktree" ] && is_repo_root_session; then
    printf '%s\n' "BLOCKED: refusing to modify files or commit on root main while $issue_identifier has a worktree at $issue_worktree. Re-open the session in that worktree."
    return
  fi

  printf '%s\n' "BLOCKED: refusing to modify files or commit on main. Create or switch to a feature branch or issue worktree first."
}

case "$mode" in
  pre-commit)
    if is_protected_branch; then
      protected_branch_message >&2
      exit 1
    fi
    ;;
  tool)
    if ! is_protected_branch; then
      exit 0
    fi

    payload="$(cat)"
    tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // empty')"

    case "$tool_name" in
      Edit|Write|MultiEdit)
        protected_branch_message >&2
        exit 2
        ;;
      Bash)
        command="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"

        if readonly_bash_allowed "$command"; then
          exit 0
        fi

        protected_branch_message >&2
        exit 2
        ;;
    esac
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 64
    ;;
esac
