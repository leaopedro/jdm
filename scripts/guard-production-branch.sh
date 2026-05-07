#!/bin/sh

set -eu

protected_branch="${PROTECTED_BRANCH:-production}"

fail() {
  echo "Blocked: $1" >&2
  exit 1
}

current_branch() {
  git symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

case "${1:-}" in
  pre-commit)
    if [ "$(current_branch)" = "$protected_branch" ]; then
      fail "commits on '$protected_branch' are forbidden. Branch from 'main' and open a PR to 'main'."
    fi
    ;;
  pre-push)
    while IFS=' ' read -r local_ref local_oid remote_ref remote_oid; do
      if [ "$remote_ref" = "refs/heads/$protected_branch" ]; then
        fail "pushes to '$protected_branch' are forbidden. Push your branch and let the board promote 'main' to '$protected_branch'."
      fi
    done
    ;;
  *)
    echo "Usage: $0 <pre-commit|pre-push>" >&2
    exit 2
    ;;
esac
