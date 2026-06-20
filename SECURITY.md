# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest on `main` | yes |

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue with exploit details.

Email or DM the maintainer privately, or open a GitHub Security Advisory on this repository if you have permission.

## What must never be committed

This repository is **public**. Do not commit:

- `.env` or any file containing API keys, PATs, or OAuth tokens
- `credentials.json`, `token.json`, or Google `client_secret_*.json`
- Private keys (`.pem`, `.key`, `.p12`)
- Local VSIX builds with unpublished signing material (`.vsix` is gitignored)

Safe to commit:

- `.env.example` with placeholder values only
- Public documentation and source code

## Local checks

Before pushing, run:

```bash
npm run setup:hooks   # once per clone
npm run check:secrets # scan staged files
```

Pre-commit hooks run lint, compile, unit tests, and a secret-pattern scan when `markdown-inline-preview/` files are staged (in the parent monorepo) or via `.githooks/pre-commit` in this repo.

## VSIX packaging

`.vscodeignore` excludes `.env`, `.env.example`, TypeScript sources, and test artifacts from published packages. Only compiled `out/` and required `media/` assets are bundled.
