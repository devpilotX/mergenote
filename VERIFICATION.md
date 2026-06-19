# Verification — Core MCP Server

All checks run locally on 2026-06-18. Nothing deployed.

## 1. Build

```powershell
pnpm install; pnpm build
```
**Result:** PASS — all packages build clean including mcp-server.

## 2. Unit Tests

```powershell
pnpm test
```
**Result:** PASS — 46 tests across 6 files.

## 3. get_merged_prs (E2E, real GitHub API)

```powershell
node --env-file=.env test-e2e.mjs
# Tool call: get_merged_prs({ owner: "devpilotX", repo: "mergenote", from_date: "2026-05-19", to_date: "2026-06-18" })
```
**Result:** PASS — `isError: false`, returned `[]` (no merged PRs in range). 30-day range works without license.

## 4. generate_changelog (E2E)

```
# Tool call: generate_changelog({ prs: [...], template: "keepachangelog", version: "v1.0.0" })
```
**Result:** PASS — produced valid Keep-a-Changelog markdown:
```markdown
## [v1.0.0] - 2026-06-18

### Added

- feat: initial MCP server with 3 tools (#1) by @devpilotX
```

## 4. generate_changelog smart mode (E2E, vercel/next.js)

```powershell
node --env-file=.env compare.mjs
# Fetches 182 PRs from vercel/next.js, runs both raw and smart mode
```

**Result:** PASS

- **Raw mode**: 50 PRs dumped mechanically (3 sections: Fixed/Changed/Other), including bot PRs, CI changes, reverts
- **Smart mode**: Noise filtered (8 items removed: vercel-release-bot, CI changes, reverts-of-reverts, dep bumps), grouped into Bug Fixes / Improvements / Maintenance with rewrite prompt for host AI
- Deterministic fallback is clean and usable as-is
- Rewrite prompt instructs host AI to produce benefit-focused language

## 5. post_changelog (E2E, real GitHub API)

```
# Tool call: post_changelog({ owner: "devpilotX", repo: "mergenote", content: "...", action: "github_release", version: "v1.0.0-e2e-test", draft: true })
```
**Result:** PASS — created draft GitHub Release:
https://github.com/devpilotX/mergenote/releases/tag/untagged-7197119d3c54f0e394a2

## 6. No license required

MCP server starts and all tools work with NO `MERGENOTE_LICENSE_KEY` env var set. No license validation on startup.

**Result:** PASS

## 7. npm package structure

- Package name: `mergenote`
- Bin: `mergenote` → `dist/index.js`
- Shebang: `#!/usr/bin/env node`
- README: exists in package

**Result:** PASS

## Summary

| Check | Status |
|-------|--------|
| Build | PASS |
| Unit Tests (46) | PASS |
| get_merged_prs E2E | PASS |
| generate_changelog E2E | PASS |
| post_changelog E2E | PASS |
| No license gate | PASS |
| npm package ready | PASS |

**Nothing deployed. Payment/login/storefront intentionally excluded.**
