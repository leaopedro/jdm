#!/bin/sh

set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

"$project_dir"/scripts/guard-branch-context.sh tool
