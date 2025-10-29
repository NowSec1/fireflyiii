#!/usr/bin/env bash
set -euo pipefail

config_file=".push_config"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Error: script must be run inside a git repository." >&2
  exit 1
fi

if [[ ! -f "$config_file" ]]; then
  cat >&2 <<'USAGE'
No saved push configuration found.

Please run scripts/push_to_github.sh <github_repo_url> [branch] once to set it up.
USAGE
  exit 1
fi

# shellcheck disable=SC1090
source "$config_file"

repo_url="${REMOTE_URL:-}"
branch="${BRANCH:-}"

if [[ -z "$repo_url" || -z "$branch" ]]; then
  echo "Error: .push_config is missing REMOTE_URL or BRANCH." >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$repo_url"
else
  git remote add origin "$repo_url"
fi

echo "Reusing saved settings. Pushing branch '$branch' to '$repo_url'..."
git push origin "$branch"
