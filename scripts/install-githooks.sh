#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SRC="$REPO_ROOT/.githooks/pre-commit"
HOOK_DST="$REPO_ROOT/.git/hooks/pre-commit"

if [[ ! -f "$HOOK_SRC" ]]; then
    echo "Hook source not found: $HOOK_SRC" >&2
    exit 1
fi

mkdir -p "$(dirname "$HOOK_DST")"
ln -sf "../../.githooks/pre-commit" "$HOOK_DST"
chmod +x "$HOOK_SRC" \
    "$REPO_ROOT/scripts/pre-commit-check.sh" \
    "$REPO_ROOT/scripts/check-secrets.sh"

echo "Installed pre-commit hook -> $HOOK_DST"
