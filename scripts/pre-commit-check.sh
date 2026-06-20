#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[markdown-inline-preview] secret scan..."
"$ROOT/scripts/check-secrets.sh"

echo "[markdown-inline-preview] lint..."
npm run lint:error

echo "[markdown-inline-preview] compile..."
npm run compile

echo "[markdown-inline-preview] unit tests..."
npm run test:unit

echo "[markdown-inline-preview] pre-commit checks passed."
