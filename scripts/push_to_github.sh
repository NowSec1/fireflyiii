#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Error: script must be run inside a git repository." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  cat >&2 <<'USAGE'
Usage: scripts/push_to_github.sh <github_repo_url> [branch]

Example:
  scripts/push_to_github.sh git@github.com:your-user/fireflyiii.git main

The branch argument defaults to the current branch if omitted.
USAGE
  exit 1
fi

repo_url="$1"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
branch="${2:-$current_branch}"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$repo_url"
else
  git remote add origin "$repo_url"
fi

echo "Pushing branch '$branch' to '$repo_url'..."
git push -u origin "$branch"

config_file=".push_config"
{
  printf 'REMOTE_URL=%s\n' "$repo_url"
  printf 'BRANCH=%s\n' "$branch"
} >"$config_file"

echo "Saved push settings to $config_file. You can run scripts/push_again.sh to reuse them."
