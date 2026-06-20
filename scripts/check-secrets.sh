#!/usr/bin/env bash
# Scan staged (or given) files for common secret patterns.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $# -gt 0 ]]; then
    FILES=("$@")
else
    FILES=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && FILES+=("$line")
    done <<EOF
$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
EOF
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
    exit 0
fi

ALLOWLIST_REGEX='\.env\.example$|SECURITY\.md$|check-secrets\.sh$'

PATTERNS=(
    'ya29\.[0-9A-Za-z_-]{20,}'
    'GOCSPX-[0-9A-Za-z_-]{10,}'
    '"refresh_token"\s*:\s*"[^"]+"'
    '"client_secret"\s*:\s*"[^"]+"'
    'NOTION_TOKEN=secret_[a-zA-Z0-9]+'
    'VSCE_PAT=(?!your-vsce-token-here)[^\s#]+'
    'OVSX_PAT=(?!your-ovsx-token-here)[^\s#]+'
    'sk-[a-zA-Z0-9]{20,}'
    'ghp_[a-zA-Z0-9]{20,}'
    'github_pat_[a-zA-Z0-9_]{20,}'
)

FAILED=0

for file in "${FILES[@]}"; do
    [[ -f "$file" ]] || continue
    if [[ "$file" =~ $ALLOWLIST_REGEX ]]; then
        continue
    fi
    case "$file" in
        *.png|*.jpg|*.jpeg|*.gif|*.webp|*.vsix|*.woff|*.woff2|package-lock.json)
            continue
            ;;
    esac

    for pattern in "${PATTERNS[@]}"; do
        if grep -qE "$pattern" "$file" 2>/dev/null; then
            echo "[check-secrets] BLOCKED: possible secret in $file (pattern: $pattern)" >&2
            FAILED=1
        fi
    done
done

if [[ $FAILED -ne 0 ]]; then
    echo "[check-secrets] Remove secrets before committing. See SECURITY.md." >&2
    exit 1
fi

echo "[check-secrets] OK (${#FILES[@]} file(s) scanned)"
